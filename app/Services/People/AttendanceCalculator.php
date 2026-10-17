<?php

namespace App\Services\People;

use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\ShiftRoster;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Validation\ValidationException;

/**
 * Single source of truth for timekeeping computations (web punches, manual entries,
 * CSV/biometric imports, corrections and the daily close).
 *
 * Rules (PH Labor Code / DOLE + company policy in config/people.php):
 *  - Schedule = published roster > employee default shift template > config default shift.
 *  - Tardiness counts from scheduled start once the grace period is exceeded.
 *  - Undertime = minutes left before scheduled end.
 *  - Regular hours are capped at the scheduled net hours and 8 hours (Art. 83).
 *  - OT rendered = work after scheduled end (min threshold, floored to blocks). Payable OT
 *    (ot_hours_approved) = all OT rendered on a day that has an approved overtime request.
 *    The request authorises overtime; the time clock decides how many hours.
 *  - Night differential = hours worked between 22:00 and 06:00 (Art. 86).
 *  - Day type combines rest day and holiday for premium computation.
 */
class AttendanceCalculator
{
    public const WORKED_STATUSES = ['present', 'late', 'undertime'];

    /**
     * Resolve the effective schedule for an employee on a date.
     */
    public function scheduleFor(Employee $employee, CarbonInterface|string $date): WorkSchedule
    {
        $date = $date instanceof CarbonInterface ? $date->copy() : Carbon::parse($date);
        $dateStr = $date->toDateString();

        $roster = ShiftRoster::query()
            ->withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->whereDate('roster_date', $dateStr)
            ->where('status', ShiftRoster::STATUS_PUBLISHED)
            ->first();

        if ($roster) {
            return new WorkSchedule(
                $roster->id,
                (string) $roster->shift_name,
                $roster->is_rest_day ? null : $this->normalizeTime($roster->shift_start),
                $roster->is_rest_day ? null : $this->normalizeTime($roster->shift_end),
                (int) ($roster->break_minutes ?? 60),
                (int) ($roster->grace_minutes ?? 5),
                (bool) $roster->is_rest_day,
                'roster',
            );
        }

        $isRestDay = in_array($date->dayOfWeek, $employee->restDayNumbers(), true);
        $template = $employee->default_shift_template_id
            ? $employee->defaultShiftTemplate()->withoutEntityScope()->first()
            : null;

        if ($template) {
            return new WorkSchedule(
                null,
                $isRestDay ? 'Rest Day' : $template->name,
                $isRestDay ? null : $this->normalizeTime($template->start_time),
                $isRestDay ? null : $this->normalizeTime($template->end_time),
                (int) $template->break_minutes,
                (int) $template->grace_minutes,
                $isRestDay,
                'template',
            );
        }

        $default = config('people.default_shift');

        return new WorkSchedule(
            null,
            $isRestDay ? 'Rest Day' : $default['name'],
            $isRestDay ? null : $default['start'],
            $isRestDay ? null : $default['end'],
            (int) $default['break_minutes'],
            (int) $default['grace_minutes'],
            $isRestDay,
            'default',
        );
    }

    public function holidayFor(?int $entityId, CarbonInterface|string $date): ?Holiday
    {
        $dateStr = $date instanceof CarbonInterface ? $date->toDateString() : Carbon::parse($date)->toDateString();

        return Holiday::query()
            ->applicableTo($entityId)
            ->whereDate('holiday_date', $dateStr)
            ->orderByDesc('entity_id')
            ->first();
    }

    public function dayType(bool $isRestDay, ?Holiday $holiday): string
    {
        $base = match ($holiday?->type) {
            Holiday::TYPE_REGULAR => 'regular_holiday',
            Holiday::TYPE_SPECIAL => 'special_holiday',
            default => null,
        };

        if ($base !== null) {
            return $isRestDay ? $base.'_rest_day' : $base;
        }

        return $isRestDay ? 'rest_day' : 'regular';
    }

    /**
     * Throw a validation error when a DTR can no longer be changed.
     */
    public function assertEditable(?DtrEntry $dtr, string $field = 'dtr'): void
    {
        if ($dtr && $dtr->isLocked()) {
            throw ValidationException::withMessages([
                $field => 'This time record is locked because payroll for its cut-off has already been computed.',
            ]);
        }
    }

