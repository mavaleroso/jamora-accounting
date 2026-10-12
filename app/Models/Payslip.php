<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payslip extends Model
{
    protected $fillable = [
        'payroll_run_id', 'employee_id', 'basic_pay', 'ot_pay', 'absences', 'tardiness',
        'gross_pay', 'sss', 'philhealth', 'pagibig', 'withholding_tax', 'other_deductions',
        'net_pay', 'thirteenth_month_accrual', 'meta',
    ];

    protected function casts(): array
    {
        return [
            'basic_pay' => 'decimal:2',
            'ot_pay' => 'decimal:2',
            'absences' => 'decimal:2',
            'tardiness' => 'decimal:2',
            'gross_pay' => 'decimal:2',
            'sss' => 'decimal:2',
            'philhealth' => 'decimal:2',
            'pagibig' => 'decimal:2',
            'withholding_tax' => 'decimal:2',
            'other_deductions' => 'decimal:2',
            'net_pay' => 'decimal:2',
            'thirteenth_month_accrual' => 'decimal:2',
            'meta' => 'array',
        ];
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
