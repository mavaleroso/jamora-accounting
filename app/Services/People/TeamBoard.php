<?php

namespace App\Services\People;

use App\Models\AttendanceRequest;
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
     * @param  int|list<int>|null  $entityId  one company id, a list of company ids, or null for the current company
     * @return array{rows: array<int, array<string, mixed>>, counts: array<string, int>, holiday: ?string}
     */
    public function build(int|array|null $entityId): array
    {
        $now = Carbon::now();
        $today = $now->toDateString();

        $employees = Employee::query()
            ->withoutEntityScope()
            ->when(
                is_array($entityId),
                fn ($q) => $q->whereIn('entity_id', $entityId),
                fn ($q) => $q->where('entity_id', $entityId),
            )
            ->where('is_active', true)
            ->where('employment_status', 'active')
            ->where(fn ($q) => $q->whereNull('hire_date')->orWhereDate('hire_date', '<=', $today))
            ->with([
                'entity:id,code,name',
                'defaultShiftTemplate' => fn ($q) => $q->withoutGlobalScope('entity'),
            ])
            ->orderBy('lastname')
            ->get();

        $employeeIds = $employees->pluck('id');

        $dtrs = DtrEntry::query()
            ->withoutEntityScope()
            ->whereIn('employee_id', $employeeIds)
            ->whereDate('work_date', $today)
            ->get()
            ->keyBy('employee_id');

        $leaves = LeaveRequest::query()
            ->withoutEntityScope()
            ->with('type:id,name,code')
            ->whereIn('employee_id', $employeeIds)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->get()
            ->keyBy('employee_id');

        // Off-site all day on approved official business: not late, nothing to punch.
        $business = AttendanceRequest::query()
            ->withoutEntityScope()
            ->whereIn('employee_id', $employeeIds)
            ->where('request_type', AttendanceRequest::TYPE_OFFICIAL_BUSINESS)
            ->where('status', 'approved')
            ->whereDate('work_date', $today)
            ->get()
            ->keyBy('employee_id');

        $entityIds = $employees->pluck('entity_id')->filter()->unique()->values();
        $holidays = $entityIds->mapWithKeys(fn (int $id) => [$id => $this->calculator->holidayFor($id, $today)]);
        $holiday = is_int($entityId) ? $holidays->get($entityId) : $holidays->filter()->first();

        $rows = $employees->map(function (Employee $employee) use ($dtrs, $leaves, $business, $holidays, $now, $today) {
            $schedule = $this->calculator->scheduleFor($employee, $today);
            $dtr = $dtrs->get($employee->id);
            $leave = $leaves->get($employee->id);
            $ob = $business->get($employee->id);
            $empHoliday = $holidays->get($employee->entity_id);
            $start = $schedule->start ? Carbon::parse($today.' '.$schedule->start) : null;
            $lateBy = null;

            if ($ob) {
                $status = 'official_business';
            } elseif ($dtr?->time_out) {
                $status = 'done';
            } elseif ($dtr?->break_out && ! $dtr->break_in) {
                $status = 'on_break';
            } elseif ($dtr?->time_in || $dtr?->break_in) {
                $status = 'working';
            } elseif ($leave) {
                $status = 'on_leave';
            } elseif ($schedule->isRestDay) {
                $status = 'rest_day';
            } elseif ($empHoliday) {
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
                'employee' => $employee->only(['id', 'entity_id', 'employee_code', 'firstname', 'lastname', 'position', 'avatar_url']) + [
                    'name' => $employee->name,
                    'entity' => $employee->entity ? $employee->entity->only(['id', 'code', 'name']) : null,
                ],
                'status' => $status,
                'late_by' => $lateBy,
                'tardiness_minutes' => (int) ($dtr?->tardiness_minutes ?? 0),
                'schedule' => [
                    'shift_name' => $schedule->shiftName,
                    'start' => $schedule->start,
                    'end' => $schedule->end,
                    'break_start' => $schedule->breakStart,
                    'break_end' => $schedule->breakEnd,
                    'source' => $schedule->source,
                ],
                'break_off_schedule' => $schedule->isOffBreakSchedule($dtr?->break_out),
                'leave' => $leave ? ($leave->type?->name ?? $leave->leave_type) : null,
                'official_business' => $ob?->destination,
                'dtr' => $dtr?->only(['id', 'time_in', 'break_out', 'break_in', 'time_out', 'location_status', 'distance_meters', 'status']),
            ];
        })->values();

        $order = ['late' => 0, 'expected' => 1, 'working' => 2, 'on_break' => 3, 'official_business' => 4, 'done' => 5, 'absent' => 6, 'on_leave' => 7, 'holiday' => 8, 'rest_day' => 9];

        return [
            'rows' => $rows->sortBy(fn ($r) => $order[$r['status']] ?? 9)->values()->all(),
            'counts' => $rows->countBy('status')->all(),
            'holiday' => $holiday?->name,
            'generated_at' => $now->toIso8601String(),
        ];
    }
}
