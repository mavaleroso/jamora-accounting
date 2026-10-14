<?php

namespace App\Services\People;

use App\Models\ComplianceItem;
use App\Models\PayrollRun;
use App\Models\Payslip;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Generates statutory and regulatory compliance obligations for a given period (e.g. September 2026).
 */
class ComplianceCalendar
{
    /**
     * Generate compliance items for an entity and period (format "Month Year", e.g. "October 2026").
     *
     * @return array{created: int, existing: int}
     */
    public function generateForPeriod(int $entityId, string $periodString): array
    {
        $periodDate = Carbon::parse('first day of '.$periodString);
        $month = (int) $periodDate->month;
        $year = (int) $periodDate->year;
        $isQuarterEnd = in_array($month, [3, 6, 9, 12], true);
        $isYearEnd = ($month === 12);

        $templates = config('people.compliance_calendar', []);
        $created = 0;
        $existing = 0;

        foreach ($templates as $tpl) {
            $when = $tpl['when'] ?? 'monthly';

            if ($when === 'quarter_end' && ! $isQuarterEnd) {
                continue;
            }
            if ($when === 'year_end' && ! $isYearEnd) {
                continue;
            }
            if ($when === 'monthly_non_quarter' && $isQuarterEnd) {
                continue;
            }

            // Calculate due date [month_offset, day]
            [$monthOffset, $day] = $tpl['due'];
            $dueMonth = $periodDate->copy()->addMonths($monthOffset);
            if ($day === 0) {
                $dueDate = $dueMonth->endOfMonth()->toDateString();
            } else {
                $dueDate = $dueMonth->copy()->day(min($day, $dueMonth->daysInMonth))->toDateString();
            }

            $item = ComplianceItem::withoutEntityScope()
                ->where('entity_id', $entityId)
                ->where('form_code', $tpl['form_code'])
                ->where('period', $periodString)
                ->first();

            if ($item) {
                $existing++;

                continue;
            }

            ComplianceItem::create([
                'entity_id' => $entityId,
                'title' => $tpl['title'],
                'form_code' => $tpl['form_code'],
                'agency' => $tpl['agency'] ?? null,
                'category' => $tpl['category'],
                'frequency' => $tpl['frequency'] ?? 'monthly',
                'period' => $periodString,
                'due_date' => $dueDate,
                'owner_role' => $tpl['owner_role'] ?? 'HR / Accounting',
                'status' => 'pending',
            ]);

            $created++;
        }

        return ['created' => $created, 'existing' => $existing];
    }

    /**
     * Make sure the calendar exists for the current and previous month (last month's filings fall due
     * this month). Idempotent; used by the page and the monthly scheduled job.
     */
    public function ensureRecent(int $entityId, ?Carbon $today = null): int
    {
        $today ??= Carbon::today();
        $created = 0;
        foreach ([$today->copy()->subMonthNoOverflow(), $today->copy()] as $month) {
            $created += $this->generateForPeriod($entityId, $month->format('F Y'))['created'];
        }

        return $created;
    }

    /**
     * What payroll says each payroll-driven filing should be for a covered month, from posted and paid
     * runs whose cut-off ends in that month. Keyed by form code.
     *
     * @return array<string, array{amount: float, runs: int, unreleased: int, basis: string}>
     */
    public function payrollAmounts(int $entityId, Carbon $month): array
    {
        $runs = fn (array $statuses, Carbon $from, Carbon $to) => PayrollRun::query()->withoutEntityScope()
            ->where('entity_id', $entityId)
            ->whereIn('status', $statuses)
            ->whereHas('period', fn ($q) => $q->whereDate('end_date', '>=', $from->toDateString())->whereDate('end_date', '<=', $to->toDateString()));

        $from = $month->copy()->startOfMonth();
        $to = $month->copy()->endOfMonth();
        $released = $runs(PayrollRun::RELEASED_STATUSES, $from, $to)->pluck('id');
        $unreleased = $runs([PayrollRun::STATUS_DRAFT, PayrollRun::STATUS_APPROVED], $from, $to)->count();
        if ($released->isEmpty() && $unreleased === 0) {
            return [];
        }

        $sum = fn (array $columns) => round((float) Payslip::query()->whereIn('payroll_run_id', $released)->sum(DB::raw(implode(' + ', $columns))), 2);
        $row = fn (float $amount, string $basis) => ['amount' => $amount, 'runs' => $released->count(), 'unreleased' => $unreleased, 'basis' => $basis];

        $amounts = [
            'SSS-R5' => $row($sum(['sss', 'sss_er', 'sss_ec']), 'Employee + employer share + EC'),
            'PHIC-RF1' => $row($sum(['philhealth', 'philhealth_er']), 'Employee + employer share'),
            'HDMF-MCRF' => $row($sum(['pagibig', 'pagibig_er']), 'Employee + employer share'),
            '1601-C' => $row($sum(['withholding_tax']), 'Tax withheld on compensation'),
        ];

        if ($month->month === 12) {
            $yearRuns = $runs(PayrollRun::RELEASED_STATUSES, $month->copy()->startOfYear(), $to)->pluck('id');
            $amounts['13TH-MONTH'] = [
                'amount' => round((float) Payslip::query()->whereIn('payroll_run_id', $yearRuns)->sum('thirteenth_month_accrual'), 2),
                'runs' => $yearRuns->count(),
                'unreleased' => $unreleased,
                'basis' => '13th month accrued for the year',
            ];
        }

        return $amounts;
    }
}
