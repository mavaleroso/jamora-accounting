<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Payslip;
use App\Models\ShiftRoster;
use App\Services\People\EmployeeResolver;
use App\Services\People\LeaveService;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class EmployeePortalController extends Controller
{
    public function __construct(
        protected EmployeeResolver $employeeResolver,
        protected LeaveService $leaveService
    ) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $user = $request->user();

        // Safely resolve the employee strictly tied to this user within the entity
        $employee = $this->employeeResolver->forUser($user, $entityId);

        if (! $employee) {
            return Inertia::render('employee-management/portal/page', [
                'employee' => null,
                'upcomingShifts' => [],
                'recentLeaveRequests' => [],
                'recentPayslips' => [],
                'leaveBalances' => [],
                'recentDtr' => [],
                'attendanceRequests' => [],
                'leaveTypes' => LeaveType::where('is_active', true)->orderBy('sort_order')->get(),
            ]);
        }

        $upcomingShifts = ShiftRoster::query()
            ->where('employee_id', $employee->id)
            ->where('status', ShiftRoster::STATUS_PUBLISHED)
            ->where('roster_date', '>=', Carbon::today()->toDateString())
            ->orderBy('roster_date')
            ->limit(7)
            ->get();

        $recentLeaveRequests = LeaveRequest::query()
            ->with('type')
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

        $currentYear = (int) date('Y');
        $leaveBalances = LeaveBalance::where('employee_id', $employee->id)
            ->where('year', $currentYear)
            ->with('leaveType')
            ->get();

        $startOfWeek = Carbon::now()->startOfWeek()->toDateString();
        $endOfWeek = Carbon::now()->endOfWeek()->toDateString();
        $recentDtr = DtrEntry::where('employee_id', $employee->id)
            ->whereBetween('work_date', [$startOfWeek, $endOfWeek])
            ->orderByDesc('work_date')
            ->get();

        $attendanceRequests = AttendanceRequest::where('employee_id', $employee->id)
            ->orderByDesc('created_at')
            ->limit(5)
            ->get();

        $leaveTypes = LeaveType::where('is_active', true)->orderBy('sort_order')->get();

        return Inertia::render('employee-management/portal/page', [
            'employee' => [
                'id' => $employee->id,
                'name' => $employee->name,
                'code' => $employee->employee_code,
                'position' => $employee->position,
                'department' => $employee->department,
                'hire_date' => $employee->hire_date?->format('M d, Y'),
                'employment_status' => $employee->employment_status,
                'employment_type' => $employee->employment_type,
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
            'leaveBalances' => $leaveBalances,
            'recentDtr' => $recentDtr,
            'attendanceRequests' => $attendanceRequests,
            'leaveTypes' => $leaveTypes,
        ]);
    }

    public function fileLeave(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $user = $request->user();
        $employee = $this->employeeResolver->forUser($user, $entityId);

        if (! $employee) {
            return redirect()->back()->withErrors([
                'employee_id' => 'No active employee profile linked to your user account.',
            ]);
        }

        $validated = $request->validate([
            'leave_type_id' => ['nullable', 'exists:leave_types,id'],
            'leave_type' => ['nullable', 'string'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'half_day' => ['nullable', 'in:am,pm'],
            'reason' => ['required', 'string', 'max:500'],
            'attachment' => ['nullable', 'file', 'max:5120'],
        ]);

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

        return redirect()->back()->with('status', 'Leave request submitted successfully.');
    }

    public function cancelLeave(Request $request, LeaveRequest $leaveRequest, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $user = $request->user();
        $employee = $this->employeeResolver->forUser($user, $entityId);

        if (! $employee || $leaveRequest->employee_id !== $employee->id) {
            abort(403, 'Unauthorized.');
        }

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $this->leaveService->cancel($leaveRequest, $user, $validated['reason']);

        return redirect()->back()->with('status', 'Leave request cancelled.');
    }
}
