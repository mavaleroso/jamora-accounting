<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Daily Time Record.
 *
 * Lifecycle (status): open -> approved | rejected -> locked (locked once the cut-off's payroll is approved).
 * A rejected day is not credited: payroll treats it like an absence on a scheduled day.
 * attendance_status: present | late | undertime | absent | on_leave | rest_day | holiday | incomplete
 * day_type: regular | rest_day | special_holiday | special_holiday_rest_day | regular_holiday | regular_holiday_rest_day
 * ot_hours = OT rendered (computed from punches); ot_hours_approved = OT payable (via approved OT request).
 */
class DtrEntry extends Model
{
    use BelongsToEntity;

    public const STATUS_OPEN = 'open';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_LOCKED = 'locked';

    protected $fillable = [
        'entity_id', 'employee_id', 'payroll_period_id', 'shift_roster_id', 'work_date',
        'scheduled_in', 'scheduled_out',
        'time_in', 'break_out', 'break_in', 'time_out',
        'regular_hours', 'ot_hours', 'ot_hours_approved', 'tardiness_minutes', 'undertime_minutes',
        'night_diff_hours', 'over_break_minutes', 'day_type', 'attendance_status', 'leave_request_id', 'is_absent',
        'source', 'in_latitude', 'in_longitude', 'out_latitude', 'out_longitude',
        'distance_meters', 'location_status', 'status', 'approved_by', 'approved_at', 'notes', 'accomplishment',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date:Y-m-d',
            'regular_hours' => 'decimal:2',
            'ot_hours' => 'decimal:2',
            'ot_hours_approved' => 'decimal:2',
            'tardiness_minutes' => 'decimal:2',
            'undertime_minutes' => 'decimal:2',
            'night_diff_hours' => 'decimal:2',
            'over_break_minutes' => 'integer',
            'distance_meters' => 'decimal:2',
            'is_absent' => 'boolean',
            'approved_at' => 'datetime',
        ];
    }

    public function isLocked(): bool
    {
        return $this->status === self::STATUS_LOCKED;
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function roster(): BelongsTo
    {
        return $this->belongsTo(ShiftRoster::class, 'shift_roster_id');
    }

    public function leaveRequest(): BelongsTo
    {
        return $this->belongsTo(LeaveRequest::class);
    }

    public function payrollPeriod(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
