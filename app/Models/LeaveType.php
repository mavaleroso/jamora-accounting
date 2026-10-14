<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Leave policy catalogue (global across entities). See config('people.leave_types').
 */
class LeaveType extends Model
{
    protected $fillable = [
        'code', 'name', 'legal_basis', 'is_paid', 'balance_tracked', 'annual_entitlement',
        'max_days_per_filing', 'max_carry_over', 'is_convertible', 'counts_calendar_days',
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

