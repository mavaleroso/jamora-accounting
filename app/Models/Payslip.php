<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One employee's pay for a payroll run. Amounts are for the cut-off; meta holds the working
 * (rates, days, minutes, adjustment lines, warnings) so the payslip can be explained line by line.
 */
class Payslip extends Model
{
    protected $fillable = [
        'payroll_run_id', 'employee_id',
        'basic_pay', 'ot_pay', 'holiday_pay', 'night_diff_pay', 'taxable_allowances', 'non_taxable_allowances',
        'absences', 'tardiness', 'unpaid_leave', 'gross_pay',
        'sss', 'sss_er', 'sss_ec', 'philhealth', 'philhealth_er', 'pagibig', 'pagibig_er', 'employer_benefits',
        'taxable_income', 'is_mwe', 'withholding_tax', 'other_deductions', 'benefit_deductions',
        'net_pay', 'thirteenth_month_accrual', 'meta',
    ];

    protected function casts(): array
    {
        return [
            'basic_pay' => 'decimal:2',
            'ot_pay' => 'decimal:2',
            'holiday_pay' => 'decimal:2',
            'night_diff_pay' => 'decimal:2',
            'taxable_allowances' => 'decimal:2',
            'non_taxable_allowances' => 'decimal:2',
            'absences' => 'decimal:2',
            'tardiness' => 'decimal:2',
            'unpaid_leave' => 'decimal:2',
            'gross_pay' => 'decimal:2',
            'sss' => 'decimal:2',
            'sss_er' => 'decimal:2',
            'sss_ec' => 'decimal:2',
            'philhealth' => 'decimal:2',
            'philhealth_er' => 'decimal:2',
            'pagibig' => 'decimal:2',
            'pagibig_er' => 'decimal:2',
            'employer_benefits' => 'decimal:2',
            'taxable_income' => 'decimal:2',
            'is_mwe' => 'boolean',
            'withholding_tax' => 'decimal:2',
            'other_deductions' => 'decimal:2',
            'benefit_deductions' => 'decimal:2',
            'net_pay' => 'decimal:2',
            'thirteenth_month_accrual' => 'decimal:2',
            'meta' => 'array',
        ];
    }

    public function employeeContributions(): float
    {
        return round((float) $this->sss + (float) $this->philhealth + (float) $this->pagibig, 2);
    }

    /** Employer cost on top of gross pay: statutory employer shares plus benefit premiums. */
    public function employerContributions(): float
    {
        return round((float) $this->sss_er + (float) $this->sss_ec + (float) $this->philhealth_er + (float) $this->pagibig_er + (float) $this->employer_benefits, 2);
    }

    public function totalDeductions(): float
    {
        return round($this->employeeContributions() + (float) $this->withholding_tax + (float) $this->other_deductions, 2);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function payrollRun(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class);
    }
}
