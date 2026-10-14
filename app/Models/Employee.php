<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;

class Employee extends Model
{
    use SoftDeletes, BelongsToEntity;

    protected $fillable = [
        'entity_id', 'user_id', 'employee_code', 'firstname', 'middlename', 'lastname', 'avatar',
        'gender', 'civil_status',
        'position', 'department', 'biometric_id', 'email', 'phone',
        'default_shift_template_id', 'rest_days',
        'hire_date', 'regularization_date', 'separation_date', 'employment_status', 'employment_type',
        'pay_type', 'basic_pay',
        'sss_number', 'philhealth_number', 'pagibig_number', 'tin', 'bank_name',
        'bank_account_no', 'leave_credits', 'vacation_leave_credits', 'sick_leave_credits',
        'is_active',
    ];

    protected $appends = ['name', 'avatar_url'];

    protected function casts(): array
    {
        return [
            'hire_date' => 'date',
            'regularization_date' => 'date',
            'separation_date' => 'date',
            'basic_pay' => 'decimal:2',
            'leave_credits' => 'decimal:2',
            'vacation_leave_credits' => 'decimal:2',
            'sick_leave_credits' => 'decimal:2',
            'rest_days' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function getNameAttribute(): string
    {
        return trim(implode(' ', array_filter([$this->firstname, $this->middlename, $this->lastname])));
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
