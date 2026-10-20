<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;

/**
 * Employee-filed request that affects a single work day. Filed and reviewed through
 * App\Services\People\AttendanceRequestService. How each type uses the columns:
 *  - correction:        requested_* punches replace the ones on the DTR (missed / wrong punch).
 *  - overtime:          pre-approval filed today or ahead, without hours: once approved, all OT
 *                       rendered that day is payable. requested_ot_hours is only set on old requests.
 *  - official_business: the whole scheduled day is worked off-site at destination; no clock-in needed.
 *                       Credited from the schedule. Older requests carry requested_time_in / _out.
 *  - undertime:         filed before leaving; requested_time_out = approved early departure.
 *                       Undertime is still deducted.
 *  - schedule_change:   (retired) requested_time_in / requested_time_out = new shift, or requested_rest_day.
 *                       Approving one still publishes a roster entry for the day.
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

    /**
     * Types that can still be filed. Retired types stay in TYPES so past requests keep their history:
     *  - undertime: leaving before the shift ends is detected from the time record and deducted automatically.
     *  - schedule_change: HR sets shifts and rest days directly (Employee Directory, Shift & Roster).
     */
    public const FILEABLE_TYPES = [
        self::TYPE_CORRECTION,
        self::TYPE_OVERTIME,
        self::TYPE_OFFICIAL_BUSINESS,
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
        'reason', 'attachment_path', 'status', 'filed_by', 'reviewed_by', 'reviewed_at', 'review_remarks',
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

    /**
     * Fill in the day's time record for requests not linked to one yet. Overtime is filed before the
     * day is worked, so its record is found by employee and date (one query for the whole list).
     */
    public static function loadDayRecords(Collection $requests): void
    {
        $unlinked = $requests->filter(fn (self $r) => ! $r->dtrEntry && $r->work_date);
        if ($unlinked->isEmpty()) {
            return;
        }

        $records = DtrEntry::query()
            ->whereIn('employee_id', $unlinked->pluck('employee_id')->unique())
            ->whereBetween('work_date', [$unlinked->min('work_date')->toDateString(), $unlinked->max('work_date')->toDateString()])
            ->get()
            ->keyBy(fn (DtrEntry $d) => $d->employee_id.'|'.$d->work_date->toDateString());

        $unlinked->each(fn (self $r) => $r->setRelation('dtrEntry', $records->get($r->employee_id.'|'.$r->work_date->toDateString())));
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
