<?php

namespace App\Services\Payroll;

use App\Models\Payslip;

/**
 * The payslip as the payslip dialog reads it: every amount, the employee's pay basis and the
 * working in meta (rates, days, adjustments, benefits). Shared by Payroll and the employee's My Pay.
 */
class PayslipPresenter
{
    private const AMOUNTS = [
        'basic_pay', 'ot_pay', 'holiday_pay', 'night_diff_pay', 'taxable_allowances', 'non_taxable_allowances',
        'absences', 'tardiness', 'unpaid_leave', 'gross_pay', 'sss', 'sss_er', 'sss_ec', 'philhealth', 'philhealth_er',
        'pagibig', 'pagibig_er', 'employer_benefits', 'taxable_income', 'withholding_tax', 'other_deductions', 'benefit_deductions', 'net_pay', 'thirteenth_month_accrual',
    ];

    public static function present(Payslip $p): array
    {
        $e = $p->employee;

        return [
            'id' => $p->id,
            'employee' => $e ? [
                ...$e->only(['id', 'employee_code', 'firstname', 'lastname', 'name', 'avatar_url', 'position', 'pay_type', 'bank_name']),
                'basic_rate' => (float) $e->basic_pay,
                'bank_account_hint' => $e->bank_account_no ? '•••• '.substr((string) $e->bank_account_no, -4) : null,
            ] : null,
            ...collect(self::AMOUNTS)->mapWithKeys(fn ($c) => [$c => (float) $p->{$c}])->all(),
            'is_mwe' => (bool) $p->is_mwe,
            'total_deductions' => $p->totalDeductions(),
            'employer_contributions' => $p->employerContributions(),
            'meta' => $p->meta ?? [],
        ];
    }
}