    /**
     * Recompute every derived field of a DTR from its punches and schedule. Does not save.
     */
    public function compute(DtrEntry $dtr, ?Employee $employee = null): DtrEntry
    {
        $employee ??= Employee::query()->withoutEntityScope()->findOrFail($dtr->employee_id);
        $date = Carbon::parse($dtr->work_date)->startOfDay();
        $dateStr = $date->toDateString();

        $schedule = $this->scheduleFor($employee, $date);
        $holiday = $this->holidayFor($dtr->entity_id ?? $employee->entity_id, $date);
        $dayType = $this->dayType($schedule->isRestDay, $holiday);
        $isWorkingDay = $dayType === 'regular';

        $dtr->shift_roster_id = $schedule->rosterId;
        $dtr->scheduled_in = $schedule->start;
        $dtr->scheduled_out = $schedule->end;
        $dtr->day_type = $dayType;

        $hasIn = filled($dtr->time_in);
        $hasOut = filled($dtr->time_out);

        // Approved leave with no work rendered
        if ($dtr->leave_request_id && ! $hasIn && ! $hasOut) {
            return $this->zeroOut($dtr, 'on_leave', false);
        }

        if (! $hasIn && ! $hasOut) {
            if (! $isWorkingDay) {
                return $this->zeroOut($dtr, $holiday ? 'holiday' : 'rest_day', false);
            }

            return $this->zeroOut($dtr, 'absent', true);
        }

        $tardiness = 0;
        $undertime = 0;
        $regularMinutes = 0;
        $otMinutes = 0;
        $ndMinutes = 0;

        $schedIn = $schedule->start ? Carbon::parse($dateStr.' '.$schedule->start) : null;
        $schedOut = $schedule->end ? Carbon::parse($dateStr.' '.$schedule->end) : null;
        if ($schedIn && $schedOut && $schedOut->lte($schedIn)) {
            $schedOut->addDay();
        }

        // Half-day leave: only the other half of the shift is expected, so lateness and undertime
        // are measured against that half (AM leave -> afternoon, PM leave -> morning).
        $scheduledBreak = $schedule->breakMinutes;
        $halfDay = $dtr->leave_request_id
            ? LeaveRequest::query()->withoutEntityScope()->whereKey($dtr->leave_request_id)->value('half_day')
            : null;
        if ($halfDay && $isWorkingDay && $schedIn && $schedOut) {
            $halfNet = intdiv(max(0, (int) $schedIn->diffInMinutes($schedOut) - $scheduledBreak), 2);
            if ($halfDay === 'am') {
                $schedIn = $schedOut->copy()->subMinutes($halfNet);
            } else {
                $schedOut = $schedIn->copy()->addMinutes($halfNet);
            }
            $scheduledBreak = 0;
            $dtr->scheduled_in = $schedIn->format('H:i:s');
            $dtr->scheduled_out = $schedOut->format('H:i:s');
        }

        if ($hasIn && ! $hasOut) {
            if ($isWorkingDay && $schedIn) {
                $in = Carbon::parse($dateStr.' '.$this->normalizeTime($dtr->time_in));
                $tardiness = $this->lateMinutes($in, $schedIn, $schedule->graceMinutes);
            }

            $dtr->fill([
                'tardiness_minutes' => $tardiness,
                'undertime_minutes' => 0,
                'regular_hours' => 0,
                'ot_hours' => 0,
                'night_diff_hours' => 0,
                'attendance_status' => 'incomplete',
                'is_absent' => false,
            ]);

            return $dtr;
        }

        if (! $hasIn && $hasOut) {
            return $this->zeroOut($dtr, 'incomplete', false);
        }

        $in = Carbon::parse($dateStr.' '.$this->normalizeTime($dtr->time_in));
        $out = Carbon::parse($dateStr.' '.$this->normalizeTime($dtr->time_out));
        if ($out->lte($in)) {
            $out->addDay(); // overnight shift
        }

        $spanMinutes = $in->diffInMinutes($out);
        [$breakMinutes, $breakStart, $breakEnd] = $this->breakWindow($dtr, $dateStr, $in, $spanMinutes, $scheduledBreak);
        $workedMinutes = max(0, $spanMinutes - $breakMinutes);
        $regularCap = (int) config('people.timekeeping.regular_hours_per_day', 8) * 60;

        if ($isWorkingDay && $schedIn && $schedOut) {
            $tardiness = $this->lateMinutes($in, $schedIn, $schedule->graceMinutes);
            $undertime = $out->lt($schedOut) ? (int) $out->diffInMinutes($schedOut) : 0;
            $scheduledNet = max(0, $schedIn->diffInMinutes($schedOut) - $scheduledBreak);
            $regularMinutes = min($workedMinutes, $scheduledNet ?: $regularCap, $regularCap);

            $otStart = $in->gt($schedOut) ? $in : $schedOut;
            $otMinutes = $out->gt($otStart) ? (int) $otStart->diffInMinutes($out) : 0;
        } else {
            // Rest day / holiday work: first 8 hours at day premium, excess is OT.
            $regularMinutes = min($workedMinutes, $regularCap);
            $otMinutes = max(0, $workedMinutes - $regularCap);
        }

        $otMinutes = $this->applyOtPolicy($otMinutes);
        $ndMinutes = $this->nightDiffMinutes($in, $out, $breakStart, $breakEnd);

        $status = 'present';
        if ($tardiness > 0) {
            $status = 'late';
        } elseif ($undertime > 0) {
            $status = 'undertime';
        }

        $dtr->fill([
            'tardiness_minutes' => $tardiness,
            'undertime_minutes' => $undertime,
            'regular_hours' => round($regularMinutes / 60, 2),
            'ot_hours' => round($otMinutes / 60, 2),
            'night_diff_hours' => round($ndMinutes / 60, 2),
            'attendance_status' => $status,
            'is_absent' => false,
        ]);

        $this->syncApprovedOt($dtr);

        return $dtr;
    }

