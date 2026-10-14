<?php

namespace App\Services\Payroll;

use App\Models\BenefitProgram;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\LeaveRequest;
use App\Models\PayrollAdjustment;
use App\Models\PayrollPeriod;
use App\Services\People\AttendanceCalculator;
use App\Services\People\BenefitCalculator;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Support\Collection;

/**
 * Computes one employee's pay for one pay period. Pure: reads nothing but what it is given
 * (plus holidays through AttendanceCalculator) and returns payslip attributes.
 *
 * Rules (Labor Code, DOLE handbook on workers' statutory monetary benefits, RR 11-2018, RA 11199,
 * RA 11223, RA 9679; company policy items live in config/people.php):
 *  - Rates. Monthly-paid: daily = monthly x 12 / factor (313 for a 6-day week). Daily-paid: monthly
 *    equivalent = daily x factor / 12. Hourly = daily / 8.
 *  - Basic. Monthly-paid: monthly / pay periods per month, less absences, unpaid leave, late and undertime,
 *    and days before hire / after separation. Daily-paid: days worked + paid leave days ("no work, no pay").
 *    Hourly-paid: hours worked + paid leave days.
 *  - Premiums. Work on a rest day / holiday earns the day-type rate on the first 8 hours (the 100% base is
 *    already in basic, except a monthly-paid employee's rest day, which the 313 factor does not cover).
 *    Unworked regular holidays are paid to daily / hourly-paid staff (Art. 94).
 *  - OT is paid only from approved OT hours, at the day-type OT rate. Night differential: 10% of the
 *    hourly rate for the day type, for hours between 10 PM and 6 AM (Art. 86).
 *  - Contributions on monthly compensation — the monthly salary, or for daily / hourly-paid staff what they
 *    earned in the cut-off scaled to a month (SSS MSC table, PhilHealth 5% shared, Pag-IBIG 2%/2% capped),
 *    deducted per the configured semi-monthly schedule. Skipped when there is no pay for the cut-off.
 *  - Withholding tax from the BIR table for the period frequency on taxable compensation (gross less
 *    non-taxable benefits and employee contributions). Minimum wage earners: only income other than the
 *    SMW, holiday, OT and night differential is taxable.
 *  - Benefit enrollments (Benefits Administration): monthly amounts spread over the month's cut-offs.
 *    Allowance programs are earnings (taxable per program); contribution programs deduct the employee share
 *    and book the employer share as employer cost. Skipped when there is no basic pay for the cut-off.
 *  - 13th month accrual = basic salary actually earned / 12 (PD 851).
 */
class PayrollCalculator
{
    public function __construct(
        protected BenefitCalculator $benefits,
        protected AttendanceCalculator $attendance
    ) {}

