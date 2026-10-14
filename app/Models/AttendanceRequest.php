<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Employee-filed request that affects a single work day. Filed and reviewed through
 * App\Services\People\AttendanceRequestService. How each type uses the columns:
 *  - correction:        requested_* punches replace the ones on the DTR (missed / wrong punch).
 *  - overtime:          pre-approval filed today or ahead; requested_ot_hours become payable OT,
 *                       capped at OT actually rendered.
 *  - official_business: requested_time_in / requested_time_out = time away on company business,
 *                       destination = where. Fills missing punches so the day is not absent.
 *  - undertime:         filed before leaving; requested_time_out = approved early departure.
 *                       Undertime is still deducted.
 *  - schedule_change:   requested_time_in / requested_time_out = new shift, or requested_rest_day.
 *                       Publishes a roster entry for the day.
 */
class AttendanceRequest extends Model
{
    use BelongsToEntity;

    public const TYPE_CORRECTION = 'correction';

    public const TYPE_OVERTIME = 'overtime';

    public const TYPE_OFFICIAL_BUSINESS = 'official_business';

    public const TYPE_UNDERTIME = 'undertime';

    public const TYPE_SCHEDULE_CHANGE = 'schedule_change';

    public const TYPES = [
        self::TYPE_CORRECTION,
        self::TYPE_OVERTIME,
        self::TYPE_OFFICIAL_BUSINESS,
        self::TYPE_UNDERTIME,
        self::TYPE_SCHEDULE_CHANGE,
    ];

    public const LABELS = [
        self::TYPE_CORRECTION => 'Time correction',
        self::TYPE_OVERTIME => 'Overtime',
        self::TYPE_OFFICIAL_BUSINESS => 'Official business',
        self::TYPE_UNDERTIME => 'Undertime',
        self::TYPE_SCHEDULE_CHANGE => 'Change of schedule',
    ];

    protected $fillable = [
        'entity_id', 'employee_id', 'dtr_entry_id', 'request_type', 'work_date',
        'requested_time_in', 'requested_break_out', 'requested_break_in', 'requested_time_out',
        'requested_ot_hours', 'destination', 'requested_rest_day',
        'reason', 'status', 'filed_by', 'reviewed_by', 'reviewed_at', 'review_remarks',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date:Y-m-d',
            'requested_ot_hours' => 'decimal:2',
            'requested_rest_day' => 'boolean',
            'reviewed_at' => 'datetime',
        ];
    }

    public function label(): string
    {
        return self::LABELS[$this->request_type] ?? ucfirst(str_replace('_', ' ', $this->request_type));
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
