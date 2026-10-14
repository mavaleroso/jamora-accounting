<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\Employee;
use App\Models\PayrollAdjustment;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Services\Payroll\PayrollCalculator;
use App\Services\Payroll\PayrollService;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Payroll: pay periods of a year with their run status, and the run workspace
 * (register, pre-approval checks, adjustments, remittances, approval / posting / release).
 */
class PayrollRunsController extends Controller
{
    public function __construct(protected PayrollService $payrollService) {}

    public function index(Request $request): Response
    {
        $year = $request->integer('year') ?: (int) now()->year;

        $periods = PayrollPeriod::query()
            ->with('activeRun')
            ->whereYear('start_date', $year)
            ->orderBy('start_date')
            ->get();

        $released = PayrollRun::query()
            ->whereIn('status', PayrollRun::RELEASED_STATUSES)
            ->whereHas('period', fn ($q) => $q->whereYear('start_date', $year))
            ->pluck('id');
        $ytd = Payslip::query()->whereIn('payroll_run_id', $released);
        $sum = fn (string ...$cols) => round(collect($cols)->sum(fn ($c) => (float) (clone $ytd)->sum($c)), 2);

        $today = Carbon::today();
        $next = $periods->first(fn (PayrollPeriod $p) => ! in_array($p->activeRun?->status, [PayrollRun::STATUS_POSTED, PayrollRun::STATUS_PAID], true));

        return Inertia::render('payroll/runs/page', [
            'year' => $year,
            'years' => PayrollPeriod::query()->get(['start_date'])->toBase()->map(fn (PayrollPeriod $p) => $p->start_date->year)
                ->push($year)->push((int) now()->year)->unique()->sortDesc()->values(),
            'periods' => $periods->map(fn (PayrollPeriod $p) => [
                ...$p->only(['id', 'code', 'frequency', 'status']),
                'start_date' => $p->start_date->toDateString(),
                'end_date' => $p->end_date->toDateString(),
                'pay_date' => $p->pay_date?->toDateString(),
                'run' => $p->activeRun ? [
                    ...$p->activeRun->only(['id', 'run_no', 'status', 'headcount']),
                    'gross_total' => (float) $p->activeRun->gross_total,
                    'net_total' => (float) $p->activeRun->net_total,
                    'employer_total' => (float) $p->activeRun->employer_total,
                    'issues' => collect($p->activeRun->warnings ?? [])->whereIn('level', ['warning', 'error'])->sum('count'),
                ] : null,
            ]),
            'ytd' => [
                'gross' => $sum('gross_pay'),
                'net' => $sum('net_pay'),
                'withholding_tax' => $sum('withholding_tax'),
                'employee_contributions' => $sum('sss', 'philhealth', 'pagibig'),
                'employer_contributions' => $sum('sss_er', 'sss_ec', 'philhealth_er', 'pagibig_er'),
                'thirteenth_month' => $sum('thirteenth_month_accrual'),
                'runs' => $released->count(),
            ],
            'next' => $next ? ['id' => $next->id, 'code' => $next->code, 'pay_date' => $next->pay_date?->toDateString(), 'end_date' => $next->end_date->toDateString(), 'run_id' => $next->activeRun?->id, 'status' => $next->activeRun?->status] : null,
            'activeEmployees' => Employee::query()->where('is_active', true)->where('employment_status', 'active')->count(),
            'policy' => [
                'contributionSchedule' => config('people.payroll.contribution_schedule'),
                'minimumWage' => (float) config('people.payroll.minimum_wage_daily'),
                'daysPerYear' => (int) config('people.timekeeping.days_per_year'),
                'payDays' => config('people.payroll.pay_days'),
            ],
            'today' => $today->toDateString(),
        ]);
    }

