<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\ComplianceItem;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\PayrollAdjustment;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Services\Payroll\PayslipPresenter;
use App\Services\People\EmployeeResolver;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * My Pay: the signed-in employee's own pay history for a year — payslips, government contributions
 * (with whether the company has remitted them), the tax and 13th month picture, and benefits & loans.
 *
 * Only posted or paid payroll counts; a draft or approved run can still change. A payslip belongs to
 * the year and month its cut-off ends in, the same rule the compliance calendar uses for remittances.
 */
class MyPayController extends Controller
{
    /** Contribution => compliance filing that remits it. */
    private const REMITTANCES = ['sss' => 'SSS-R5', 'philhealth' => 'PHIC-RF1', 'pagibig' => 'HDMF-MCRF', 'tax' => '1601-C'];

    public function __construct(protected EmployeeResolver $employeeResolver) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $employee = $this->employeeResolver->forUser($request->user(), $entityContext->id());

        if (! $employee) {
            return Inertia::render('employee-management/my-pay/page', ['employee' => null]);
        }

        $all = Payslip::query()
            ->with(['payrollRun.period', 'employee'])
            ->where('employee_id', $employee->id)
            ->whereHas('payrollRun', fn ($q) => $q->whereIn('status', PayrollRun::RELEASED_STATUSES))
            ->get()
            ->filter(fn (Payslip $p) => $p->payrollRun?->period !== null)
            ->sortByDesc(fn (Payslip $p) => $p->payrollRun->period->end_date->toDateString())
            ->values();

        $years = $all->map(fn (Payslip $p) => (int) $p->payrollRun->period->end_date->year)->unique()->sortDesc()->values();
        $year = $years->contains($request->integer('year')) ? $request->integer('year') : ($years->first() ?? (int) now()->year);
        $slips = $all->filter(fn (Payslip $p) => (int) $p->payrollRun->period->end_date->year === $year)->values();

