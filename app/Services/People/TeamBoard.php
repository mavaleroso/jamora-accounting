<?php

namespace App\Services\People;

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\LeaveRequest;
use Carbon\Carbon;

/**
 * Live status of every active employee today (working, late, on leave...), shared by the
 * Time & Attendance team board and the Employee Management dashboard.
 */
class TeamBoard
{
    public function __construct(protected AttendanceCalculator $calculator) {}

    /**
     * Live status of every active employee today, for the team board.
     *
     * @return array{rows: array<int, array<string, mixed>>, counts: array<string, int>, holiday: ?string}
     */
    public function build(?int $entityId): array
    {
        $now = Carbon::now();
        $today = $now->toDateString();

        $employees = Employee::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->where('employment_status', 'active')
            ->where(fn ($q) => $q->whereNull('hire_date')->orWhereDate('hire_date', '<=', $today))
            ->with('defaultShiftTemplate')
            ->orderBy('lastname')
            ->get();

        $dtrs = DtrEntry::query()
            ->where('entity_id', $entityId)
            ->whereDate('work_date', $today)
            ->get()
            ->keyBy('employee_id');

        $leaves = LeaveRequest::query()
            ->withoutEntityScope()
            ->with('type:id,name,code')
            ->whereIn('employee_id', $employees->pluck('id'))
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->get()
            ->keyBy('employee_id');

        $holiday = $this->calculator->holidayFor($entityId, $today);

        $rows = $employees->map(function (Employee $employee) use ($dtrs, $leaves, $holiday, $now, $today) {
            $schedule = $this->calculator->scheduleFor($employee, $today);
            $dtr = $dtrs->get($employee->id);
            $leave = $leaves->get($employee->id);
            $start = $schedule->start ? Carbon::parse($today.' '.$schedule->start) : null;
            $lateBy = null;

            if ($dtr?->time_out) {
                $status = 'done';
            } elseif ($dtr?->break_out && ! $dtr->break_in) {
                $status = 'on_break';
            } elseif ($dtr?->time_in) {
                $status = 'working';
            } elseif ($leave) {
                $status = 'on_leave';
            } elseif ($schedule->isRestDay) {
                $status = 'rest_day';
            } elseif ($holiday) {
                $status = 'holiday';
            } elseif ($dtr?->is_absent) {
                $status = 'absent';
            } elseif ($start && $now->gt($start->copy()->addMinutes($schedule->graceMinutes))) {
                $status = 'late';
                $lateBy = (int) $start->diffInMinutes($now);
            } else {
                $status = 'expected';
            }

            return [
                'employee' => $employee->only(['id', 'employee_code', 'firstname', 'lastname', 'position', 'department', 'avatar_url']) + ['name' => $employee->name],
                'status' => $status,
                'late_by' => $lateBy,
                'tardiness_minutes' => (int) ($dtr?->tardiness_minutes ?? 0),
                'schedule' => [
                    'shift_name' => $schedule->shiftName,
                    'start' => $schedule->start,
                    'end' => $schedule->end,
                    'source' => $schedule->source,
                ],
                'leave' => $leave ? ($leave->type?->name ?? $leave->leave_type) : null,
                'dtr' => $dtr?->only(['id', 'time_in', 'break_out', 'break_in', 'time_out', 'location_status', 'distance_meters', 'status']),
            ];
        })->values();

        $order = ['late' => 0, 'expected' => 1, 'working' => 2, 'on_break' => 3, 'done' => 4, 'absent' => 5, 'on_leave' => 6, 'holiday' => 7, 'rest_day' => 8];

        return [
            'rows' => $rows->sortBy(fn ($r) => $order[$r['status']] ?? 9)->values()->all(),
            'counts' => $rows->countBy('status')->all(),
            'holiday' => $holiday?->name,
            'generated_at' => $now->toIso8601String(),
        ];
    }
}
