<?php

namespace App\Services\Payroll;

use App\Models\Account;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Journal;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Services\Accounting\JournalPostingService;
use Illuminate\Support\Facades\DB;

class PayrollService
{
    public function __construct(protected JournalPostingService $journalPostingService) {}

    public function compute(PayrollPeriod $period, int $userId): PayrollRun
    {
        return DB::transaction(function () use ($period, $userId) {
            $runNo = 'PR-'.$period->code.'-'.now()->format('His');
            $run = PayrollRun::query()->create([
                'payroll_period_id' => $period->id,
                'run_no' => $runNo,
                'status' => 'computed',
            ]);

            $employees = Employee::query()->where('is_active', true)->where('employment_status', 'active')->get();
            $grossTotal = 0;
            $deductionTotal = 0;
            $netTotal = 0;

            foreach ($employees as $employee) {
                $dtrs = DtrEntry::query()
                    ->where('employee_id', $employee->id)
                    ->whereBetween('work_date', [$period->start_date, $period->end_date])
                    ->get();

                $absentDays = $dtrs->where('is_absent', true)->count();
                $otHours = (float) $dtrs->sum('ot_hours');
                $tardinessMinutes = (float) $dtrs->sum('tardiness_minutes');

                $dailyRate = $employee->pay_type === 'daily'
                    ? (float) $employee->basic_pay
                    : ((float) $employee->basic_pay / 22);
                $hourlyRate = $dailyRate / 8;

                $basic = (float) $employee->basic_pay;
                if ($employee->pay_type === 'daily') {
                    $workDays = $dtrs->where('is_absent', false)->count();
                    $basic = $dailyRate * max($workDays, 0);
                }

                $otPay = $otHours * $hourlyRate * 1.25;
                $absenceDeduction = $absentDays * $dailyRate;
                $tardinessDeduction = ($tardinessMinutes / 60) * $hourlyRate;
                $gross = max(0, $basic + $otPay - $absenceDeduction - $tardinessDeduction);

                $sss = round(min($gross * 0.045, 1350), 2);
                $philhealth = round(min($gross * 0.025, 2500), 2);
                $pagibig = round(min($gross * 0.02, 200), 2);
                $taxable = max(0, $gross - $sss - $philhealth - $pagibig);
                $withholding = $this->withholdingTax($taxable);
                $deductions = $sss + $philhealth + $pagibig + $withholding;
                $net = max(0, $gross - $deductions);

                Payslip::query()->create([
                    'payroll_run_id' => $run->id,
                    'employee_id' => $employee->id,
                    'basic_pay' => round($basic, 2),
                    'ot_pay' => round($otPay, 2),
                    'absences' => round($absenceDeduction, 2),
                    'tardiness' => round($tardinessDeduction, 2),
                    'gross_pay' => round($gross, 2),
                    'sss' => $sss,
                    'philhealth' => $philhealth,
                    'pagibig' => $pagibig,
                    'withholding_tax' => $withholding,
                    'other_deductions' => 0,
                    'net_pay' => round($net, 2),
                    'thirteenth_month_accrual' => round($gross / 12, 2),
                ]);

                $grossTotal += $gross;
                $deductionTotal += $deductions;
                $netTotal += $net;
            }

            $run->update([
                'gross_total' => round($grossTotal, 2),
                'deduction_total' => round($deductionTotal, 2),
                'net_total' => round($netTotal, 2),
            ]);

            $period->update(['status' => 'processing']);

            return $run->fresh(['payslips.employee']);
        });
    }

    public function post(PayrollRun $run, int $userId): PayrollRun
    {
        if ($run->status === 'posted') {
            return $run;
        }

        return DB::transaction(function () use ($run, $userId) {
            $expense = Account::query()->where('code', '6000')->first();
            $payable = Account::query()->where('code', '2500')->first();
            $sss = Account::query()->where('code', '2400')->first();
            $ph = Account::query()->where('code', '2410')->first();
            $pagibig = Account::query()->where('code', '2420')->first();
            $wtax = Account::query()->where('code', '2430')->first();
            $journal = Journal::query()->where('code', 'GJ')->first();

            $payslips = $run->payslips;
            $sssTotal = (float) $payslips->sum('sss');
            $phTotal = (float) $payslips->sum('philhealth');
            $pagibigTotal = (float) $payslips->sum('pagibig');
            $taxTotal = (float) $payslips->sum('withholding_tax');

            $lines = [
                [
                    'account_id' => $expense?->id,
                    'debit' => (float) $run->gross_total,
                    'credit' => 0,
                    'memo' => 'Payroll '.$run->run_no,
                ],
                [
                    'account_id' => $payable?->id,
                    'debit' => 0,
                    'credit' => (float) $run->net_total,
                    'memo' => 'Net salaries',
                ],
            ];

            foreach ([[$sss, $sssTotal, 'SSS'], [$ph, $phTotal, 'PhilHealth'], [$pagibig, $pagibigTotal, 'Pag-IBIG'], [$wtax, $taxTotal, 'WTax']] as [$account, $amount, $label]) {
                if ($amount > 0) {
                    $lines[] = [
                        'account_id' => $account?->id,
                        'debit' => 0,
                        'credit' => $amount,
                        'memo' => $label,
                    ];
                }
            }

            $entry = $this->journalPostingService->create([
                'journal_id' => $journal?->id,
                'entry_date' => $run->period?->pay_date?->toDateString() ?? now()->toDateString(),
                'reference' => $run->run_no,
                'memo' => 'Payroll run '.$run->run_no,
                'source_system' => 'payroll',
                'source_type' => 'payroll_run',
                'source_id' => $run->id,
            ], $lines, \App\Models\User::find($userId));

            $run->update([
                'status' => 'posted',
                'journal_entry_id' => $entry->id,
                'posted_by' => $userId,
                'posted_at' => now(),
            ]);
            $run->period?->update(['status' => 'posted']);

            return $run->fresh();
        });
    }

    protected function withholdingTax(float $taxableSemiMonthly): float
    {
        // Simplified TRAIN semi-monthly approximation
        if ($taxableSemiMonthly <= 10417) {
            return 0;
        }
        if ($taxableSemiMonthly <= 16666) {
            return round(($taxableSemiMonthly - 10417) * 0.15, 2);
        }
        if ($taxableSemiMonthly <= 33332) {
            return round(937.50 + ($taxableSemiMonthly - 16667) * 0.20, 2);
        }

        return round(4270.70 + ($taxableSemiMonthly - 33333) * 0.25, 2);
    }
}
