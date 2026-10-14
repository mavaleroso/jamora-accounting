<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Employee-filed request to correct a DTR (missed / wrong punch) or to render/approve overtime.
 */
class AttendanceRequest extends Model
{
    use BelongsToEntity;

    public const TYPE_CORRECTION = 'correction';

    public const TYPE_OVERTIME = 'overtime';

    protected $fillable = [
        'entity_id', 'employee_id', 'dtr_entry_id', 'request_type', 'work_date',
        'requested_time_in', 'requested_break_out', 'requested_break_in', 'requested_time_out',
        'requested_ot_hours', 'reason', 'status', 'filed_by', 'reviewed_by', 'reviewed_at', 'review_remarks',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date:Y-m-d',
            'requested_ot_hours' => 'decimal:2',
            'reviewed_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function dtrEntry(): BelongsTo
    {
        return $this->belongsTo(DtrEntry::class);
    }

    public function filer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'filed_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}

