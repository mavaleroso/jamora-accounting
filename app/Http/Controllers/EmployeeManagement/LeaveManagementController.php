<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Services\People\EmployeeResolver;
use App\Services\People\LeaveService;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class LeaveManagementController extends Controller
{
    public function __construct(
        protected LeaveService $leaveService,
        protected EmployeeResolver $employeeResolver
    ) {}

    /**
     * Leave filing and approval moved to Employee Requests, which covers every request type.
     */
    public function index(Request $request): RedirectResponse
    {
        return redirect()->route('employee-management.requests.index', array_filter([
            'kind' => 'leave',
            'status' => $request->query('status'),
            'employee_id' => $request->query('employee_id'),
        ]));
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
            ...$this->leaveService->rules(),
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
