<?php

namespace App\Services\People;

use App\Models\AttendanceRequest;
use App\Models\LeaveRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Leave requests and day-level attendance requests as one feed, in one display shape.
 * Shared by Employee Requests and the employee portal so both show the same thing.
 */
class EmployeeRequestFeed
{
    public const EMPLOYEE_COLUMNS = 'employee:id,entity_id,employee_code,firstname,middlename,lastname,avatar,position,gender';

    /**
     * Both request tables as one queryable feed. Attendance "rejected" is reported as "declined".
     */
    public function query(?int $entityId): Builder
    {
        // reason / destination / type_name are carried only so history can be searched.
        $leave = DB::table('leave_requests')
            ->where('entity_id', $entityId)
            ->selectRaw("'leave' as kind, id, employee_id, status, created_at, start_date as date_from, reason, null as destination, (select name from leave_types where leave_types.id = leave_requests.leave_type_id) as type_name");

        $attendance = DB::table('attendance_requests')
            ->where('entity_id', $entityId)
            ->selectRaw("request_type as kind, id, employee_id, case when status = 'rejected' then 'declined' else status end as status, created_at, work_date as date_from, reason, destination, null as type_name");

        return DB::query()->fromSub($leave->unionAll($attendance), 'requests');
    }

    /**
     * Hydrate feed rows into display-ready items.
     */
    public function present(Collection $rows): Collection
    {
        $leaveIds = $rows->where('kind', 'leave')->pluck('id');
        $attendanceIds = $rows->where('kind', '!=', 'leave')->pluck('id');

        $leaves = LeaveRequest::query()
            ->with([self::EMPLOYEE_COLUMNS, 'type', 'approver:id,firstname,lastname', 'filer:id,firstname,lastname', 'canceller:id,firstname,lastname'])
            ->whereIn('id', $leaveIds)
            ->get()
            ->keyBy('id');

        $attendance = AttendanceRequest::query()
            ->with([self::EMPLOYEE_COLUMNS, 'dtrEntry', 'reviewer:id,firstname,lastname', 'filer:id,firstname,lastname'])
            ->whereIn('id', $attendanceIds)
            ->get()
            ->keyBy('id');
        AttendanceRequest::loadDayRecords($attendance);

        return $rows
            ->map(fn ($row) => $row->kind === 'leave'
                ? (($l = $leaves->get($row->id)) ? $this->presentLeave($l) : null)
                : (($a = $attendance->get($row->id)) ? $this->presentAttendance($a) : null))
            ->filter()
            ->values();
    }

    private function presentLeave(LeaveRequest $l): array
    {
        $name = fn (?User $u) => $u ? trim("{$u->firstname} {$u->lastname}") : null;

        return [
            'key' => "leave-{$l->id}",
            'source' => 'leave',
            'kind' => 'leave',
            'id' => $l->id,
            'status' => $l->status,
            'title' => $l->type?->name ?? ucfirst($l->leave_type).' Leave',
            'employee' => $l->employee,
            'date_from' => $l->start_date?->toDateString(),
            'date_to' => $l->end_date?->toDateString(),
            'reason' => $l->reason,
            'filed_at' => $l->created_at?->toIso8601String(),
            'filed_by' => $l->filed_by && $l->filed_by !== $l->employee?->user_id ? $name($l->filer) : null,
            'decided_by' => $l->status === LeaveRequest::STATUS_CANCELLED ? $name($l->canceller) : $name($l->approver),
            'decided_at' => ($l->status === LeaveRequest::STATUS_CANCELLED ? $l->cancelled_at : $l->approved_at)?->toIso8601String(),
            'remarks' => $l->status === LeaveRequest::STATUS_CANCELLED ? $l->cancellation_reason : $l->rejection_reason,
            'cancellable' => in_array($l->status, [LeaveRequest::STATUS_PENDING, LeaveRequest::STATUS_APPROVED], true),
            'details' => [
                'code' => $l->type?->code,
                'is_paid' => (bool) ($l->type?->is_paid ?? true),
                'days' => (float) $l->days_count,
                'half_day' => $l->half_day,
                'attachment_url' => $l->attachment_path ? route('employee-management.requests.leave.attachment', $l->id) : null,
            ],
        ];
    }

    private function presentAttendance(AttendanceRequest $a): array
    {
        $name = fn (?User $u) => $u ? trim("{$u->firstname} {$u->lastname}") : null;

        return [
            'key' => "attendance-{$a->id}",
            'source' => 'attendance',
            'kind' => $a->request_type,
            'id' => $a->id,
            'status' => $a->status === 'rejected' ? 'declined' : $a->status,
            'title' => $a->label(),
            'employee' => $a->employee,
            'date_from' => $a->work_date?->toDateString(),
            'date_to' => $a->work_date?->toDateString(),
            'reason' => $a->reason,
            'filed_at' => $a->created_at?->toIso8601String(),
            'filed_by' => $a->filed_by && $a->filed_by !== $a->employee?->user_id ? $name($a->filer) : null,
            'decided_by' => $name($a->reviewer),
            'decided_at' => $a->reviewed_at?->toIso8601String(),
            'remarks' => $a->review_remarks,
            'cancellable' => $a->status === 'pending'
                || ($a->status === AttendanceRequest::STATUS_NOTED && $a->work_date?->gte(Carbon::today())),
            'details' => [
                'time_in' => $a->requested_time_in,
                'break_out' => $a->requested_break_out,
                'break_in' => $a->requested_break_in,
                'time_out' => $a->requested_time_out,
                'ot_hours' => $a->requested_ot_hours !== null ? (float) $a->requested_ot_hours : null,
                'destination' => $a->destination,
                'attachment_url' => $a->attachment_path ? route('employee-management.requests.attendance.attachment', $a->id) : null,
                'rest_day' => (bool) $a->requested_rest_day,
                'dtr' => $a->dtrEntry?->only(['time_in', 'break_out', 'break_in', 'time_out', 'ot_hours', 'ot_hours_approved', 'scheduled_in', 'scheduled_out', 'tardiness_minutes']),
                'notice_status' => $a->notice_status,
                // Employee Handbook: no OT pay on a day the employee was late by more than this. Shown to the approver.
                'late_no_ot_minutes' => $a->request_type === AttendanceRequest::TYPE_OVERTIME ? (int) config('people.timekeeping.late_no_ot_minutes', 30) : null,
            ],
        ];
    }
}