    /**
     * Payable OT is the OT actually rendered, but only on a day with an approved overtime request.
     * Called on every recompute so no other path (manual edit, import, approval) can grant OT.
     */
    public function syncApprovedOt(DtrEntry $dtr): DtrEntry
    {
        $dtr->ot_hours_approved = $this->hasApprovedOt($dtr->employee_id, $dtr->work_date) ? (float) $dtr->ot_hours : 0;

        return $dtr;
    }

    /**
     * Approved official business stretches the day to cover the time away (missing punches are filled,
     * an earlier start or later end replaces the punch). Recomputes; does not save.
     */
    public function applyOfficialBusiness(?DtrEntry $dtr, Employee $employee, AttendanceRequest $ob): DtrEntry
    {
        $dtr ??= new DtrEntry([
            'entity_id' => $ob->entity_id,
            'employee_id' => $employee->id,
            'work_date' => $ob->work_date->toDateString(),
        ]);

        // Whole-day official business credits the scheduled shift. Requests filed before that change
        // carry their own window, which still applies.
        $schedule = $this->scheduleFor($employee, $ob->work_date);
        $obIn = $this->normalizeTime($ob->requested_time_in) ?? $schedule->start;
        $obOut = $this->normalizeTime($ob->requested_time_out) ?? $schedule->end;
        $in = $this->normalizeTime($dtr->time_in);
        $out = $this->normalizeTime($dtr->time_out);

        if ($obIn && (! $in || $obIn < $in)) {
            $dtr->time_in = $obIn;
        }
        if ($obOut && (! $out || $obOut > $out)) {
            $dtr->time_out = $obOut;
        }

        $dtr->source = $dtr->source ?: 'official_business';
        $dtr->notes = trim(($dtr->notes ?? '')." [Official business: {$ob->destination}]");

        return $this->compute($dtr, $employee);
    }

    /**
     * Yesterday's record when it is a shift still running past midnight (checked in, not out, and
     * within the longest plausible shift). Breaks and the check-out after midnight belong to it.
     */
    public function openOvernightShift(int $employeeId, CarbonInterface $at): ?DtrEntry
    {
        $yesterday = $at->copy()->subDay()->toDateString();

        $dtr = DtrEntry::query()
            ->withoutEntityScope()
            ->where('employee_id', $employeeId)
            ->whereDate('work_date', $yesterday)
            ->whereNotNull('time_in')
            ->whereNull('time_out')
            ->first();

        if (! $dtr) {
            return null;
        }

        $started = Carbon::parse($yesterday.' '.$this->normalizeTime($dtr->time_in));
        $maxHours = (int) config('people.timekeeping.max_shift_hours', 18);

        return $started->diffInMinutes($at) <= $maxHours * 60 ? $dtr : null;
    }

