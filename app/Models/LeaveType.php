<?php

namespace App\Models;

use App\Support\SystemSettings;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Leave policy catalogue (global across entities). See config('people.leave_types').
 */
class LeaveType extends Model
{
    protected $fillable = [
        'code', 'name', 'legal_basis', 'is_paid', 'balance_tracked', 'annual_entitlement',
        'max_days_per_filing', 'max_carry_over', 'prorate_first_year', 'is_convertible', 'counts_calendar_days',
        'gender', 'min_service_months', 'min_notice_days', 'attachment_required_after_days',
        'allow_half_day', 'sort_order', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_paid' => 'boolean',
            'balance_tracked' => 'boolean',
            'annual_entitlement' => 'float',
            'max_days_per_filing' => 'float',
            'max_carry_over' => 'float',
            'prorate_first_year' => 'boolean',
            'is_convertible' => 'boolean',
            'counts_calendar_days' => 'boolean',
            'min_service_months' => 'integer',
            'min_notice_days' => 'integer',
            'attachment_required_after_days' => 'float',
            'allow_half_day' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function balances(): HasMany
    {
        return $this->hasMany(LeaveBalance::class);
    }

    public function requests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }

    /**
     * Days ahead this leave must be filed: the leave type's own notice, or the company notice (Admin › System Settings)
     * when the type is one it covers, whichever is longer.
     */
    public function noticeDays(): int
    {
        $settings = app(SystemSettings::class);
        $company = $this->companyNoticeApplies() ? $settings->leaveNoticeDays() : 0;

        return max((int) $this->min_notice_days, $company);
    }

    /**
     * The notice in force for a filing spanning $consecutiveDays calendar days: a long filing of a type the company
     * notice covers needs the longer notice (Admin › System Settings).
     */
    public function noticeDaysFor(int $consecutiveDays): int
    {
        $settings = app(SystemSettings::class);
        $long = $this->companyNoticeApplies() && $consecutiveDays > $settings->longLeaveDays() ? $settings->longLeaveNoticeDays() : 0;

        return max($this->noticeDays(), $long);
    }

    /** Whether the company's notice rules cover this type (leave that can be planned). */
    public function companyNoticeApplies(): bool
    {
        return in_array($this->code, app(SystemSettings::class)->leaveNoticeTypes(), true);
    }

    /**
     * Legacy leave_requests.leave_type string for this code (kept for backward compatibility).
     */
    public function legacyKey(): string
    {
        return match ($this->code) {
            'VL' => 'vacation',
            'SL' => 'sick',
            'EL' => 'emergency',
            'ML' => 'maternity',
            'PL' => 'paternity',
            'BL' => 'bereavement',
            default => strtolower($this->code),
        };
    }

    public static function codeForLegacyKey(string $key): string
    {
        return match ($key) {
            'vacation' => 'VL',
            'sick' => 'SL',
            'emergency' => 'EL',
            'maternity' => 'ML',
            'paternity' => 'PL',
            'bereavement' => 'BL',
            default => strtoupper($key),
        };
    }
}
