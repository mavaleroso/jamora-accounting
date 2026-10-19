<?php

namespace App\Services\People;

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Support\MissingValue;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Figures for People Reports & Analytics, for one branch and a date range.
 *
 * Headcount counts employment by dates (hired on or before, not separated before) so trends are
 * reproducible for past months. Payroll cost uses posted / paid runs only — the figures that are in
 * the books. Salary-derived figures are only built when the caller may see payroll.
 */
class PeopleAnalytics
{
    /** @var Collection<int, Employee> */
    private Collection $employees;

    public function __construct(
        private int $entityId,
        private Carbon $from,
        private Carbon $to,
    ) {
        $this->employees = Employee::query()
            ->withoutEntityScope()
            ->where('entity_id', $entityId)
            ->orderBy('lastname')
            ->get();
    }

    // -----------------------------------------------------------------------------------------
    // Workforce
    // -----------------------------------------------------------------------------------------

    public function workforce(): array
    {
        $end = $this->to->copy()->min(Carbon::today());
        $active = $this->employedOn($end);
        $atStart = $this->employedOn($this->from)->count();
        $hires = $this->employees->filter(fn (Employee $e) => $e->hire_date?->betweenIncluded($this->from, $this->to));
        $separations = $this->employees->filter(fn (Employee $e) => $e->separation_date?->betweenIncluded($this->from, $this->to));
        $avgHeadcount = ($atStart + $active->count()) / 2;

        $tenure = $active->filter(fn (Employee $e) => $e->hire_date)->map(fn (Employee $e) => $e->hire_date->floatDiffInYears($end));

        // Counts per value, in a fixed order (so a category keeps its color whatever the filter), others after.
        $count = function (Collection $rows, string $field, array $order) {
            $counts = $rows->groupBy(fn (Employee $e) => $e->{$field} ?: 'unspecified')->map->count();
            $keys = [...array_intersect($order, $counts->keys()->all()), ...array_diff($counts->keys()->all(), $order)];

            return collect($keys)->map(fn ($key) => ['key' => (string) $key, 'count' => $counts[$key]])->values();
        };

        return [
            'active' => $active->count(),
            'atStart' => $atStart,
            'hires' => $hires->count(),
            'separations' => $separations->count(),
            'turnoverRate' => $avgHeadcount > 0 ? round($separations->count() / $avgHeadcount * 100, 1) : 0.0,
            'avgTenureYears' => $tenure->isNotEmpty() ? round($tenure->avg(), 1) : null,
            'byPosition' => $active->groupBy(fn (Employee $e) => MissingValue::is($e->position) ? 'Unassigned' : $e->position)
                ->map(fn ($rows, $position) => ['position' => $position, 'count' => $rows->count(), 'regular' => $rows->where('employment_type', 'regular')->count()])
                ->sortByDesc('count')->values(),
            'byType' => $count($active, 'employment_type', ['regular', 'probationary', 'contractual', 'project', 'seasonal']),
            'byPayType' => $count($active, 'pay_type', ['monthly', 'daily', 'hourly']),
            'byGender' => $count($active, 'gender', ['female', 'male']),
            'trend' => $this->headcountTrend(),
            'movements' => [
                ...$hires->map(fn (Employee $e) => $this->person($e) + ['type' => 'hire', 'date' => $e->hire_date->toDateString()]),
                ...$separations->map(fn (Employee $e) => $this->person($e) + ['type' => 'separation', 'date' => $e->separation_date->toDateString()]),
            ],
            'attention' => [
                'probationDue' => $active->filter(fn (Employee $e) => $e->employment_type === 'probationary' && ! $e->regularization_date && $e->hire_date
                    && $e->hire_date->copy()->addMonths(6)->lte(Carbon::today()->addDays(30)))
                    ->map(fn (Employee $e) => $this->person($e) + ['due' => $e->hire_date->copy()->addMonths(6)->toDateString()])->values(),
                'missingIds' => $active->filter(fn (Employee $e) => MissingValue::is($e->sss_number) || MissingValue::is($e->philhealth_number) || MissingValue::is($e->pagibig_number) || MissingValue::is($e->tin))->count(),
                'noBank' => $active->filter(fn (Employee $e) => blank($e->bank_account_no))->count(),
            ],
        ];
    }