    public function approvedOfficialBusiness(int $employeeId, CarbonInterface|string $date): ?AttendanceRequest
    {
        $dateStr = $date instanceof CarbonInterface ? $date->toDateString() : Carbon::parse($date)->toDateString();

        return AttendanceRequest::query()
            ->withoutEntityScope()
            ->where('employee_id', $employeeId)
            ->whereDate('work_date', $dateStr)
            ->where('request_type', AttendanceRequest::TYPE_OFFICIAL_BUSINESS)
            ->where('status', 'approved')
            ->first();
    }

    public function hasApprovedOt(int $employeeId, CarbonInterface|string $date): bool
    {
        $dateStr = $date instanceof CarbonInterface ? $date->toDateString() : Carbon::parse($date)->toDateString();

        return AttendanceRequest::query()
            ->withoutEntityScope()
            ->where('employee_id', $employeeId)
            ->whereDate('work_date', $dateStr)
            ->where('request_type', AttendanceRequest::TYPE_OVERTIME)
            ->where('status', 'approved')
            ->exists();
    }

    /**
     * End-of-day close: create DTR rows for rostered employees who did not report.
     *  - working day, no punch, no approved leave  -> absent (no work, no pay)
     *  - regular holiday (unworked)                 -> holiday (paid per Art. 94)
     *  - approved leave                             -> on_leave
     *  - approved official business                -> credited the whole scheduled day, even if punched
     *  - rest day / special non-working day         -> no row (no work, no pay; not an absence)
     *
     * @return array{absent:int, holiday:int, on_leave:int, official_business:int, skipped:int}
     */
    public function closeDay(int $entityId, CarbonInterface|string $date): array
    {
        $date = $date instanceof CarbonInterface ? $date->copy()->startOfDay() : Carbon::parse($date)->startOfDay();
        $dateStr = $date->toDateString();
        $result = ['absent' => 0, 'holiday' => 0, 'on_leave' => 0, 'official_business' => 0, 'skipped' => 0];

        $employees = Employee::query()
            ->withoutEntityScope()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->where('employment_status', 'active')
            ->where(fn ($q) => $q->whereNull('hire_date')->orWhereDate('hire_date', '<=', $dateStr))
            ->where(fn ($q) => $q->whereNull('separation_date')->orWhereDate('separation_date', '>', $dateStr))
            ->get();

        $holiday = $this->holidayFor($entityId, $date);

        foreach ($employees as $employee) {
            $dtr = DtrEntry::query()
                ->withoutEntityScope()
                ->where('employee_id', $employee->id)
                ->whereDate('work_date', $dateStr)
                ->first();

            if ($dtr && ($dtr->isLocked() || $dtr->leave_request_id)) {
                $result['skipped']++;

                continue;
            }

            // Approved official business: the employee worked off-site all day. Any punches made anyway
            // (e.g. checking in before leaving) only widen the day, so an unfinished record is completed.
            if ($ob = $this->approvedOfficialBusiness($employee->id, $dateStr)) {
                $this->applyOfficialBusiness($dtr, $employee, $ob)->save();
                $result['official_business']++;

                continue;
            }

            if ($dtr && (filled($dtr->time_in) || filled($dtr->time_out))) {
                $result['skipped']++;

                continue;
            }

            $leave = LeaveRequest::query()
                ->withoutEntityScope()
                ->where('employee_id', $employee->id)
                ->where('status', LeaveRequest::STATUS_APPROVED)
                ->whereDate('start_date', '<=', $dateStr)
                ->whereDate('end_date', '>=', $dateStr)
                ->first();

            $schedule = $this->scheduleFor($employee, $date);
            $dayType = $this->dayType($schedule->isRestDay, $holiday);

            if ($leave) {
                $status = 'on_leave';
            } elseif ($dayType === 'regular') {
                $status = 'absent';
            } elseif (str_starts_with($dayType, 'regular_holiday')) {
                $status = 'holiday';
            } else {
                $result['skipped']++;

                continue;
            }

            $dtr ??= new DtrEntry([
                'entity_id' => $entityId,
                'employee_id' => $employee->id,
                'work_date' => $dateStr,
            ]);

            $dtr->fill([
                'shift_roster_id' => $schedule->rosterId,
                'scheduled_in' => $schedule->start,
                'scheduled_out' => $schedule->end,
                'day_type' => $dayType,
                'leave_request_id' => $leave?->id,
                'source' => $dtr->source ?: 'system',
                'status' => $dtr->status ?: DtrEntry::STATUS_OPEN,
            ]);
            $this->zeroOut($dtr, $status, $status === 'absent');
            if ($status === 'absent') {
                $dtr->notes = trim(($dtr->notes ?? '').' [Auto: no punch on scheduled work day]');
            }
            $dtr->save();

            $result[$status]++;
        }

        return $result;
    }

