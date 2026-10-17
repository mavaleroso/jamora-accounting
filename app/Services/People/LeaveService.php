<?php

namespace App\Services\People;

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveLedgerEntry;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use App\Support\EntityContext;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Service managing leave request validations, calendar working days calculations,
 * credit balance reservation / usage / restoration, and synchronisation to DTR records.
 */
class LeaveService
{
    public function __construct(
        protected AttendanceCalculator $attendanceCalculator,
        protected EntityContext $entityContext
    ) {}

    /**
     * Validation rules for filing a leave request (employee_id is resolved by the caller).
     */
    public function rules(): array
    {
        return [
            'leave_type_id' => ['nullable', 'exists:leave_types,id'],
            'leave_type' => ['nullable', 'string'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'half_day' => ['nullable', 'in:am,pm'],
            'reason' => ['required', 'string', 'max:500'],
            'attachment' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp,heic', 'max:5120'], // 5MB
        ];
    }

    /**
     * Resolve the LeaveType model for a request, supporting both new ID or legacy key.
     */
    public function resolveLeaveType(?int $leaveTypeId, ?string $legacyKey = null): LeaveType
    {
        if ($leaveTypeId) {
            $type = LeaveType::find($leaveTypeId);
            if ($type) {
                return $type;
            }
        }

        if ($legacyKey) {
            $code = LeaveType::codeForLegacyKey($legacyKey);
            $type = LeaveType::where('code', $code)->first();
            if ($type) {
                return $type;
            }
        }

        // Fallback default
        return LeaveType::where('code', 'VL')->firstOrFail();
    }

    /**
     * Compute exact deductible days between start_date and end_date.
     * Takes rest days and public holidays into account unless the leave type counts calendar days (e.g. Maternity).
     */
    public function calculateDays(
        Employee $employee,
        LeaveType $leaveType,
        string $startDate,
        string $endDate,
        ?string $halfDay = null
    ): float {
        $start = Carbon::parse($startDate)->startOfDay();
        $end = Carbon::parse($endDate)->startOfDay();

        if ($end->lt($start)) {
            throw ValidationException::withMessages([
                'end_date' => 'End date cannot be earlier than start date.',
            ]);
        }

        // Half day can only be applied to single day filings
        if ($halfDay && ! $start->equalTo($end)) {
            throw ValidationException::withMessages([
                'half_day' => 'Half-day selection is only allowed for single-day leave requests.',
            ]);
        }

        if ($halfDay && ! $leaveType->allow_half_day) {
            throw ValidationException::withMessages([
                'half_day' => "{$leaveType->name} does not allow half-day filings.",
            ]);
        }

        if ($halfDay) {
            return 0.5;
        }

        if ($leaveType->counts_calendar_days) {
            return (float) ($start->diffInDays($end) + 1);
        }

        $period = CarbonPeriod::create($start, $end);
        $days = 0.0;

        foreach ($period as $date) {
            // Rest days follow the published roster, then the employee's shift template / rest days.
            if ($this->attendanceCalculator->scheduleFor($employee, $date)->isRestDay) {
                continue;
            }

            // Check regular or special holiday
            $holiday = $this->attendanceCalculator->holidayFor($employee->entity_id, $date);
            if ($holiday) {
                continue;
            }

            $days += 1.0;
        }

        return $days;
    }

    /**
     * Get or initialize leave balance for employee, leave type and year.
     */
    public function getOrCreateBalance(Employee $employee, LeaveType $leaveType, int $year): LeaveBalance
    {
        $balance = LeaveBalance::withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->where('leave_type_id', $leaveType->id)
            ->where('year', $year)
            ->first();

        if (! $balance) {
            $initialEntitled = $this->openingEntitlement($employee, $leaveType, $year);
            $carried = $this->carryOver($employee, $leaveType, $year);

            $balance = LeaveBalance::create([
                'entity_id' => $employee->entity_id,
                'employee_id' => $employee->id,
                'leave_type_id' => $leaveType->id,
                'year' => $year,
                'entitled' => $initialEntitled,
                'carried_over' => $carried,
                'adjusted' => 0,
                'used' => 0,
                'reserved' => 0,
            ]);

            if ($initialEntitled > 0) {
                LeaveLedgerEntry::create([
                    'entity_id' => $employee->entity_id,
                    'employee_id' => $employee->id,
                    'leave_type_id' => $leaveType->id,
                    'year' => $year,
                    'action' => 'entitlement',
                    'days' => $initialEntitled,
                    'available_after' => $initialEntitled,
                    'remarks' => 'Initial annual entitlement',
                ]);
            }

            if ($carried > 0) {
                LeaveLedgerEntry::create([
                    'entity_id' => $employee->entity_id,
                    'employee_id' => $employee->id,
                    'leave_type_id' => $leaveType->id,
                    'year' => $year,
                    'action' => 'carry_over',
                    'days' => $carried,
                    'available_after' => $initialEntitled + $carried,
                    'remarks' => 'Unused credits carried over from '.($year - 1),
                ]);
            }
        }

        return $balance;
    }

    /**
     * Entitlement a balance opens with. The legacy employee VL / SL columns hold the credits brought in
     * at go-live, so they are used only for the employee's very first balance of that type; every
     * later year opens with the full annual entitlement (those columns shrink as leave is used).
     */
    public function openingEntitlement(Employee $employee, LeaveType $leaveType, int $year): float
    {
        $hasHistory = LeaveBalance::withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->where('leave_type_id', $leaveType->id)
            ->where('year', '!=', $year)
            ->exists();

        if (! $hasHistory && $year === (int) date('Y')) {
            if ($leaveType->code === 'VL' && $employee->vacation_leave_credits > 0) {
                return (float) $employee->vacation_leave_credits;
            }
            if ($leaveType->code === 'SL' && $employee->sick_leave_credits > 0) {
                return (float) $employee->sick_leave_credits;
            }
        }

        return $this->prorated($employee, $leaveType, $year);
    }

    /**
     * The annual entitlement, pro-rated in the year the employee was hired when the leave type says so:
     * the months left after the hire date (the hire month counts when hired by the 15th), to the nearest half day.
     */
    public function prorated(Employee $employee, LeaveType $leaveType, int $year): float
    {
        $entitlement = (float) $leaveType->annual_entitlement;
        $hired = $employee->hire_date;

        if (! $leaveType->prorate_first_year || ! $hired || $hired->year !== $year) {
            return $entitlement;
        }

        $months = 12 - $hired->month + ($hired->day <= 15 ? 1 : 0);

        return round($entitlement * $months / 12 * 2) / 2;
    }

    /**
     * Unused credits brought into a year from the year before, up to the leave type's max_carry_over.
     */
    public function carryOver(Employee $employee, LeaveType $leaveType, int $year): float
    {
        if ((float) $leaveType->max_carry_over <= 0) {
            return 0.0;
        }

        $previous = LeaveBalance::withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->where('leave_type_id', $leaveType->id)
            ->where('year', $year - 1)
            ->first();

        return $previous ? round(min((float) $leaveType->max_carry_over, max(0, (float) $previous->available)), 2) : 0.0;
    }

    /**
     * Leave types an employee can file: enabled on their employee record and matching their gender.
     * Service length is not checked here (shown as a note instead, enforced on filing).
     */
    public function appliesTo(Employee $employee, LeaveType $leaveType): bool
    {
        return $employee->allowsLeaveType($leaveType)
            && (! $leaveType->gender || ! $employee->gender || strtolower($leaveType->gender) === strtolower($employee->gender));
    }

    /**
     * Read-only balance sheet for display: existing balances, or what a first filing would open with.
     * Never creates rows. Pass $existing (keyed by leave_type_id) to avoid a query per employee.
     *
     * @param  Collection<int, LeaveType>  $types
     * @param  Collection<int, LeaveBalance>|null  $existing
     * @return array<int, array<string, mixed>>
     */
    public function balanceSummary(Employee $employee, int $year, Collection $types, ?Collection $existing = null): array
    {
        $existing ??= LeaveBalance::withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->where('year', $year)
            ->get()
            ->keyBy('leave_type_id');

        return $types
            ->filter(fn (LeaveType $type) => $this->appliesTo($employee, $type))
            ->map(function (LeaveType $type) use ($employee, $year, $existing) {
                $row = $existing->get($type->id);
                $entitled = $row ? (float) $row->entitled : $this->openingEntitlement($employee, $type, $year);
                $carried = $row ? (float) $row->carried_over : ($type->balance_tracked ? $this->carryOver($employee, $type, $year) : 0.0);
                $adjusted = (float) ($row->adjusted ?? 0);
                $used = (float) ($row->used ?? 0);
                $reserved = (float) ($row->reserved ?? 0);

                return [
                    'leave_type_id' => $type->id,
                    'code' => $type->code,
                    'name' => $type->name,
                    'is_paid' => $type->is_paid,
                    'balance_tracked' => $type->balance_tracked,
                    'entitled' => $entitled + $carried + $adjusted,
                    'used' => $used,
                    'reserved' => $reserved,
                    'available' => $type->balance_tracked ? round($entitled + $carried + $adjusted - $used - $reserved, 2) : null,
                    'max_days_per_filing' => $type->max_days_per_filing,
                    'service_note' => $type->min_service_months > 0 && $employee->serviceMonths(Carbon::today()) < $type->min_service_months
                        ? "Available after {$type->min_service_months} months of service"
                        : null,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * File a new leave request. Reserves credits and validates business rules.
     */
    public function file(
        Employee $employee,
        LeaveType $leaveType,
        array $attributes,
        ?User $filedByUser = null
    ): LeaveRequest {
        $startDate = $attributes['start_date'];
        $endDate = $attributes['end_date'];
        $halfDay = $attributes['half_day'] ?? null;
        $reason = $attributes['reason'] ?? '';
        $attachmentPath = $attributes['attachment_path'] ?? null;

        $start = Carbon::parse($startDate);
        $end = Carbon::parse($endDate);

        // 1. Enabled on the employee record / gender / eligibility checks
        if (! $employee->allowsLeaveType($leaveType)) {
            throw ValidationException::withMessages([
                'leave_type_id' => "{$leaveType->name} is not enabled for {$employee->name}. HR can enable it on the employee record in the Employee Directory.",
            ]);
        }

        if ($leaveType->gender && $employee->gender && strtolower($leaveType->gender) !== strtolower($employee->gender)) {
            throw ValidationException::withMessages([
                'leave_type_id' => "This leave type ({$leaveType->name}) is applicable for {$leaveType->gender} employees only.",
            ]);
        }

        if ($leaveType->min_service_months > 0 && $employee->serviceMonths($start) < $leaveType->min_service_months) {
            throw ValidationException::withMessages([
                'leave_type_id' => "Requires at least {$leaveType->min_service_months} months of service.",
            ]);
        }

        // 2. Minimum notice period
        if ($leaveType->min_notice_days > 0) {
            $noticeDays = Carbon::today()->diffInDays($start, false);
            if ($noticeDays < $leaveType->min_notice_days) {
                throw ValidationException::withMessages([
                    'start_date' => "Filing for {$leaveType->name} must be submitted at least {$leaveType->min_notice_days} days in advance.",
                ]);
            }
        }

        // 3. Overlap check with other active requests
        $hasOverlap = LeaveRequest::withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->whereIn('status', [LeaveRequest::STATUS_PENDING, LeaveRequest::STATUS_APPROVED])
            ->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                    ->orWhereBetween('end_date', [$startDate, $endDate])
                    ->orWhere(function ($sub) use ($startDate, $endDate) {
                        $sub->where('start_date', '<=', $startDate)
                            ->where('end_date', '>=', $endDate);
                    });
            })
            ->exists();

        if ($hasOverlap) {
            throw ValidationException::withMessages([
                'start_date' => 'You already have an existing pending or approved leave request covering these dates.',
            ]);
        }

        // 4. Calculate actual deductible days
        $daysCount = $this->calculateDays($employee, $leaveType, $startDate, $endDate, $halfDay);
        if ($daysCount <= 0) {
            throw ValidationException::withMessages([
                'days_count' => 'The selected date range contains only rest days or holidays (0 deductible days).',
            ]);
        }

        if ($leaveType->max_days_per_filing && $daysCount > $leaveType->max_days_per_filing) {
            throw ValidationException::withMessages([
                'days_count' => "Cannot file more than {$leaveType->max_days_per_filing} days at once for {$leaveType->name}.",
            ]);
        }

        // 5. Check Attachment requirements
        if ($leaveType->attachment_required_after_days !== null && $daysCount > $leaveType->attachment_required_after_days && empty($attachmentPath)) {
            throw ValidationException::withMessages([
                'attachment' => "A supporting document (medical certificate / proof) is required for {$leaveType->name} exceeding {$leaveType->attachment_required_after_days} day(s).",
            ]);
        }

        $year = (int) $start->year;

        return DB::transaction(function () use (
            $employee, $leaveType, $startDate, $endDate, $halfDay, $daysCount, $reason, $attachmentPath, $filedByUser, $year
        ) {
            // Reserve credits if balance tracked
            if ($leaveType->balance_tracked) {
                $balance = $this->getOrCreateBalance($employee, $leaveType, $year);
                if ($balance->available < $daysCount) {
                    throw ValidationException::withMessages([
                        'leave_type_id' => "Insufficient leave credits. Available: {$balance->available} day(s), Requested: {$daysCount} day(s).",
                    ]);
                }

                $balance->increment('reserved', $daysCount);
            }

            $leaveRequest = LeaveRequest::create([
                'entity_id' => $employee->entity_id,
                'employee_id' => $employee->id,
                'leave_type_id' => $leaveType->id,
                'leave_type' => $leaveType->legacyKey(),
                'start_date' => $startDate,
                'end_date' => $endDate,
                'half_day' => $halfDay,
                'days_count' => $daysCount,
                'reason' => $reason,
                'attachment_path' => $attachmentPath,
                'status' => LeaveRequest::STATUS_PENDING,
                'filed_by' => $filedByUser?->id,
            ]);

            if ($leaveType->balance_tracked) {
                $balance->refresh();
                LeaveLedgerEntry::create([
                    'entity_id' => $employee->entity_id,
                    'employee_id' => $employee->id,
                    'leave_type_id' => $leaveType->id,
                    'leave_request_id' => $leaveRequest->id,
                    'year' => $year,
                    'action' => 'reserve',
                    'days' => $daysCount,
                    'available_after' => $balance->available,
                    'remarks' => "Reserved for Leave Request #{$leaveRequest->id}",
                    'user_id' => $filedByUser?->id,
                ]);
            }

            return $leaveRequest;
        });
    }

    /**
     * Approve leave request (Single level - HR). Converts reservation to used credits and updates DTR.
     */
    public function approve(LeaveRequest $request, User $approver): LeaveRequest
    {
        if ($request->status !== LeaveRequest::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => 'Only pending leave requests can be approved.',
            ]);
        }

        // Prevent self-approval
        $employee = $request->employee;
        if ($employee && $employee->user_id && $employee->user_id === $approver->id) {
            throw ValidationException::withMessages([
                'approver' => 'Employees cannot approve their own leave requests.',
            ]);
        }

        $leaveType = $request->type ?? $this->resolveLeaveType($request->leave_type_id, $request->leave_type);
        $year = (int) Carbon::parse($request->start_date)->year;

        return DB::transaction(function () use ($request, $approver, $employee, $leaveType, $year) {
            $daysCount = (float) $request->days_count;

            if ($leaveType->balance_tracked) {
                $balance = $this->getOrCreateBalance($employee, $leaveType, $year);
                $balance->decrement('reserved', min($balance->reserved, $daysCount));
                $balance->increment('used', $daysCount);

                // Sync back to legacy employee columns
                if ($leaveType->code === 'VL') {
                    $employee->decrement('vacation_leave_credits', min($employee->vacation_leave_credits, $daysCount));
                } elseif ($leaveType->code === 'SL') {
                    $employee->decrement('sick_leave_credits', min($employee->sick_leave_credits, $daysCount));
                }

                $balance->refresh();
                LeaveLedgerEntry::create([
                    'entity_id' => $request->entity_id,
                    'employee_id' => $employee->id,
                    'leave_type_id' => $leaveType->id,
                    'leave_request_id' => $request->id,
                    'year' => $year,
                    'action' => 'use',
                    'days' => $daysCount,
                    'available_after' => $balance->available,
                    'remarks' => "Approved Leave Request #{$request->id}",
                    'user_id' => $approver->id,
                ]);
            }

            $request->update([
                'status' => LeaveRequest::STATUS_APPROVED,
                'approved_by' => $approver->id,
                'approved_at' => now(),
            ]);

            // Sync approved dates onto DTR entries so payroll sees them as on_leave
            $this->syncLeaveToDtr($request);

            return $request->fresh();
        });
    }

    /**
     * Decline leave request. Releases any reserved credits.
     */
    public function decline(LeaveRequest $request, User $reviewer, string $reason): LeaveRequest
    {
        if ($request->status !== LeaveRequest::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => 'Only pending leave requests can be declined.',
            ]);
        }

