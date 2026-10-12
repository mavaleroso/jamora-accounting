<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use SoftDeletes, BelongsToEntity;

    protected $fillable = [
        'entity_id', 'user_id', 'employee_code', 'firstname', 'middlename', 'lastname',
        'position', 'department', 'biometric_id', 'email', 'phone',
        'hire_date', 'separation_date', 'employment_status', 'pay_type', 'basic_pay',
        'sss_number', 'philhealth_number', 'pagibig_number', 'tin', 'bank_name',
        'bank_account_no', 'leave_credits', 'vacation_leave_credits', 'sick_leave_credits',
        'is_active',
    ];

    protected $appends = ['name'];

    protected function casts(): array
    {
        return [
            'hire_date' => 'date',
            'separation_date' => 'date',
            'basic_pay' => 'decimal:2',
            'leave_credits' => 'decimal:2',
            'vacation_leave_credits' => 'decimal:2',
            'sick_leave_credits' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function getNameAttribute(): string
    {
        return trim(implode(' ', array_filter([$this->firstname, $this->middlename, $this->lastname])));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
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
