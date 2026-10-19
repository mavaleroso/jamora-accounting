<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use App\Support\MissingValue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use BelongsToEntity, SoftDeletes;

    protected $fillable = [
        'entity_id', 'user_id', 'employee_code', 'firstname', 'middlename', 'lastname', 'avatar',
        'gender', 'civil_status', 'birth_date',
        'position', 'email', 'phone', 'address',
        'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone', 'dependents',
        'default_shift_template_id', 'rest_days', 'leave_type_ids',
        'hire_date', 'regularization_date', 'separation_date', 'employment_status', 'employment_type',
        'pay_type', 'basic_pay',
        'sss_number', 'philhealth_number', 'pagibig_number', 'tin', 'contribution_settings', 'bank_name',
        'bank_account_name', 'bank_account_no', 'leave_credits', 'vacation_leave_credits', 'sick_leave_credits',
        'is_active',
    ];

    protected $appends = ['name', 'avatar_url'];

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'hire_date' => 'date',
            'regularization_date' => 'date',
            'separation_date' => 'date',
            'basic_pay' => 'decimal:2',
            'dependents' => 'integer',
            'leave_credits' => 'decimal:2',
            'vacation_leave_credits' => 'decimal:2',
            'sick_leave_credits' => 'decimal:2',
            'rest_days' => 'array',
            'leave_type_ids' => 'array',
            'contribution_settings' => 'array',
            'is_active' => 'boolean',
        ];
    }

    /** No one younger may be employed (RA 9231); a later birth date is a placeholder, not a real one. */
    public const MIN_WORKING_AGE = 15;

    /** Government contributions that can be set per employee. */
    public const CONTRIBUTIONS = ['sss', 'philhealth', 'pagibig'];

    /** auto = computed from the contribution table on the salary; none = not deducted (not covered). */
    public const CONTRIBUTION_MODES = ['auto', 'none'];

    /**
     * Whether a government contribution is deducted. Amounts are always computed from the
     * contribution table on the salary; anything else stored is treated as automatic.
     *
     * @param  'sss'|'philhealth'|'pagibig'  $agency
     * @return 'auto'|'none'
     */
    public function contributionMode(string $agency): string
    {
        return ($this->contribution_settings[$agency]['mode'] ?? null) === 'none' ? 'none' : 'auto';
    }

    /**
     * Employees of every active company (branch) the user can open, whichever one is current. The Employee Directory
     * lists them together.
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return $query->withoutGlobalScope('entity')
            ->whereIn('employees.entity_id', $user->entities()->where('entities.is_active', true)->pluck('entities.id'));
    }

    public function getNameAttribute(): string
    {
        return trim(implode(' ', array_filter([$this->firstname, $this->middlename, $this->lastname], fn ($part) => ! MissingValue::is($part))));
    }

    public function getAvatarUrlAttribute(): ?string
    {
        if (! $this->avatar) {
            return null;
        }

        // Relative URL so photos load regardless of the host the app is opened on.
        return str_starts_with($this->avatar, 'http') ? $this->avatar : '/storage/'.ltrim($this->avatar, '/');
    }

    /**
     * Whether the employee record enables this leave type. NULL leave_type_ids = all types.
     */
    public function allowsLeaveType(LeaveType|int $leaveType): bool
    {
        if ($this->leave_type_ids === null) {
            return true;
        }

        $id = $leaveType instanceof LeaveType ? $leaveType->id : $leaveType;

        return in_array($id, array_map('intval', $this->leave_type_ids), true);
    }

    /**
     * Monthly-equivalent rate: the monthly salary, or the daily / hourly rate x days per year / 12.
     */
    public function monthlyRate(): float
    {
        $factor = (int) config('people.timekeeping.days_per_year', 313);
        $rate = (float) $this->basic_pay;

        return match ($this->pay_type) {
            'daily' => $rate * $factor / 12,
            'hourly' => $rate * (int) config('people.timekeeping.regular_hours_per_day', 8) * $factor / 12,
            default => $rate,
        };
    }

    /**
     * Weekdays (0 = Sunday) the employee is normally off when no roster says otherwise.
     *
     * @return array<int, int>
     */
    public function restDayNumbers(): array
    {
        $days = $this->rest_days;

        return is_array($days) && $days !== []
            ? array_map('intval', $days)
            : config('people.default_rest_days', [0]);
    }

    /**
     * Completed months of service as of the given date.
     */
    public function serviceMonths(?\DateTimeInterface $asOf = null): int
    {
        if (! $this->hire_date) {
            return 0;
        }

        return (int) $this->hire_date->diffInMonths($asOf ?? now());
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function defaultShiftTemplate(): BelongsTo
    {
        return $this->belongsTo(ShiftTemplate::class, 'default_shift_template_id');
    }

    public function leaveBalances(): HasMany
    {
        return $this->hasMany(LeaveBalance::class);
    }

    public function attendanceRequests(): HasMany
    {
        return $this->hasMany(AttendanceRequest::class);
    }

    public function rosters(): HasMany
    {
        return $this->hasMany(ShiftRoster::class);
    }

    public function leaveRequests(): HasMany
    {
        return $this->hasMany(LeaveRequest::class);
    }

    public function benefits(): HasMany
    {
        return $this->hasMany(EmployeeBenefit::class);
    }

    public function dtrEntries(): HasMany
    {
        return $this->hasMany(DtrEntry::class);
    }

    public function payslips(): HasMany
    {
        return $this->hasMany(Payslip::class);
    }
}