        return Inertia::render('employee-management/my-pay/page', [
            'employee' => $this->profile($employee),
            'year' => $year,
            'years' => $years->all(),
            'summary' => $this->summary($slips),
            'payslips' => $slips->map(fn (Payslip $p) => $this->payslip($p))->all(),
            'contributions' => $this->contributions($slips),
            'benefits' => $this->benefits($employee, $slips),
            'adjustments' => $this->adjustments($employee, $slips),
        ]);
    }

    private function profile(Employee $employee): array
    {
        return [
            ...$employee->only(['id', 'employee_code', 'name', 'position', 'pay_type', 'sss_number', 'philhealth_number', 'pagibig_number', 'tin']),
            'hire_date' => $employee->hire_date?->toDateString(),
        ];
    }

    private function payslip(Payslip $p): array
    {
        $run = $p->payrollRun;
        $period = $run->period;

        return [
            ...PayslipPresenter::present($p),
            'run' => ['run_no' => $run->run_no, 'status' => $run->status, 'paid_on' => $run->paid_on?->toDateString()],
            'period' => [
                'code' => $period->code,
                'start_date' => $period->start_date->toDateString(),
                'end_date' => $period->end_date->toDateString(),
                'pay_date' => $period->pay_date?->toDateString(),
            ],
        ];
    }

    /**
     * @param  Collection<int, Payslip>  $slips
     */
    private function summary(Collection $slips): array
    {
        $sum = fn (string ...$columns) => round($slips->sum(fn (Payslip $p) => array_sum(array_map(fn ($c) => (float) $p->{$c}, $columns))), 2);

        return [
            'payslips' => $slips->count(),
            'gross' => $sum('gross_pay'),
            'net' => $sum('net_pay'),
            'contributions' => $sum('sss', 'philhealth', 'pagibig'),
            'employer_contributions' => $sum('sss_er', 'sss_ec', 'philhealth_er', 'pagibig_er'),
            'non_taxable_allowances' => $sum('non_taxable_allowances'),
            'taxable_income' => $sum('taxable_income'),
            'withholding_tax' => $sum('withholding_tax'),
            'thirteenth_month' => $sum('thirteenth_month_accrual'),
            'benefit_deductions' => $sum('benefit_deductions'),
            'is_mwe' => $slips->contains(fn (Payslip $p) => (bool) $p->is_mwe),
        ];
    }

    /**
     * Month by month, with whether each remittance has been filed with the agency.
     *
     * @param  Collection<int, Payslip>  $slips
     */
    private function contributions(Collection $slips): array
    {
        $byMonth = $slips->groupBy(fn (Payslip $p) => $p->payrollRun->period->end_date->format('Y-m'))->sortKeys();

        $periods = $byMonth->keys()->map(fn (string $ym) => Carbon::createFromFormat('Y-m-d', $ym.'-01')->format('F Y'));
        $filings = ComplianceItem::query()
            ->whereIn('form_code', array_values(self::REMITTANCES))
            ->whereIn('period', $periods)
            ->get(['form_code', 'period', 'status', 'submitted_at', 'verified_at'])
            ->keyBy(fn (ComplianceItem $c) => $c->form_code.'|'.$c->period);

        return $byMonth->map(function (Collection $rows, string $ym) use ($filings) {
            $sum = fn (string $column) => round($rows->sum(fn (Payslip $p) => (float) $p->{$column}), 2);
            $label = Carbon::createFromFormat('Y-m-d', $ym.'-01')->format('F Y');

            return [
                'month' => $ym,
                'payslips' => $rows->count(),
                'sss' => $sum('sss'),
                'sss_er' => $sum('sss_er'),
                'sss_ec' => $sum('sss_ec'),
                'philhealth' => $sum('philhealth'),
                'philhealth_er' => $sum('philhealth_er'),
                'pagibig' => $sum('pagibig'),
                'pagibig_er' => $sum('pagibig_er'),
                'withholding_tax' => $sum('withholding_tax'),
                'remittances' => collect(self::REMITTANCES)->map(function (string $form) use ($filings, $label) {
                    $item = $filings->get($form.'|'.$label);

                    return $item ? [
                        'status' => $item->status,
                        'filed_on' => ($item->verified_at ?? $item->submitted_at)?->toDateString(),
                    ] : null;
                })->all(),
            ];
        })->values()->all();
    }

    /**
     * Current enrollments, plus what each program actually took or paid on this year's payslips.
     *
     * @param  Collection<int, Payslip>  $slips
     */
    private function benefits(Employee $employee, Collection $slips): array
    {
        $paid = [];
        foreach ($slips as $p) {
            foreach ($p->meta['benefits'] ?? [] as $line) {
                $id = $line['id'] ?? null;
                if ($id === null) {
                    continue;
                }
                $paid[$id] ??= ['employee' => 0.0, 'employer' => 0.0, 'earning' => 0.0];
                foreach (['employee', 'employer', 'earning'] as $k) {
                    $paid[$id][$k] = round($paid[$id][$k] + (float) ($line[$k] ?? 0), 2);
                }
            }
        }

        return EmployeeBenefit::query()
            ->with('program:id,code,name,category,contribution_basis,payroll_mode,is_taxable')
            ->where('employee_id', $employee->id)
            ->orderByRaw("participation_status = 'active' desc")
            ->orderByDesc('effective_date')
            ->get()
            ->map(fn (EmployeeBenefit $b) => [
                'id' => $b->id,
                'program' => $b->program?->only(['code', 'name', 'category', 'contribution_basis', 'payroll_mode', 'is_taxable']),
                'status' => $b->participation_status,
                'employee_share' => (float) $b->employee_share,
                'employer_share' => (float) $b->employer_share,
                'effective_date' => $b->effective_date?->toDateString(),
                'end_date' => $b->end_date?->toDateString(),
                'year_to_date' => $paid[$b->id] ?? ['employee' => 0.0, 'employer' => 0.0, 'earning' => 0.0],
            ])
            ->all();
    }

    /**
     * Loans, cash advances, allowances and other one-off lines on this year's payslips.
     *
     * @param  Collection<int, Payslip>  $slips
     */
    private function adjustments(Employee $employee, Collection $slips): array
    {
        $runs = $slips->mapWithKeys(fn (Payslip $p) => [$p->payroll_run_id => $p->payrollRun]);

        return PayrollAdjustment::query()
            ->where('employee_id', $employee->id)
            ->whereIn('payroll_run_id', $runs->keys())
            ->get()
            ->map(function (PayrollAdjustment $a) use ($runs) {
                $period = $runs->get($a->payroll_run_id)?->period;

                return [
                    'id' => $a->id,
                    'date' => ($period?->pay_date ?? $period?->end_date)?->toDateString(),
                    'period_code' => $period?->code,
                    'kind' => $a->kind,
                    'category' => $a->category,
                    'category_label' => PayrollAdjustment::CATEGORIES[$a->category][1] ?? $a->category,
                    'description' => $a->description,
                    'amount' => (float) $a->amount,
                ];
            })
            ->sortByDesc('date')
            ->values()
            ->all();
    }
}