    public function show(PayrollRun $payrollRun): Response
    {
        $run = $payrollRun->load([
            'period', 'computer:id,firstname,lastname', 'approver:id,firstname,lastname', 'poster:id,firstname,lastname',
            'payer:id,firstname,lastname', 'journalEntry:id,entry_no,status', 'paymentJournalEntry:id,entry_no,status', 'bankAccount:id,name,bank_name',
        ]);

        $payslips = $run->payslips()
            ->with('employee:id,employee_code,firstname,middlename,lastname,avatar,position,department,pay_type,basic_pay,bank_name,bank_account_no,tin,sss_number,philhealth_number,pagibig_number')
            ->get()
            ->sortBy(fn (Payslip $p) => $p->employee?->lastname.' '.$p->employee?->firstname)
            ->values();

        $name = fn ($u) => $u ? trim("{$u->firstname} {$u->lastname}") : null;
        $col = fn (string ...$c) => round(collect($c)->sum(fn ($x) => (float) $payslips->sum($x)), 2);

        return Inertia::render('payroll/runs/show', [
            'run' => [
                ...$run->only(['id', 'run_no', 'status', 'headcount', 'notes']),
                'gross_total' => (float) $run->gross_total,
                'deduction_total' => (float) $run->deduction_total,
                'net_total' => (float) $run->net_total,
                'employer_total' => (float) $run->employer_total,
                'period' => [
                    ...$run->period->only(['id', 'code', 'frequency', 'status']),
                    'start_date' => $run->period->start_date->toDateString(),
                    'end_date' => $run->period->end_date->toDateString(),
                    'pay_date' => $run->period->pay_date?->toDateString(),
                    'second_cutoff' => $run->period->isSecondCutoff(),
                ],
                'timeline' => [
                    'computed' => ['at' => $run->computed_at?->toIso8601String(), 'by' => $name($run->computer)],
                    'approved' => ['at' => $run->approved_at?->toIso8601String(), 'by' => $name($run->approver)],
                    'posted' => ['at' => $run->posted_at?->toIso8601String(), 'by' => $name($run->poster), 'entry' => $run->journalEntry?->only(['id', 'entry_no', 'status'])],
                    'paid' => ['at' => $run->paid_at?->toIso8601String(), 'by' => $name($run->payer), 'on' => $run->paid_on?->toDateString(), 'bank' => $run->bankAccount?->name, 'entry' => $run->paymentJournalEntry?->only(['id', 'entry_no', 'status'])],
                ],
                'contribution_share' => app(PayrollCalculator::class)->contributionShare($run->period),
            ],
            'checks' => $run->isDraft() ? $this->payrollService->preflight($run) : ($run->warnings ?? []),
            'payslips' => $payslips->map(fn (Payslip $p) => $this->presentPayslip($p)),
            'totals' => [
                'basic_pay' => $col('basic_pay'),
                'deductions_from_basic' => $col('absences', 'tardiness', 'unpaid_leave'),
                'ot_pay' => $col('ot_pay'),
                'holiday_pay' => $col('holiday_pay', 'night_diff_pay'),
                'allowances' => $col('taxable_allowances', 'non_taxable_allowances'),
                'gross_pay' => $col('gross_pay'),
                'contributions' => $col('sss', 'philhealth', 'pagibig'),
                'withholding_tax' => $col('withholding_tax'),
                'other_deductions' => $col('other_deductions'),
                'net_pay' => $col('net_pay'),
                'employer' => $col('sss_er', 'sss_ec', 'philhealth_er', 'pagibig_er'),
                'thirteenth_month' => $col('thirteenth_month_accrual'),
            ],
            'remittances' => [
                ['agency' => 'SSS', 'form' => 'R-5 / PRN · R-3 collection list', 'employee' => $col('sss'), 'employer' => $col('sss_er'), 'ec' => $col('sss_ec')],
                ['agency' => 'PhilHealth', 'form' => 'RF-1 / EPRS', 'employee' => $col('philhealth'), 'employer' => $col('philhealth_er'), 'ec' => 0],
                ['agency' => 'Pag-IBIG', 'form' => 'MCRF', 'employee' => $col('pagibig'), 'employer' => $col('pagibig_er'), 'ec' => 0],
                ['agency' => 'BIR', 'form' => '1601-C (withholding tax on compensation)', 'employee' => $col('withholding_tax'), 'employer' => 0, 'ec' => 0],
            ],
            'adjustmentCategories' => collect(PayrollAdjustment::CATEGORIES)->map(fn ($c, $key) => ['key' => $key, 'kind' => $c[0], 'label' => $c[1], 'taxable' => $c[2]])->values(),
            'bankAccounts' => BankAccount::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'bank_name', 'account_number']),
        ]);
    }

    public function compute(Request $request, PayrollPeriod $payrollPeriod): RedirectResponse
    {
        $run = $this->payrollService->compute($payrollPeriod, $request->user());

        return redirect()->route('payroll.runs.show', $run)->with('status', "Payroll for {$payrollPeriod->code} computed for {$run->headcount} employees. Review it before approving.");
    }

    public function recompute(Request $request, PayrollRun $payrollRun): RedirectResponse
    {
        $this->payrollService->compute($payrollRun->period, $request->user());

        return redirect()->back()->with('status', 'Payroll recomputed with the latest time records, leave and adjustments.');
    }

    public function approve(Request $request, PayrollRun $payrollRun): RedirectResponse
    {
        $this->payrollService->approve($payrollRun, $request->user());

        return redirect()->back()->with('status', 'Payroll approved. Time records for this cut-off are now locked.');
    }

    public function reopen(PayrollRun $payrollRun): RedirectResponse
    {
        $this->payrollService->reopen($payrollRun);

        return redirect()->back()->with('status', 'Payroll returned to draft. Time records are unlocked for corrections.');
    }

    public function post(Request $request, PayrollRun $payrollRun): RedirectResponse
    {
        $run = $this->payrollService->post($payrollRun, $request->user());

        return redirect()->back()->with('status', 'Payroll posted to the general ledger'.($run->journalEntry ? " as {$run->journalEntry->entry_no}." : '.'));
    }

    public function pay(Request $request, PayrollRun $payrollRun): RedirectResponse
    {
        $data = $request->validate([
            'paid_on' => ['required', 'date'],
            'bank_account_id' => ['nullable', 'integer', Rule::exists('bank_accounts', 'id')],
        ]);

        $bank = isset($data['bank_account_id']) ? BankAccount::query()->find($data['bank_account_id']) : null;
        $this->payrollService->pay($payrollRun, $request->user(), $data['paid_on'], $bank);

        return redirect()->back()->with('status', 'Payroll released. Payslips are now visible to employees.');
    }

    public function void(PayrollRun $payrollRun): RedirectResponse
    {
        $this->payrollService->void($payrollRun);

        return redirect()->route('payroll.runs.index', ['year' => $payrollRun->period->start_date->year])->with('status', "Draft {$payrollRun->run_no} voided.");
    }

    public function storeAdjustment(Request $request, PayrollRun $payrollRun): RedirectResponse
    {
        if (! $payrollRun->isDraft()) {
            throw ValidationException::withMessages(['status' => 'Adjustments can only be added to a draft payroll.']);
        }

        $data = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('payslips', 'employee_id')->where('payroll_run_id', $payrollRun->id)],
            'category' => ['required', Rule::in(array_keys(PayrollAdjustment::CATEGORIES))],
            'description' => ['nullable', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999'],
            'taxable' => ['nullable', 'boolean'],
        ], [
            'employee_id.exists' => 'Pick an employee included in this payroll.',
        ]);

        [$kind, $label, $taxableDefault] = PayrollAdjustment::CATEGORIES[$data['category']];

        $payrollRun->adjustments()->create([
            'entity_id' => $payrollRun->entity_id,
            'employee_id' => $data['employee_id'],
            'kind' => $kind,
            'category' => $data['category'],
            'description' => ($data['description'] ?? null) ?: $label,
            'amount' => $data['amount'],
            'taxable' => $kind === PayrollAdjustment::KIND_EARNING ? ($data['taxable'] ?? $taxableDefault) : false,
            'created_by' => $request->user()->id,
        ]);

        $this->payrollService->compute($payrollRun->period, $request->user());

        return redirect()->back()->with('status', "{$label} added and payroll recomputed.");
    }

    public function destroyAdjustment(Request $request, PayrollRun $payrollRun, PayrollAdjustment $adjustment): RedirectResponse
    {
        if (! $payrollRun->isDraft() || $adjustment->payroll_run_id !== $payrollRun->id) {
            throw ValidationException::withMessages(['status' => 'Adjustments can only be removed from a draft payroll.']);
        }

        $adjustment->delete();
        $this->payrollService->compute($payrollRun->period, $request->user());

        return redirect()->back()->with('status', 'Adjustment removed and payroll recomputed.');
    }

    /**
     * CSV downloads: the payroll register, or the bank disbursement list for crediting payroll accounts.
     */
    public function export(PayrollRun $payrollRun, string $type): StreamedResponse
    {
        abort_unless(in_array($type, ['register', 'bank'], true), 404);

        $payslips = $payrollRun->payslips()->with('employee')->get()->sortBy(fn (Payslip $p) => $p->employee?->lastname)->values();
        $filename = "{$payrollRun->run_no}-{$type}.csv";

        [$header, $rows] = $type === 'bank'
            ? $this->bankRows($payslips)
            : $this->registerRows($payslips);

        return response()->streamDownload(function () use ($header, $rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $header);
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    // -----------------------------------------------------------------------------------------

    private function presentPayslip(Payslip $p): array
    {
        $e = $p->employee;

        return [
            'id' => $p->id,
            'employee' => $e ? [
                ...$e->only(['id', 'employee_code', 'firstname', 'lastname', 'name', 'avatar_url', 'position', 'department', 'pay_type', 'bank_name']),
                'basic_rate' => (float) $e->basic_pay,
                'bank_account_hint' => $e->bank_account_no ? '•••• '.substr((string) $e->bank_account_no, -4) : null,
            ] : null,
            ...collect([
                'basic_pay', 'ot_pay', 'holiday_pay', 'night_diff_pay', 'taxable_allowances', 'non_taxable_allowances',
                'absences', 'tardiness', 'unpaid_leave', 'gross_pay', 'sss', 'sss_er', 'sss_ec', 'philhealth', 'philhealth_er',
                'pagibig', 'pagibig_er', 'taxable_income', 'withholding_tax', 'other_deductions', 'net_pay', 'thirteenth_month_accrual',
            ])->mapWithKeys(fn ($c) => [$c => (float) $p->{$c}])->all(),
            'is_mwe' => (bool) $p->is_mwe,
            'total_deductions' => $p->totalDeductions(),
            'employer_contributions' => $p->employerContributions(),
            'meta' => $p->meta ?? [],
        ];
    }

    /**
     * @param  Collection<int, Payslip>  $payslips
     */
    private function registerRows(Collection $payslips): array
    {
        $header = [
            'Employee No.', 'Employee', 'Position', 'Pay type', 'Days worked', 'Basic pay', 'Absences / not employed', 'Late & undertime', 'Unpaid leave',
            'Overtime', 'Holiday & rest-day pay', 'Night differential', 'Taxable allowances', 'Non-taxable allowances', 'Gross pay',
            'SSS (EE)', 'PhilHealth (EE)', 'Pag-IBIG (EE)', 'Taxable income', 'Withholding tax', 'Other deductions', 'Net pay',
            'SSS (ER)', 'SSS EC', 'PhilHealth (ER)', 'Pag-IBIG (ER)', '13th month accrual', 'MWE',
        ];

        $rows = $payslips->map(fn (Payslip $p) => [
            $p->employee?->employee_code, $p->employee?->name, $p->employee?->position, $p->employee?->pay_type, $p->meta['days']['worked'] ?? '',
            $p->basic_pay, $p->absences, $p->tardiness, $p->unpaid_leave, $p->ot_pay, $p->holiday_pay, $p->night_diff_pay,
            $p->taxable_allowances, $p->non_taxable_allowances, $p->gross_pay, $p->sss, $p->philhealth, $p->pagibig,
            $p->taxable_income, $p->withholding_tax, $p->other_deductions, $p->net_pay,
            $p->sss_er, $p->sss_ec, $p->philhealth_er, $p->pagibig_er, $p->thirteenth_month_accrual, $p->is_mwe ? 'Yes' : 'No',
        ])->all();

        return [$header, $rows];
    }

    /**
     * @param  Collection<int, Payslip>  $payslips
     */
    private function bankRows(Collection $payslips): array
    {
        $rows = $payslips
            ->filter(fn (Payslip $p) => (float) $p->net_pay > 0)
            ->map(fn (Payslip $p) => [
                $p->employee?->employee_code,
                $p->employee?->name,
                $p->employee?->bank_name ?: 'CASH / CHEQUE',
                $p->employee?->bank_account_no ?: '',
                number_format((float) $p->net_pay, 2, '.', ''),
            ])->values()->all();

        return [['Employee No.', 'Account name', 'Bank', 'Account number', 'Net pay'], $rows];
    }
}