        $employee = $request->employee;
        $leaveType = $request->type ?? $this->resolveLeaveType($request->leave_type_id, $request->leave_type);
        $year = (int) Carbon::parse($request->start_date)->year;

        return DB::transaction(function () use ($request, $reviewer, $reason, $employee, $leaveType, $year) {
            $daysCount = (float) $request->days_count;

            if ($leaveType->balance_tracked) {
                $balance = $this->getOrCreateBalance($employee, $leaveType, $year);
                $balance->decrement('reserved', min($balance->reserved, $daysCount));

                $balance->refresh();
                LeaveLedgerEntry::create([
                    'entity_id' => $request->entity_id,
                    'employee_id' => $employee->id,
                    'leave_type_id' => $leaveType->id,
                    'leave_request_id' => $request->id,
                    'year' => $year,
                    'action' => 'release',
                    'days' => $daysCount,
                    'available_after' => $balance->available,
                    'remarks' => "Declined: {$reason}",
                    'user_id' => $reviewer->id,
                ]);
            }

            $request->update([
                'status' => LeaveRequest::STATUS_DECLINED,
                'approved_by' => $reviewer->id,
                'approved_at' => now(),
                'rejection_reason' => $reason,
            ]);

            return $request->fresh();
        });
    }

    /**
     * Cancel an active or pending leave request. Restores credits and detaches DTR entries.
     */
    public function cancel(LeaveRequest $request, User $user, string $reason): LeaveRequest
    {
        if (! in_array($request->status, [LeaveRequest::STATUS_PENDING, LeaveRequest::STATUS_APPROVED], true)) {
            throw ValidationException::withMessages([
                'status' => 'Only pending or approved leave requests can be cancelled.',
            ]);
        }

        // Credits cannot come back for days payroll has already paid as leave.
        if ($request->status === LeaveRequest::STATUS_APPROVED
            && DtrEntry::withoutEntityScope()->where('leave_request_id', $request->id)->where('status', DtrEntry::STATUS_LOCKED)->exists()) {
            throw ValidationException::withMessages([
                'status' => 'Payroll has already been approved for some of these days, so this leave can no longer be cancelled.',
            ]);
        }

        $employee = $request->employee;
        $leaveType = $request->type ?? $this->resolveLeaveType($request->leave_type_id, $request->leave_type);
        $year = (int) Carbon::parse($request->start_date)->year;
        $previousStatus = $request->status;

        return DB::transaction(function () use ($request, $user, $reason, $employee, $leaveType, $year, $previousStatus) {
            $daysCount = (float) $request->days_count;

            if ($leaveType->balance_tracked) {
                $balance = $this->getOrCreateBalance($employee, $leaveType, $year);

                if ($previousStatus === LeaveRequest::STATUS_PENDING) {
                    $balance->decrement('reserved', min($balance->reserved, $daysCount));
                    $action = 'release';
                } else {
                    $balance->decrement('used', min($balance->used, $daysCount));
                    $action = 'restore';

                    // Restore legacy columns
                    if ($leaveType->code === 'VL') {
                        $employee->increment('vacation_leave_credits', $daysCount);
                    } elseif ($leaveType->code === 'SL') {
                        $employee->increment('sick_leave_credits', $daysCount);
                    }
                }

                $balance->refresh();
                LeaveLedgerEntry::create([
                    'entity_id' => $request->entity_id,
                    'employee_id' => $employee->id,
                    'leave_type_id' => $leaveType->id,
                    'leave_request_id' => $request->id,
                    'year' => $year,
                    'action' => $action,
                    'days' => $daysCount,
                    'available_after' => $balance->available,
                    'remarks' => "Cancelled: {$reason}",
                    'user_id' => $user->id,
                ]);
            }

            $request->update([
                'status' => LeaveRequest::STATUS_CANCELLED,
                'cancelled_by' => $user->id,
                'cancelled_at' => now(),
                'cancellation_reason' => $reason,
            ]);

            // Detach leave from DTR entries and recompute
            if ($previousStatus === LeaveRequest::STATUS_APPROVED) {
                $dtrs = DtrEntry::withoutEntityScope()
                    ->where('leave_request_id', $request->id)
                    ->get();

                foreach ($dtrs as $dtr) {
                    if (! $dtr->isLocked()) {
                        $dtr->leave_request_id = null;
                        $this->attendanceCalculator->compute($dtr, $employee)->save();
                    }
                }
            }

            return $request->fresh();
        });
    }

    /**
     * Reflect approved leave onto DTR entries across dates.
     */
    public function syncLeaveToDtr(LeaveRequest $request): void
    {
        $employee = $request->employee;
        $start = Carbon::parse($request->start_date)->startOfDay();
        $end = Carbon::parse($request->end_date)->startOfDay();
        $period = CarbonPeriod::create($start, $end);

        foreach ($period as $date) {
            $dateStr = $date->toDateString();

            // Skip rest days (published roster first, as for attendance and payroll)
            if ($this->attendanceCalculator->scheduleFor($employee, $date)->isRestDay) {
                continue;
            }

            // Skip holidays
            if ($this->attendanceCalculator->holidayFor($employee->entity_id, $date)) {
                continue;
            }

            $dtr = DtrEntry::withoutEntityScope()
                ->where('employee_id', $employee->id)
                ->whereDate('work_date', $dateStr)
                ->first();

            if ($dtr && $dtr->isLocked()) {
                continue;
            }

            if (! $dtr) {
                $dtr = new DtrEntry([
                    'entity_id' => $employee->entity_id,
                    'employee_id' => $employee->id,
                    'work_date' => $dateStr,
                    'source' => 'system',
                ]);
            }

            $dtr->leave_request_id = $request->id;
            $dtr->attendance_status = 'on_leave';
            $dtr->is_absent = false;
            $this->attendanceCalculator->compute($dtr, $employee)->save();
        }
    }
}
