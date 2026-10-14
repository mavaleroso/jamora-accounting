<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeBenefit extends Model
{
    protected $fillable = [
        'employee_id',
        'benefit_program_id',
        'participation_status',
        'employee_share',
        'employer_share',
        'payroll_treatment',
        'effective_date',
        'end_date',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'employee_share' => 'decimal:2',
            'employer_share' => 'decimal:2',
            'effective_date' => 'date',
            'end_date' => 'date',
        ];
    }

    /**
     * Whether the enrollment is in force on the given date.
     */
    public function isEffectiveOn(\DateTimeInterface $date): bool
    {
        if ($this->participation_status !== 'active') {
            return false;
        }
        if ($this->effective_date && $this->effective_date->gt($date)) {
            return false;
        }

        return ! ($this->end_date && $this->end_date->lt($date));
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(BenefitProgram::class, 'benefit_program_id');
    }
}