    /**
     * Month-end headcount, hires and separations for the 12 months ending with the range.
     *
     * @return array<int, array{month: string, headcount: int, hires: int, separations: int}>
     */
    private function headcountTrend(): array
    {
        $last = $this->to->copy()->startOfMonth();

        return collect(range(11, 0))->map(function (int $back) use ($last) {
            $start = $last->copy()->subMonthsNoOverflow($back);
            $end = $start->copy()->endOfMonth()->min(Carbon::today());

            return [
                'month' => $start->format('Y-m'),
                'headcount' => $this->employedOn($end)->count(),
                'hires' => $this->employees->filter(fn (Employee $e) => $e->hire_date?->betweenIncluded($start, $start->copy()->endOfMonth()))->count(),
                'separations' => $this->employees->filter(fn (Employee $e) => $e->separation_date?->betweenIncluded($start, $start->copy()->endOfMonth()))->count(),
            ];
        })->all();
    }

    /** @return Collection<int, Employee> */
    private function employedOn(Carbon $date): Collection
    {
        return $this->employees->filter(fn (Employee $e) => $e->is_active
            && $e->employment_status !== 'inactive'
            && (! $e->hire_date || $e->hire_date->lte($date))
            && (! $e->separation_date || $e->separation_date->gte($date))
            && ($e->employment_status !== 'separated' || $e->separation_date));
    }

    // -----------------------------------------------------------------------------------------
    // Attendance
    // -----------------------------------------------------------------------------------------

    public function attendance(): array
    {
        $end = $this->to->copy()->min(Carbon::yesterday());
        $dtrs = $end->lt($this->from) ? collect() : DtrEntry::query()
            ->withoutEntityScope()
            ->whereIn('employee_id', $this->employees->pluck('id'))
            ->whereBetween('work_date', [$this->from->toDateString(), $end->toDateString()])
            ->get();

        $worked = fn (Collection $rows) => $rows->whereIn('attendance_status', AttendanceCalculator::WORKED_STATUSES);
        $absent = fn (Collection $rows) => $rows->filter(fn (DtrEntry $d) => $d->is_absent || $d->attendance_status === 'absent');
        $rate = function (Collection $rows) use ($worked, $absent) {
            $due = $worked($rows)->count() + $absent($rows)->count();

            return $due > 0 ? round($worked($rows)->count() / $due * 100, 1) : null;
        };
        $summary = fn (Collection $rows) => [
            'daysWorked' => $worked($rows)->count(),
            'absences' => $absent($rows)->count(),
            'lateCount' => $rows->where('tardiness_minutes', '>', 0)->count(),
            'lateMinutes' => (int) $rows->sum('tardiness_minutes'),
            'undertimeMinutes' => (int) $rows->sum('undertime_minutes'),
            'otRendered' => round((float) $rows->sum('ot_hours'), 2),
            'otApproved' => round((float) $rows->sum('ot_hours_approved'), 2),
            'nightDiffHours' => round((float) $rows->sum('night_diff_hours'), 2),
            'leaveDays' => $rows->where('attendance_status', 'on_leave')->count(),
            'rate' => $rate($rows),
        ];

        $byEmployee = $dtrs->groupBy('employee_id');
        $names = $this->employees->keyBy('id');

        return [
            'through' => $end->lt($this->from) ? null : $end->toDateString(),
            ...$summary($dtrs),
            'incomplete' => $dtrs->where('attendance_status', 'incomplete')->count(),
            'unapproved' => $dtrs->where('status', DtrEntry::STATUS_OPEN)->count(),
            'daily' => $dtrs->groupBy(fn (DtrEntry $d) => Carbon::parse($d->work_date)->toDateString())
                ->sortKeys()
                ->map(fn ($rows, $date) => ['date' => $date, 'rate' => $rate($rows), 'present' => $worked($rows)->count(), 'late' => $rows->where('tardiness_minutes', '>', 0)->count(), 'absent' => $absent($rows)->count()])
                ->filter(fn ($row) => $row['rate'] !== null)
                ->values(),
            'byEmployee' => $byEmployee->map(fn ($rows, $id) => [...$this->person($names[$id]), ...$summary($rows)])
                ->sortBy([['absences', 'desc'], ['lateMinutes', 'desc']])->values(),
        ];
    }

