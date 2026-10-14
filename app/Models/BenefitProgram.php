<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Benefit / contribution program. entity_id = null means the program is shared by all entities
 * (e.g. SSS, PhilHealth, Pag-IBIG).
 *
 * contribution_basis: fixed | percent_of_basic | statutory_sss | statutory_philhealth | statutory_pagibig
 * payroll_mode: how active enrollments reach the payslip (amounts are per month):
 *   statutory     computed by payroll for every employee — no enrollment needed
 *   earning       allowance paid in the payslip; the employer share is the amount, taxable per is_taxable
 *   contribution  employee share deducted from pay; employer share booked as benefit expense
 *   none          tracked only
 */
class BenefitProgram extends Model
{
    public const MODE_STATUTORY = 'statutory';

    public const MODE_EARNING = 'earning';

    public const MODE_CONTRIBUTION = 'contribution';

    public const MODE_NONE = 'none';

    /** Modes HR can pick for a company program. */
    public const PAYROLL_MODES = [self::MODE_EARNING, self::MODE_CONTRIBUTION, self::MODE_NONE];

    public const CATEGORIES = ['allowance', 'insurance', 'savings', 'company'];

    protected $fillable = [
        'entity_id',
        'code',
        'name',
        'payroll_mode',
        'category',
        'contribution_basis',
        'description',
        'default_employee_share',
        'default_employer_share',
        'employee_rate',
        'employer_rate',
        'is_taxable',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'default_employee_share' => 'decimal:2',
            'default_employer_share' => 'decimal:2',
            'employee_rate' => 'float',
            'employer_rate' => 'float',
            'is_taxable' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function scopeApplicableTo(Builder $query, ?int $entityId): Builder
    {
        return $query->where(function (Builder $q) use ($entityId) {
            $q->whereNull('entity_id');
            if ($entityId !== null) {
                $q->orWhere('entity_id', $entityId);
            }
        });
    }

    public function isStatutory(): bool
    {
        return str_starts_with((string) $this->contribution_basis, 'statutory_');
    }

    /** Whether active enrollments change the payslip. */
    public function affectsPayroll(): bool
    {
        return in_array($this->payroll_mode, [self::MODE_EARNING, self::MODE_CONTRIBUTION], true);
    }

    public function employeeBenefits(): HasMany
    {
        return $this->hasMany(EmployeeBenefit::class);
    }
}
