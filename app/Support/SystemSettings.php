<?php

namespace App\Support;

use App\Models\SystemSetting;

/**
 * Company-wide policy the owner changes in Admin › System Settings. A setting never saved there falls
 * back to its default in config. Bound as a scoped singleton, so the table is read once per request / job.
 */
class SystemSettings
{
    /** setting key => config key holding its default */
    public const DEFAULTS = [
        'overtime.break_minutes' => 'people.timekeeping.ot_break_minutes',
        'overtime.ceiling' => 'people.timekeeping.ot_ceiling',
        'leave.min_notice_days' => 'people.leave.min_notice_days',
        'leave.notice_leave_types' => 'people.leave.notice_leave_types',
    ];

    /** @var array<string, mixed>|null */
    private ?array $stored = null;

    public function get(string $key): mixed
    {
        $this->stored ??= SystemSetting::query()->pluck('value', 'key')->all();

        return array_key_exists($key, $this->stored) ? $this->stored[$key] : config(self::DEFAULTS[$key]);
    }

    /**
     * Save settings, keeping who changed them.
     *
     * @param  array<string, mixed>  $values
     * @return list<string> the keys whose value changed
     */
    public function put(array $values, ?int $userId = null): array
    {
        $changed = array_keys(array_filter($values, fn ($value, $key) => $this->get($key) !== $value, ARRAY_FILTER_USE_BOTH));

        foreach ($values as $key => $value) {
            SystemSetting::query()->updateOrCreate(['key' => $key], ['value' => $value, 'updated_by' => $userId]);
        }
        $this->stored = null;

        return $changed;
    }

    /** Unpaid break between the end of regular hours and the start of overtime. */
    public function overtimeBreakMinutes(): int
    {
        return max(0, (int) $this->get('overtime.break_minutes'));
    }

    /** Time of day ("H:i") overtime stops counting, or null for no ceiling. */
    public function overtimeCeiling(): ?string
    {
        $ceiling = $this->get('overtime.ceiling');

        return filled($ceiling) ? (string) $ceiling : null;
    }

    /** Days ahead leave of the covered types must be filed. */
    public function leaveNoticeDays(): int
    {
        return max(0, (int) $this->get('leave.min_notice_days'));
    }

    /**
     * Codes of the leave types the company notice covers (leave that can be planned).
     *
     * @return list<string>
     */
    public function leaveNoticeTypes(): array
    {
        return array_values(array_map('strval', (array) $this->get('leave.notice_leave_types')));
    }
}
