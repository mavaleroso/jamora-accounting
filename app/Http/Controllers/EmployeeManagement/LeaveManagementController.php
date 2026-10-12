<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LeaveManagementController extends Controller
{
    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $status = $request->get('status');
        $employeeId = $request->get('employee_id');

        $user = $request->user();
        $isApprover = $user && ($user->can('leave.approve') || $user->can('payroll.manage'));

        $currentUserEmployee = null;
        if ($user) {
            $currentUserEmployee = Employee::where('entity_id', $entityId)
                ->where(function ($q) use ($user) {
                    $q->where('user_id', $user->id)
                        ->orWhere('email', $user->email);
                })
                ->first(['id', 'employee_code', 'firstname', 'lastname', 'position', 'vacation_leave_credits', 'sick_leave_credits']);
        }

        if (! $isApprover && $currentUserEmployee) {
            $employeeId = $currentUserEmployee->id;
        }

        $query = LeaveRequest::query()
            ->with(['employee:id,employee_code,firstname,lastname,position,department,vacation_leave_credits,sick_leave_credits', 'approver:id,firstname,lastname'])
            ->where('entity_id', $entityId)
            ->orderByDesc('created_at');

        if ($status) {
            $query->where('status', $status);
        }

        if ($employeeId) {
            $query->where('employee_id', $employeeId);
        }

        $requests = $query->paginate(15)->withQueryString();

        if ($isApprover) {
            $employees = Employee::query()
                ->where('entity_id', $entityId)
                ->where('is_active', true)
                ->orderBy('lastname')
                ->get(['id', 'employee_code', 'firstname', 'lastname', 'position', 'vacation_leave_credits', 'sick_leave_credits']);
        } else {
            $employees = $currentUserEmployee ? collect([$currentUserEmployee]) : collect();
        }

        $countQuery = LeaveRequest::where('entity_id', $entityId);
        if (! $isApprover && $currentUserEmployee) {
            $countQuery->where('employee_id', $currentUserEmployee->id);
        }

        $pendingCount = (clone $countQuery)->where('status', 'pending')->count();
        $approvedCount = (clone $countQuery)->where('status', 'approved')->count();
        $declinedCount = (clone $countQuery)->where('status', 'declined')->count();

        return Inertia::render('employee-management/leave/page', [
            'requests' => $requests,
            'employees' => $employees,
            'currentUserEmployee' => $currentUserEmployee,
            'counts' => [
                'pending' => $pendingCount,
                'approved' => $approvedCount,
                'declined' => $declinedCount,
            ],
            'filters' => [
                'status' => $status,
                'employee_id' => $employeeId,
            ],
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();

        $validated = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'leave_type' => ['required', 'in:vacation,sick,emergency,maternity,paternity,bereavement'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'days_count' => ['required', 'numeric', 'min:0.5'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $user = $request->user();
        $isApprover = $user && ($user->can('leave.approve') || $user->can('payroll.manage'));

        if (! $isApprover) {
            $currentUserEmployee = Employee::where('entity_id', $entityId)
                ->where(function ($q) use ($user) {
                    if ($user) {
                        $q->where('user_id', $user->id)
                            ->orWhere('email', $user->email);
                    }
                })
                ->first();

            if (! $currentUserEmployee) {
                return redirect()->back()->withErrors([
                    'employee_id' => 'No active employee profile linked to your user account.',
                ]);
            }

            $validated['employee_id'] = $currentUserEmployee->id;
        }

        LeaveRequest::create([
            'entity_id' => $entityId,
            'employee_id' => $validated['employee_id'],
            'leave_type' => $validated['leave_type'],
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'],
            'days_count' => $validated['days_count'],
            'reason' => $validated['reason'],
            'status' => 'pending',
        ]);

        return redirect()->back()->with('status', 'Leave request filed successfully.');
    }

    public function updateStatus(Request $request, LeaveRequest $leaveRequest): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:approved,declined'],
            'rejection_reason' => ['nullable', 'string', 'max:255'],
        ]);

        if ($validated['status'] === 'approved') {
            return $this->approve($request, $leaveRequest);
        }

        if (empty($validated['rejection_reason'])) {
            $request->merge(['rejection_reason' => 'Declined by manager.']);
        }

        return $this->decline($request, $leaveRequest);
    }

    public function approve(Request $request, LeaveRequest $leaveRequest): RedirectResponse
    {
        $leaveRequest->update([
            'status' => 'approved',
            'approved_by' => $request->user()?->id,
            'approved_at' => now(),
        ]);

        // Deduct from employee leave credits
        $employee = $leaveRequest->employee;
        if ($employee) {
            if ($leaveRequest->leave_type === 'vacation') {
                $employee->decrement('vacation_leave_credits', min($employee->vacation_leave_credits, $leaveRequest->days_count));
            } elseif ($leaveRequest->leave_type === 'sick') {
                $employee->decrement('sick_leave_credits', min($employee->sick_leave_credits, $leaveRequest->days_count));
            }
        }

        return redirect()->back()->with('status', 'Leave request approved.');
    }

    public function decline(Request $request, LeaveRequest $leaveRequest): RedirectResponse
    {
        $validated = $request->validate([
            'rejection_reason' => ['required', 'string', 'max:255'],
        ]);

        $leaveRequest->update([
            'status' => 'declined',
            'approved_by' => $request->user()?->id,
            'approved_at' => now(),
            'rejection_reason' => $validated['rejection_reason'],
        ]);

        return redirect()->back()->with('status', 'Leave request declined.');
    }
}

