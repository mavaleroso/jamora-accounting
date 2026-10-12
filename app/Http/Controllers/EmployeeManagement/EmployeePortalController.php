<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\Payslip;
use App\Models\ShiftRoster;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class EmployeePortalController extends Controller
{
    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $user = $request->user();

        // Find employee linked to this user
        $employee = Employee::query()
            ->where('entity_id', $entityId)
            ->where(function ($q) use ($user) {
                if ($user) {
                    $q->where('user_id', $user->id)
                        ->orWhere('email', $user->email);
                }
            })
            ->first();

        // Only fall back to first employee if manager or admin is previewing portal
        if (! $employee && $user && ($user->can('payroll.manage') || $user->can('leave.approve'))) {
            $employee = Employee::query()->where('entity_id', $entityId)->where('is_active', true)->first();
        }

        if (! $employee) {
            return Inertia::render('employee-management/portal/page', [
                'employee' => null,
                'upcomingShifts' => [],
                'recentLeaveRequests' => [],
                'recentPayslips' => [],
            ]);
        }

        $upcomingShifts = ShiftRoster::query()
            ->where('employee_id', $employee->id)
            ->where('roster_date', '>=', Carbon::today()->toDateString())
            ->orderBy('roster_date')
            ->limit(7)
            ->get();

        $recentLeaveRequests = LeaveRequest::query()
            ->where('employee_id', $employee->id)
            ->orderByDesc('created_at')
            ->limit(5)
            ->get();

        $recentPayslips = Payslip::query()
            ->with(['payrollRun.period'])
            ->where('employee_id', $employee->id)
            ->orderByDesc('id')
            ->limit(6)
            ->get();

        return Inertia::render('employee-management/portal/page', [
            'employee' => [
                'id' => $employee->id,
                'name' => $employee->name,
                'code' => $employee->employee_code,
                'position' => $employee->position,
                'department' => $employee->department,
                'hire_date' => $employee->hire_date?->format('M d, Y'),
                'employment_status' => $employee->employment_status,
                'biometric_id' => $employee->biometric_id,
                'email' => $employee->email,
                'phone' => $employee->phone,
                'bank_name' => $employee->bank_name,
                'bank_account_no' => $employee->bank_account_no,
                'vacation_leave_credits' => (float) $employee->vacation_leave_credits,
                'sick_leave_credits' => (float) $employee->sick_leave_credits,
                'basic_pay' => (float) $employee->basic_pay,
            ],
            'upcomingShifts' => $upcomingShifts,
            'recentLeaveRequests' => $recentLeaveRequests,
            'recentPayslips' => $recentPayslips,
        ]);
    }

    public function fileLeave(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'leave_type' => ['required', 'in:vacation,sick,emergency,maternity,paternity,bereavement'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'days_count' => ['required', 'numeric', 'min:0.5'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        $user = $request->user();
        if ($user && ! $user->can('leave.approve') && ! $user->can('payroll.manage')) {
            $currentUserEmployee = Employee::where('user_id', $user->id)
                ->orWhere('email', $user->email)
                ->first();

            if (! $currentUserEmployee) {
                return redirect()->back()->withErrors([
                    'employee_id' => 'No active employee profile linked to your user account.',
                ]);
            }

            $validated['employee_id'] = $currentUserEmployee->id;
        }

        $employee = Employee::findOrFail($validated['employee_id']);

        LeaveRequest::create([
            'entity_id' => $employee->entity_id,
            'employee_id' => $employee->id,
            'leave_type' => $validated['leave_type'],
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'],
            'days_count' => $validated['days_count'],
            'reason' => $validated['reason'],
            'status' => 'pending',
        ]);

        return redirect()->back()->with('status', 'Leave request submitted successfully.');
    }
}

