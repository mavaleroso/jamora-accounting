<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One-off earning or deduction for an employee on a draft payroll run
 * (allowance, de minimis benefit, salary adjustment, cash advance, SSS / Pag-IBIG loan...).
 */
class PayrollAdjustment extends Model
{
    use BelongsToEntity;

    public const KIND_EARNING = 'earning';

    public const KIND_DEDUCTION = 'deduction';

    /** category => [kind, label, taxable default] */
    public const CATEGORIES = [
        'allowance' => [self::KIND_EARNING, 'Allowance', true],
        'de_minimis' => [self::KIND_EARNING, 'De minimis benefit', false],
        'bonus' => [self::KIND_EARNING, 'Bonus / incentive', true],
        'salary_adjustment' => [self::KIND_EARNING, 'Salary adjustment (underpayment)', true],
        'reimbursement' => [self::KIND_EARNING, 'Reimbursement', false],
        'cash_advance' => [self::KIND_DEDUCTION, 'Cash advance', false],
        'sss_loan' => [self::KIND_DEDUCTION, 'SSS loan amortization', false],
        'pagibig_loan' => [self::KIND_DEDUCTION, 'Pag-IBIG loan amortization', false],
        'company_loan' => [self::KIND_DEDUCTION, 'Company loan', false],
        'overpayment' => [self::KIND_DEDUCTION, 'Salary overpayment recovery', false],
        'other_deduction' => [self::KIND_DEDUCTION, 'Other deduction', false],
    ];

    protected $fillable = [
        'entity_id', 'payroll_run_id', 'employee_id', 'kind', 'category', 'description', 'amount', 'taxable', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'taxable' => 'boolean',
        ];
    }

    public function run(): BelongsTo
    {
        return $this->belongsTo(PayrollRun::class, 'payroll_run_id');
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