    protected function zeroOut(DtrEntry $dtr, string $status, bool $absent): DtrEntry
    {
        $dtr->fill([
            'regular_hours' => 0,
            'ot_hours' => 0,
            'ot_hours_approved' => 0,
            'tardiness_minutes' => 0,
            'undertime_minutes' => 0,
            'night_diff_hours' => 0,
            'attendance_status' => $status,
            'is_absent' => $absent,
        ]);

        return $dtr;
    }

    protected function lateMinutes(Carbon $in, Carbon $schedIn, int $grace): int
    {
        if ($in->lte($schedIn)) {
            return 0;
        }

        $late = (int) $schedIn->diffInMinutes($in);

        return $late > $grace ? $late : 0;
    }

    /**
     * @return array{0:int,1:?Carbon,2:?Carbon} [break minutes, actual break start, actual break end]
     */
    protected function breakWindow(DtrEntry $dtr, string $dateStr, Carbon $in, int $spanMinutes, int $scheduledBreak): array
    {
        if (filled($dtr->break_out) && filled($dtr->break_in)) {
            $bo = Carbon::parse($dateStr.' '.$this->normalizeTime($dtr->break_out));
            if ($bo->lt($in)) {
                $bo->addDay();
            }
            $bi = Carbon::parse($dateStr.' '.$this->normalizeTime($dtr->break_in));
            if ($bi->lte($bo)) {
                $bi->addDay();
            }

            return [(int) $bo->diffInMinutes($bi), $bo, $bi];
        }

        $threshold = (int) config('people.timekeeping.auto_break_after_minutes', 300);

        return [$spanMinutes > $threshold ? $scheduledBreak : 0, null, null];
    }

    protected function applyOtPolicy(int $otMinutes): int
    {
        $minimum = (int) config('people.timekeeping.ot_minimum_minutes', 30);
        $block = max(1, (int) config('people.timekeeping.ot_block_minutes', 15));

        if ($otMinutes < $minimum) {
            return 0;
        }

        return intdiv($otMinutes, $block) * $block;
    }

    protected function nightDiffMinutes(Carbon $in, Carbon $out, ?Carbon $breakStart, ?Carbon $breakEnd): int
    {
        $ndStart = (string) config('people.timekeeping.night_diff_start', '22:00');
        $ndEnd = (string) config('people.timekeeping.night_diff_end', '06:00');

        $total = 0;
        $cursor = $in->copy()->subDay()->startOfDay();
        $last = $out->copy()->startOfDay();

        while ($cursor->lte($last)) {
            $wStart = Carbon::parse($cursor->toDateString().' '.$ndStart);
            $wEnd = Carbon::parse($cursor->toDateString().' '.$ndEnd);
            if ($wEnd->lte($wStart)) {
                $wEnd->addDay();
            }

            $total += $this->overlap($in, $out, $wStart, $wEnd);
            if ($breakStart && $breakEnd) {
                $total -= $this->overlap($breakStart, $breakEnd, $wStart, $wEnd);
            }

            $cursor->addDay();
        }

        return max(0, $total);
    }

    protected function overlap(Carbon $aStart, Carbon $aEnd, Carbon $bStart, Carbon $bEnd): int
    {
        $start = $aStart->gt($bStart) ? $aStart : $bStart;
        $end = $aEnd->lt($bEnd) ? $aEnd : $bEnd;

        return $end->gt($start) ? (int) $start->diffInMinutes($end) : 0;
    }

    public function normalizeTime(?string $time): ?string
    {
        if (blank($time)) {
            return null;
        }

        return Carbon::parse($time)->format('H:i:s');
    }
}