    // -----------------------------------------------------------------------------------------
    // Leave
    // -----------------------------------------------------------------------------------------

    public function leave(bool $withValues): array
    {
        $ids = $this->employees->pluck('id');
        $requests = LeaveRequest::query()->withoutEntityScope()->with('type:id,code,name,is_paid')
            ->whereIn('employee_id', $ids)
            ->whereDate('start_date', '<=', $this->to->toDateString())
            ->whereDate('end_date', '>=', $this->from->toDateString())
            ->get();
        $approved = $requests->where('status', LeaveRequest::STATUS_APPROVED);
        $typeName = fn (LeaveRequest $r) => $r->type?->name ?? strtoupper((string) $r->leave_type);

        $balances = LeaveBalance::query()->withoutEntityScope()->with('leaveType:id,code,name')
            ->whereIn('employee_id', $ids)->where('year', $this->to->year)->get();
        $names = $this->employees->keyBy('id');

        $upcoming = LeaveRequest::query()->withoutEntityScope()->with('type:id,name')
            ->whereIn('employee_id', $ids)->where('status', LeaveRequest::STATUS_APPROVED)
            ->whereDate('end_date', '>=', Carbon::today())->whereDate('start_date', '<=', Carbon::today()->addDays(14))
            ->orderBy('start_date')->get();

        return [
            'filed' => $requests->count(),
            'approved' => $approved->count(),
            'pending' => $requests->where('status', LeaveRequest::STATUS_PENDING)->count(),
            'declined' => $requests->where('status', LeaveRequest::STATUS_DECLINED)->count(),
            'daysTaken' => round((float) $approved->sum('days_count'), 1),
            'unpaidDays' => round((float) $approved->filter(fn (LeaveRequest $r) => $r->type && ! $r->type->is_paid)->sum('days_count'), 1),
            'byType' => $approved->groupBy($typeName)->map(fn ($rows, $type) => ['type' => $type, 'requests' => $rows->count(), 'days' => round((float) $rows->sum('days_count'), 1)])
                ->sortByDesc('days')->values(),
            'balances' => $balances->groupBy(fn (LeaveBalance $b) => $b->leaveType?->name ?? 'Leave')
                ->map(function ($rows, $type) use ($withValues, $names) {
                    $available = (float) $rows->sum('available');

                    return [
                        'type' => $type,
                        'employees' => $rows->count(),
                        'entitled' => round((float) $rows->sum(fn (LeaveBalance $b) => $b->entitled + $b->carried_over + $b->adjusted), 1),
                        'used' => round((float) $rows->sum('used'), 1),
                        'available' => round($available, 1),
                        // Unused leave valued at each employee's daily rate (an accrued liability for convertible leave).
                        'value' => $withValues ? round((float) $rows->sum(fn (LeaveBalance $b) => max(0, $b->available) * $this->dailyRate($names[$b->employee_id] ?? null)), 2) : null,
                    ];
                })->sortBy('type')->values(),
            'upcoming' => $upcoming->map(fn (LeaveRequest $r) => [
                ...$this->person($names[$r->employee_id]),
                'type' => $r->type?->name ?? $r->leave_type,
                'start' => $r->start_date->toDateString(),
                'end' => $r->end_date->toDateString(),
                'days' => (float) $r->days_count,
            ])->values(),
        ];
    }