    /**
     * @param  Collection<int, DtrEntry>  $dtrs  time records of this employee within the period
     * @param  Collection<int, LeaveRequest>  $leaves  leave requests referenced by those records, keyed by id
     * @param  Collection<int, PayrollAdjustment>  $adjustments  this employee's adjustments on the run
     * @param  Collection<int, EmployeeBenefit>  $benefits  this employee's enrollments in force during the period (with program)
     * @return array<string, mixed>
     */
    public function compute(Employee $employee, PayrollPeriod $period, Collection $dtrs, Collection $leaves, Collection $adjustments, Collection $benefits = new Collection): array
    {
        $factor = (int) config('people.timekeeping.days_per_year', 313);
        $hoursPerDay = (int) config('people.timekeeping.regular_hours_per_day', 8);
        $premiums = config('people.premiums');
        $ndRate = (float) config('people.timekeeping.night_diff_rate', 0.10);
        $payType = $employee->pay_type ?: 'monthly';
        $rate = (float) $employee->basic_pay;

        [$monthlyRate, $dailyRate] = match ($payType) {
            'daily' => [$rate * $factor / 12, $rate],
            'hourly' => [$rate * $hoursPerDay * $factor / 12, $rate * $hoursPerDay],
            default => [$rate, $rate * 12 / $factor],
        };
        $hourlyRate = $dailyRate / $hoursPerDay;
        $minuteRate = $hourlyRate / 60;

        // Employment window inside the period (new hires, separations).
        $from = $period->start_date->copy();
        $to = $period->end_date->copy();
        if ($employee->hire_date && $employee->hire_date->gt($from)) {
            $from = $employee->hire_date->copy()->startOfDay();
        }
        if ($employee->separation_date && $employee->separation_date->lt($to)) {
            $to = $employee->separation_date->copy()->startOfDay();
        }

        $days = ['worked' => 0.0, 'absent' => 0, 'paid_leave' => 0.0, 'unpaid_leave' => 0.0, 'unworked_holiday' => 0, 'not_employed' => 0, 'no_record' => 0];
        $hoursWorked = 0.0;
        $lateMinutes = 0;
        $undertimeMinutes = 0;
        $otHours = 0.0;
        $ndHours = 0.0;
        $otPay = 0.0;
        $premiumPay = 0.0;
        $holidayPay = 0.0;
        $nightDiffPay = 0.0;
        $premiumLines = [];
        $openRecords = 0;
        $incomplete = 0;

        $byDate = $dtrs->keyBy(fn (DtrEntry $d) => Carbon::parse($d->work_date)->toDateString());
        $restDays = $employee->restDayNumbers();

        foreach (CarbonPeriod::create($period->start_date, $period->end_date) as $date) {
            $d = $date->toDateString();
            $dtr = $byDate->get($d);
            $isRestDay = in_array($date->dayOfWeek, $restDays, true);

            if ($date->lt($from) || $date->gt($to)) {
                if (! $isRestDay && ! $this->isHoliday($employee->entity_id, $date)) {
                    $days['not_employed']++;
                }

                continue;
            }

            if (! $dtr) {
                if (! $isRestDay && ! $this->isHoliday($employee->entity_id, $date)) {
                    $days['no_record']++;
                }

                continue;
            }

            if ($dtr->status === DtrEntry::STATUS_OPEN) {
                $openRecords++;
            }

            $status = $dtr->attendance_status;
            $dayType = $dtr->day_type ?: 'regular';
            $cfg = $premiums[$dayType] ?? $premiums['regular'];

            if ($status === 'incomplete') {
                $incomplete++;
            }

            if ($dtr->is_absent || $status === 'absent') {
                $days['absent']++;

                continue;
            }

            if ($status === 'on_leave') {
                $leave = $leaves->get($dtr->leave_request_id);
                $portion = $leave?->half_day ? 0.5 : 1.0;
                $paid = $leave?->type ? (bool) $leave->type->is_paid : true;
                $days[$paid ? 'paid_leave' : 'unpaid_leave'] += $portion;

                continue;
            }

            if ($status === 'holiday') {
                $days['unworked_holiday']++;

                continue;
            }

            if (! in_array($status, AttendanceCalculator::WORKED_STATUSES, true)) {
                continue; // rest day / incomplete: nothing payable
            }

            $hours = min((float) $hoursPerDay, (float) $dtr->regular_hours);
            $days['worked']++;
            $hoursWorked += (float) $dtr->regular_hours;
            $lateMinutes += (int) round((float) $dtr->tardiness_minutes);
            $undertimeMinutes += (int) round((float) $dtr->undertime_minutes);

            if ($dayType !== 'regular' && $hours > 0) {
                $isRestDayType = str_contains($dayType, 'rest_day');
                // The 313-day monthly rate does not cover rest days, so the full rate is premium.
                $multiplier = $payType === 'monthly' && $isRestDayType ? $cfg['day'] : $cfg['day'] - 1.0;
                $amount = $hours * $hourlyRate * $multiplier;
                $premiumPay += $amount;
                $premiumLines[$dayType] = ($premiumLines[$dayType] ?? 0) + $amount;
            }

            $approvedOt = (float) $dtr->ot_hours_approved;
            if ($approvedOt > 0) {
                $otHours += $approvedOt;
                $otPay += $approvedOt * $hourlyRate * $cfg['ot'];
            }

            $nd = (float) $dtr->night_diff_hours;
            if ($nd > 0) {
                $ndHours += $nd;
                $nightDiffPay += $nd * $hourlyRate * $cfg['day'] * $ndRate;
            }
        }

        // Basic pay and deductions from basic.
        $absences = 0.0;
        $unpaidLeave = 0.0;
        $tardiness = 0.0;
        if ($payType === 'monthly') {
            $basic = $monthlyRate / $period->periodsPerMonth();
            $absences = ($days['absent'] + $days['not_employed']) * $dailyRate;
            $unpaidLeave = $days['unpaid_leave'] * $dailyRate;
            $tardiness = ($lateMinutes + $undertimeMinutes) * $minuteRate;
        } elseif ($payType === 'daily') {
            $basic = ($days['worked'] + $days['paid_leave']) * $dailyRate;
            $tardiness = ($lateMinutes + $undertimeMinutes) * $minuteRate;
            $holidayPay = $days['unworked_holiday'] * $dailyRate;
        } else {
            $basic = $hoursWorked * $hourlyRate + $days['paid_leave'] * $dailyRate;
            $holidayPay = $days['unworked_holiday'] * $dailyRate;
        }
        // Deductions from basic never take it below zero.
        $basicDeductions = min($basic, $absences + $unpaidLeave + $tardiness);
        $scale = ($absences + $unpaidLeave + $tardiness) > 0 ? $basicDeductions / ($absences + $unpaidLeave + $tardiness) : 0;
        [$absences, $unpaidLeave, $tardiness] = [$absences * $scale, $unpaidLeave * $scale, $tardiness * $scale];
        $holidayPay += $premiumPay;

        // Adjustments.
        $taxableAllowances = (float) $adjustments->where('kind', PayrollAdjustment::KIND_EARNING)->where('taxable', true)->sum('amount');
        $nonTaxableAllowances = (float) $adjustments->where('kind', PayrollAdjustment::KIND_EARNING)->where('taxable', false)->sum('amount');
        $otherDeductions = (float) $adjustments->where('kind', PayrollAdjustment::KIND_DEDUCTION)->sum('amount');

        $basicEarned = $basic - $basicDeductions;

        // Benefit enrollments, at the monthly amount / cut-offs in the month.
        $benefitLines = [];
        $benefitDeductions = 0.0;
        $employerBenefits = 0.0;
        if ($basicEarned > 0) {
            $perPeriod = 1 / $period->periodsPerMonth();
            foreach ($benefits as $enrollment) {
                $program = $enrollment->program;
                if (! $program?->affectsPayroll()) {
                    continue;
                }

                $line = ['id' => $enrollment->id, 'code' => $program->code, 'name' => $program->name, 'mode' => $program->payroll_mode, 'earning' => 0.0, 'taxable' => (bool) $program->is_taxable, 'employee' => 0.0, 'employer' => 0.0];
                if ($program->payroll_mode === BenefitProgram::MODE_EARNING) {
                    $line['earning'] = round((float) $enrollment->employer_share * $perPeriod, 2);
                    if ($program->is_taxable) {
                        $taxableAllowances += $line['earning'];
                    } else {
                        $nonTaxableAllowances += $line['earning'];
                    }
                } else {
                    $line['employee'] = round((float) $enrollment->employee_share * $perPeriod, 2);
                    $line['employer'] = round((float) $enrollment->employer_share * $perPeriod, 2);
                    $benefitDeductions += $line['employee'];
                    $employerBenefits += $line['employer'];
                }
                $benefitLines[] = $line;
            }
        }
        $otherDeductions += $benefitDeductions;

        $gross = $basicEarned + $otPay + $holidayPay + $nightDiffPay + $taxableAllowances + $nonTaxableAllowances;

        // Statutory contributions on the monthly compensation, allocated to this cut-off. Monthly-paid: the
        // monthly salary. Daily / hourly-paid: what was actually earned this cut-off, scaled to a month.
        $share = $this->contributionShare($period);
        $contributionBase = $payType === 'monthly' ? $monthlyRate : max(0, $basicEarned) * $period->periodsPerMonth();
        $sss = $philhealth = $pagibig = ['employee_share' => 0.0, 'employer_share' => 0.0, 'ec' => 0.0, 'msc' => null];
        if ($gross > 0 && $share > 0) {
            $sss = $this->benefits->computeSss($contributionBase);
            $philhealth = $this->benefits->computePhilHealth($contributionBase);
            $pagibig = $this->benefits->computePagIbig($contributionBase);
        }
        $sssEc = round((float) ($sss['ec'] ?? 0) * $share, 2);
        $sssEe = round($sss['employee_share'] * $share, 2);
        $sssEr = round($sss['employer_share'] * $share, 2) - $sssEc; // employer share excluding EC
        $phEe = round($philhealth['employee_share'] * $share, 2);
        $phEr = round($philhealth['employer_share'] * $share, 2);
        $hdmfEe = round($pagibig['employee_share'] * $share, 2);
        $hdmfEr = round($pagibig['employer_share'] * $share, 2);
        $eeContributions = $sssEe + $phEe + $hdmfEe;

        // Withholding tax.
        $isMwe = $dailyRate <= (float) config('people.payroll.minimum_wage_daily', 0);
        $taxable = $isMwe
            ? max(0, $taxableAllowances)
            : max(0, $gross - $nonTaxableAllowances - $eeContributions);
        $tax = $this->withholdingTax($taxable, $period->isSemiMonthly() ? 'semi_monthly' : 'monthly');

        $net = $gross - $eeContributions - $tax - $otherDeductions;

        $warnings = [];
        if ($net < 0) {
            $warnings[] = 'Deductions exceed pay — net pay is negative.';
        }
        if ($days['no_record'] > 0) {
            $warnings[] = $payType === 'monthly'
                ? "{$days['no_record']} working day(s) without a time record — paid as present."
                : "{$days['no_record']} working day(s) without a time record — not paid.";
        }
        if ($incomplete > 0) {
            $warnings[] = "{$incomplete} time record(s) with a missing punch.";
        }
        if ($openRecords > 0) {
            $warnings[] = "{$openRecords} time record(s) not yet approved.";
        }
        foreach (['sss_number' => 'SSS', 'philhealth_number' => 'PhilHealth', 'pagibig_number' => 'Pag-IBIG', 'tin' => 'TIN'] as $field => $label) {
            if (blank($employee->{$field})) {
                $warnings[] = "No {$label} number on file.";
            }
        }

        return [
            'employee_id' => $employee->id,
            'basic_pay' => round($basic, 2),
            'ot_pay' => round($otPay, 2),
            'holiday_pay' => round($holidayPay, 2),
            'night_diff_pay' => round($nightDiffPay, 2),
            'taxable_allowances' => round($taxableAllowances, 2),
            'non_taxable_allowances' => round($nonTaxableAllowances, 2),
            'absences' => round($absences, 2),
            'tardiness' => round($tardiness, 2),
            'unpaid_leave' => round($unpaidLeave, 2),
            'gross_pay' => round($gross, 2),
            'sss' => $sssEe,
            'sss_er' => round($sssEr, 2),
            'sss_ec' => $sssEc,
            'philhealth' => $phEe,
            'philhealth_er' => $phEr,
            'pagibig' => $hdmfEe,
            'pagibig_er' => $hdmfEr,
            'employer_benefits' => round($employerBenefits, 2),
            'taxable_income' => round($taxable, 2),
            'is_mwe' => $isMwe,
            'withholding_tax' => $tax,
            'other_deductions' => round($otherDeductions, 2),
            'benefit_deductions' => round($benefitDeductions, 2),
            'net_pay' => round($net, 2),
            'thirteenth_month_accrual' => round(max(0, $basicEarned) / 12, 2),
            'meta' => [
                'pay_type' => $payType,
                'rates' => ['monthly' => round($monthlyRate, 2), 'daily' => round($dailyRate, 2), 'hourly' => round($hourlyRate, 4)],
                'days' => $days,
                'hours_worked' => round($hoursWorked, 2),
                'late_minutes' => $lateMinutes,
                'undertime_minutes' => $undertimeMinutes,
                'ot_hours' => round($otHours, 2),
                'night_diff_hours' => round($ndHours, 2),
                'premiums' => array_map(fn ($v) => round($v, 2), $premiumLines),
                'contribution_share' => $share,
                'contribution_base' => round($contributionBase, 2),
                'sss_msc' => $sss['msc'] ?? null,
                'adjustments' => $adjustments->map(fn (PayrollAdjustment $a) => [
                    'id' => $a->id,
                    'kind' => $a->kind,
                    'category' => $a->category,
                    'description' => $a->description,
                    'amount' => (float) $a->amount,
                    'taxable' => (bool) $a->taxable,
                ])->values()->all(),
                'benefits' => $benefitLines,
                'warnings' => $warnings,
            ],
        ];
    }

    /** @var array<string, bool> */
    private array $holidays = [];

    private function isHoliday(?int $entityId, Carbon $date): bool
    {
        return $this->holidays[$entityId.'|'.$date->toDateString()] ??= (bool) $this->attendance->holidayFor($entityId, $date);
    }

    /**
     * Fraction of the monthly contribution deducted on this period's payroll.
     */
    public function contributionShare(PayrollPeriod $period): float
    {
        if (! $period->isSemiMonthly()) {
            return 1.0;
        }

        return config('people.payroll.contribution_schedule', 'split') === 'second_cutoff'
            ? ($period->isSecondCutoff() ? 1.0 : 0.0)
            : 0.5;
    }

    /**
     * BIR withholding tax on compensation for one pay period.
     */
    public function withholdingTax(float $taxable, string $frequency): float
    {
        $tax = 0.0;
        foreach (config("people.payroll.withholding_tax.{$frequency}", []) as [$over, $base, $rate]) {
            if ($taxable > $over) {
                $tax = $base + ($taxable - $over) * $rate;
            }
        }

        return round($tax, 2);
    }
}
