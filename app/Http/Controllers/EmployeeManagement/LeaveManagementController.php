<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Services\People\EmployeeResolver;
use App\Services\People\LeaveService;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class LeaveManagementController extends Controller
{
    public function __construct(
        protected LeaveService $leaveService,
        protected EmployeeResolver $employeeResolver
    ) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $status = $request->get('status');
        $employeeId = $request->get('employee_id');
        $year = (int) $request->get('year', date('Y'));

        $user = $request->user();
        $isApprover = $this->employeeResolver->isHr($user, 'leave.approve');
        $currentUserEmployee = $this->employeeResolver->forUser($user, $entityId);

        if (! $isApprover && $currentUserEmployee) {
            $employeeId = $currentUserEmployee->id;
        }

        $query = LeaveRequest::query()
            ->with([
                'employee:id,employee_code,firstname,lastname,position,department,gender',
                'approver:id,firstname,lastname',
                'filer:id,firstname,lastname',
                'type',
            ])
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
                ->get(['id', 'employee_code', 'firstname', 'lastname', 'position', 'gender']);
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
        $cancelledCount = (clone $countQuery)->where('status', 'cancelled')->count();

        // Leave Types Catalogue
        $leaveTypes = LeaveType::where('is_active', true)->orderBy('sort_order')->get();

        // Balances for the current / selected employee
        $selectedEmployeeId = $employeeId ?: $currentUserEmployee?->id;
        $balances = [];
        if ($selectedEmployeeId) {
            $balances = LeaveBalance::where('entity_id', $entityId)
                ->where('employee_id', $selectedEmployeeId)
                ->where('year', $year)
                ->with('leaveType')
                ->get();
        }

        return Inertia::render('employee-management/leave/page', [
            'requests' => $requests,
            'employees' => $employees,
            'currentUserEmployee' => $currentUserEmployee,
            'leaveTypes' => $leaveTypes,
            'balances' => $balances,
            'selectedYear' => $year,
            'counts' => [
                'pending' => $pendingCount,
                'approved' => $approvedCount,
                'declined' => $declinedCount,
                'cancelled' => $cancelledCount,
            ],
            'filters' => [
                'status' => $status,
                'employee_id' => $employeeId,
                'year' => $year,
            ],
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $user = $request->user();
        $isApprover = $this->employeeResolver->isHr($user, 'leave.approve');

        if (! $isApprover || ! $request->filled('employee_id')) {
            $currentUserEmployee = $this->employeeResolver->forUser($user, $entityId);
            if (! $currentUserEmployee && ! $isApprover) {
                return redirect()->back()->withErrors([
                    'employee_id' => 'No active employee profile linked to your user account.',
                ]);
            }
            if ($currentUserEmployee) {
                $request->merge(['employee_id' => $currentUserEmployee->id]);
            }
        }

        $validated = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'leave_type_id' => ['nullable', 'exists:leave_types,id'],
            'leave_type' => ['nullable', 'string'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'half_day' => ['nullable', 'in:am,pm'],
            'reason' => ['required', 'string', 'max:500'],
            'attachment' => ['nullable', 'file', 'max:5120'], // 5MB
        ]);

        $employee = Employee::where('entity_id', $entityId)->findOrFail($validated['employee_id']);
        $leaveType = $this->leaveService->resolveLeaveType($validated['leave_type_id'] ?? null, $validated['leave_type'] ?? null);

        $attachmentPath = null;
        if ($request->hasFile('attachment')) {
            $attachmentPath = $request->file('attachment')->store('leave-attachments', 'public');
        }

        $this->leaveService->file(
            $employee,
            $leaveType,
            [
                'start_date' => $validated['start_date'],
                'end_date' => $validated['end_date'],
                'half_day' => $validated['half_day'] ?? null,
                'reason' => $validated['reason'],
                'attachment_path' => $attachmentPath,
            ],
            $user
        );

        return redirect()->back()->with('status', 'Leave request filed and credits reserved successfully.');
    }

    public function updateStatus(Request $request, LeaveRequest $leaveRequest, EntityContext $entityContext): RedirectResponse
    {
        if ($leaveRequest->entity_id !== $entityContext->id()) {
            abort(403);
        }

        $validated = $request->validate([
            'status' => ['required', 'in:approved,declined,cancelled'],
            'rejection_reason' => ['nullable', 'string', 'max:255'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $user = $request->user();

        if ($validated['status'] === 'approved') {
            $this->leaveService->approve($leaveRequest, $user);

            return redirect()->back()->with('status', 'Leave request approved and reflected in DTR.');
        }

        if ($validated['status'] === 'declined') {
            $reason = $validated['rejection_reason'] ?? $validated['reason'] ?? 'Declined by HR manager.';
            $this->leaveService->decline($leaveRequest, $user, $reason);

            return redirect()->back()->with('status', 'Leave request declined.');
        }

        if ($validated['status'] === 'cancelled') {
            $reason = $validated['rejection_reason'] ?? $validated['reason'] ?? 'Cancelled by employee/manager.';
            $this->leaveService->cancel($leaveRequest, $user, $reason);

            return redirect()->back()->with('status', 'Leave request cancelled and credits restored.');
        }

        return redirect()->back();
    }

    public function approve(Request $request, LeaveRequest $leaveRequest, EntityContext $entityContext): RedirectResponse
    {
        return $this->updateStatus($request->merge(['status' => 'approved']), $leaveRequest, $entityContext);
    }

    public function decline(Request $request, LeaveRequest $leaveRequest, EntityContext $entityContext): RedirectResponse
    {
        return $this->updateStatus($request->merge(['status' => 'declined']), $leaveRequest, $entityContext);
    }

    public function cancel(Request $request, LeaveRequest $leaveRequest, EntityContext $entityContext): RedirectResponse
    {
        return $this->updateStatus($request->merge(['status' => 'cancelled']), $leaveRequest, $entityContext);
    }
}