    // -----------------------------------------------------------------------------------------
    // Payroll cost
    // -----------------------------------------------------------------------------------------

    public function payroll(): array
    {
        $runs = fn (Carbon $from, Carbon $to) => PayrollRun::query()->withoutEntityScope()
            ->where('entity_id', $this->entityId)
            ->whereIn('status', PayrollRun::RELEASED_STATUSES)
            ->whereHas('period', fn ($q) => $q->whereDate('end_date', '>=', $from->toDateString())->whereDate('end_date', '<=', $to->toDateString()));

        $payslips = fn (Carbon $from, Carbon $to) => Payslip::query()
            ->whereIn('payroll_run_id', $runs($from, $to)->pluck('id'))
            ->whereIn('employee_id', $this->employees->pluck('id'))
            ->get();

        $slips = $payslips($this->from, $this->to);
        $names = $this->employees->keyBy('id');
        $totals = fn (Collection $rows) => [
            'gross' => round((float) $rows->sum('gross_pay'), 2),
            'net' => round((float) $rows->sum('net_pay'), 2),
            'overtime' => round((float) $rows->sum('ot_pay') + (float) $rows->sum('night_diff_pay'), 2),
            'employer' => round((float) $rows->sum(fn (Payslip $p) => $p->employerContributions()), 2),
            'employeeContributions' => round((float) $rows->sum(fn (Payslip $p) => $p->employeeContributions()), 2),
            'tax' => round((float) $rows->sum('withholding_tax'), 2),
            'thirteenth' => round((float) $rows->sum('thirteenth_month_accrual'), 2),
            'employees' => $rows->pluck('employee_id')->unique()->count(),
        ];

        $trendFrom = $this->to->copy()->startOfMonth()->subMonthsNoOverflow(11);
        $trendSlips = $payslips($trendFrom, $this->to->copy()->endOfMonth())->load('payrollRun.period:id,end_date');

        $active = $this->employedOn($this->to->copy()->min(Carbon::today()));

        return [
            ...$totals($slips),
            'runs' => $runs($this->from, $this->to)->count(),
            'unreleased' => PayrollRun::query()->withoutEntityScope()->where('entity_id', $this->entityId)
                ->whereIn('status', [PayrollRun::STATUS_DRAFT, PayrollRun::STATUS_APPROVED])
                ->whereHas('period', fn ($q) => $q->whereDate('end_date', '>=', $this->from->toDateString())->whereDate('end_date', '<=', $this->to->toDateString()))->count(),
            'monthlyRunRate' => round((float) $active->sum(fn (Employee $e) => $e->monthlyRate()), 2),
            'trend' => collect(range(11, 0))->map(function (int $back) use ($trendSlips, $totals) {
                $month = $this->to->copy()->startOfMonth()->subMonthsNoOverflow($back)->format('Y-m');
                $rows = $trendSlips->filter(fn (Payslip $p) => $p->payrollRun?->period?->end_date?->format('Y-m') === $month);

                return ['month' => $month, ...$totals($rows)];
            })->values(),
            'byEmployee' => $slips->groupBy('employee_id')
                ->map(fn ($rows, $id) => [...$this->person($names[$id] ?? null), ...$totals($rows)])
                ->sortByDesc('gross')->values(),
        ];
    }

    // -----------------------------------------------------------------------------------------

    /** @return array{id: int, code: string, name: string, position: ?string, avatarUrl: ?string} */
    private function person(?Employee $e): array
    {
        return [
            'id' => $e?->id ?? 0,
            'code' => $e?->employee_code ?? '',
            'name' => $e?->name ?? '—',
            'position' => $e?->position,
            'avatarUrl' => $e?->avatar_url,
        ];
    }

    private function dailyRate(?Employee $e): float
    {
        return $e ? $e->monthlyRate() * 12 / (int) config('people.timekeeping.days_per_year', 313) : 0.0;
    }
}
