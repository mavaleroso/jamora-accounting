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
        $restDays = $employee->restDayNumbers();

        foreach ($period as $date) {
            // Check rest day
            if (in_array($date->dayOfWeek, $restDays, true)) {
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
            // Check legacy employee table for initial VL / SL values if year is current
            $initialEntitled = (float) $leaveType->annual_entitlement;
            if ($year === (int) date('Y')) {
                if ($leaveType->code === 'VL' && $employee->vacation_leave_credits > 0) {
                    $initialEntitled = (float) $employee->vacation_leave_credits;
                } elseif ($leaveType->code === 'SL' && $employee->sick_leave_credits > 0) {
                    $initialEntitled = (float) $employee->sick_leave_credits;
                }
            }

            $balance = LeaveBalance::create([
                'entity_id' => $employee->entity_id,
                'employee_id' => $employee->id,
                'leave_type_id' => $leaveType->id,
                'year' => $year,
                'entitled' => $initialEntitled,
                'carried_over' => 0,
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
        }

        return $balance;
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

        // 1. Gender / Eligibility Checks
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

        $restDays = $employee->restDayNumbers();

        foreach ($period as $date) {
            $dateStr = $date->toDateString();

            // Skip rest days
            if (in_array($date->dayOfWeek, $restDays, true)) {
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

