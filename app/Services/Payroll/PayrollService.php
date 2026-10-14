<?php

namespace App\Services\Payroll;

use App\Exceptions\AccountingException;
use App\Models\Account;
use App\Models\AccountType;
use App\Models\AttendanceRequest;
use App\Models\BankAccount;
use App\Models\BenefitProgram;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Models\LeaveRequest;
use App\Models\PayrollAdjustment;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\User;
use App\Services\Accounting\JournalPostingService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Payroll run lifecycle:
 *
 *   compute  -> draft     payslips computed from approved time records, leave and adjustments; recomputable
 *   approve  -> approved  cut-off time records are locked so the numbers cannot drift
 *   reopen   -> draft     (approved only) unlocks the time records for corrections
 *   post     -> posted    journal entry: salaries + employer contributions vs. statutory payables and net pay
 *   pay      -> paid      payment entry: salaries payable vs. the paying bank; payslips become final
 *   void     -> void      (draft only) discards the run so the period can be computed again
 */
class PayrollService
{
    public function __construct(
        protected JournalPostingService $journalPostingService,
        protected PayrollCalculator $calculator
    ) {}

    /**
     * Compute the period's draft run, creating it if the period has none.
     */
    public function compute(PayrollPeriod $period, User|int $user): PayrollRun
    {
        $userId = $user instanceof User ? $user->id : $user;
        $run = $period->activeRun()->first();

        if ($run && ! $run->isDraft()) {
            throw ValidationException::withMessages([
                'payroll_period_id' => "Payroll for {$period->code} is already {$run->status}. Return it to draft before recomputing.",
            ]);
        }

        return DB::transaction(function () use ($period, $run, $userId) {
            $run ??= PayrollRun::query()->create([
                'entity_id' => $period->entity_id,
                'payroll_period_id' => $period->id,
                'run_no' => $this->nextRunNo($period),
                'status' => PayrollRun::STATUS_DRAFT,
            ]);

            $this->computeInto($run, $period, $userId);
            $period->update(['status' => 'processing']);

            return $run->fresh(['payslips.employee']);
        });
    }

    public function approve(PayrollRun $run, User $user): PayrollRun
    {
        $this->assertStatus($run, PayrollRun::STATUS_DRAFT, 'approved');

        $negative = $run->payslips()->where('net_pay', '<', 0)->count();
        if ($negative > 0) {
            throw ValidationException::withMessages([
                'status' => "{$negative} payslip(s) have negative net pay. Reduce their deductions before approving.",
            ]);
        }
        if ($run->payslips()->count() === 0) {
            throw ValidationException::withMessages(['status' => 'There are no payslips to approve.']);
        }

        return DB::transaction(function () use ($run, $user) {
            $period = $run->period;

            // Lock the cut-off so time records cannot change under an approved payroll.
            DtrEntry::query()
                ->withoutEntityScope()
                ->whereIn('employee_id', $run->payslips()->pluck('employee_id'))
                ->whereBetween('work_date', [$period->start_date->toDateString(), $period->end_date->toDateString()])
                ->update(['status' => DtrEntry::STATUS_LOCKED, 'payroll_period_id' => $period->id]);

            $run->update([
                'status' => PayrollRun::STATUS_APPROVED,
                'approved_by' => $user->id,
                'approved_at' => now(),
            ]);

            return $run->fresh();
        });
    }

    /**
     * Send an approved run back to draft and unlock its time records for corrections.
     */
    public function reopen(PayrollRun $run): PayrollRun
    {
        $this->assertStatus($run, PayrollRun::STATUS_APPROVED, 'returned to draft');

        return DB::transaction(function () use ($run) {
            $this->unlockTimeRecords($run);
            $run->update(['status' => PayrollRun::STATUS_DRAFT, 'approved_by' => null, 'approved_at' => null]);

            return $run->fresh();
        });
    }

    /**
     * Book the payroll in the general ledger.
     *
     *   Dr Salaries and Wages                     gross pay
     *   Dr Employer Statutory Contributions       SSS ER + EC, PhilHealth ER, Pag-IBIG ER
     *   Dr Employee Benefits Expense              employer share of benefit programs (HMO, insurance...)
     *      Cr SSS / PhilHealth / Pag-IBIG Payable  employee + employer shares
     *      Cr Withholding Tax Payable              tax withheld
     *      Cr Other Payroll Deductions Payable     loans, cash advances...
     *      Cr Employee Benefits Payable            benefit programs, employee + employer shares
     *      Cr Salaries Payable                     net pay
     */
    public function post(PayrollRun $run, User|int $user): PayrollRun
    {
        $user = $user instanceof User ? $user : User::findOrFail($user);
        $this->assertStatus($run, PayrollRun::STATUS_APPROVED, 'posted');

        return DB::transaction(function () use ($run, $user) {
            $p = $run->payslips;
            $sum = fn (string $col) => round((float) $p->sum($col), 2);

            $lines = array_values(array_filter([
                $this->line('salaries_expense', $sum('gross_pay'), 0, 'Gross pay'),
                $this->line('employer_contributions', $sum('sss_er') + $sum('sss_ec') + $sum('philhealth_er') + $sum('pagibig_er'), 0, 'Employer share — SSS, EC, PhilHealth, Pag-IBIG'),
                $this->line('benefits_expense', $sum('employer_benefits'), 0, 'Employer share — benefit programs'),
                $this->line('sss_payable', 0, $sum('sss') + $sum('sss_er') + $sum('sss_ec'), 'SSS contributions (EE + ER + EC)'),
                $this->line('philhealth_payable', 0, $sum('philhealth') + $sum('philhealth_er'), 'PhilHealth premiums (EE + ER)'),
                $this->line('pagibig_payable', 0, $sum('pagibig') + $sum('pagibig_er'), 'Pag-IBIG contributions (EE + ER)'),
                $this->line('withholding_tax_payable', 0, $sum('withholding_tax'), 'Withholding tax on compensation'),
                $this->line('other_deductions_payable', 0, $sum('other_deductions') - $sum('benefit_deductions'), 'Loans and other payroll deductions'),
                $this->line('benefits_payable', 0, $sum('benefit_deductions') + $sum('employer_benefits'), 'Benefit programs (EE + ER)'),
                $this->line('salaries_payable', 0, $sum('net_pay'), 'Net pay'),
            ]));

            $entry = $this->journalEntry([
                'journal_id' => $this->journal()->id,
                'entry_date' => $run->period->pay_date?->toDateString() ?? $run->period->end_date->toDateString(),
                'reference' => $run->run_no,
                'memo' => "Payroll {$run->period->code} ({$run->period->start_date->format('M j')}–{$run->period->end_date->format('M j, Y')})",
                'source_system' => 'payroll',
                'source_type' => 'payroll_run',
                'source_id' => $run->id,
            ], $lines, $user);

            $run->update([
                'status' => PayrollRun::STATUS_POSTED,
                'journal_entry_id' => $entry->id,
                'posted_by' => $user->id,
                'posted_at' => now(),
            ]);
            $run->period->update(['status' => 'posted']);

            return $run->fresh();
        });
    }

    /**
     * Record the release of net pay: Dr Salaries Payable / Cr the paying bank account.
     */
    public function pay(PayrollRun $run, User $user, string $paidOn, ?BankAccount $bank = null): PayrollRun
    {
        $this->assertStatus($run, PayrollRun::STATUS_POSTED, 'released');

        return DB::transaction(function () use ($run, $user, $paidOn, $bank) {
            $net = round((float) $run->payslips()->sum('net_pay'), 2);
            $bankAccountId = $bank?->gl_account_id ?: $this->account('cash_in_bank')->id;

            $entry = $this->journalEntry([
                'journal_id' => $this->journal()->id,
                'entry_date' => $paidOn,
                'reference' => $run->run_no.'-PAY',
                'memo' => "Release of payroll {$run->period->code}".($bank ? " via {$bank->name}" : ''),
                'source_system' => 'payroll',
                'source_type' => 'payroll_payment',
                'source_id' => $run->id,
            ], [
                $this->line('salaries_payable', $net, 0, 'Net pay released'),
                ['account_id' => $bankAccountId, 'debit' => 0, 'credit' => $net, 'memo' => 'Payroll disbursement'],
            ], $user);

            $run->update([
                'status' => PayrollRun::STATUS_PAID,
                'paid_by' => $user->id,
                'paid_at' => now(),
                'paid_on' => $paidOn,
                'bank_account_id' => $bank?->id,
                'payment_journal_entry_id' => $entry->id,
            ]);
            $run->period->update(['status' => 'paid']);

            return $run->fresh();
        });
    }

    public function void(PayrollRun $run): PayrollRun
    {
        $this->assertStatus($run, PayrollRun::STATUS_DRAFT, 'voided');

        $run->update(['status' => PayrollRun::STATUS_VOID, 'voided_at' => now()]);
        $run->period->update(['status' => 'open']);

        return $run;
    }

    /**
     * Run-level checks shown before approval. Each item: [level, message, count].
     *
     * @return array<int, array{level: string, message: string, count: int, key: string}>
     */
    public function preflight(PayrollRun $run): array
    {
        $period = $run->period;
        $range = [$period->start_date->toDateString(), $period->end_date->toDateString()];
        $employeeIds = $run->payslips()->pluck('employee_id');
        $items = [];
        $add = function (string $key, string $level, int $count, string $message) use (&$items) {
            if ($count > 0) {
                $items[] = compact('key', 'level', 'count', 'message');
            }
        };

        $add('open_records', 'warning', DtrEntry::query()->withoutEntityScope()->whereIn('employee_id', $employeeIds)
            ->whereBetween('work_date', $range)->where('status', DtrEntry::STATUS_OPEN)->count(),
            'time records in this cut-off are not yet approved in Time & Attendance.');

        $add('incomplete', 'warning', DtrEntry::query()->withoutEntityScope()->whereIn('employee_id', $employeeIds)
            ->whereBetween('work_date', $range)->where('attendance_status', 'incomplete')->count(),
            'time records have a missing punch and are not paid.');

        $add('pending_requests', 'warning',
            AttendanceRequest::query()->withoutEntityScope()->whereIn('employee_id', $employeeIds)->where('status', 'pending')->whereBetween('work_date', $range)->count()
            + LeaveRequest::query()->withoutEntityScope()->whereIn('employee_id', $employeeIds)->where('status', LeaveRequest::STATUS_PENDING)
                ->whereDate('start_date', '<=', $range[1])->whereDate('end_date', '>=', $range[0])->count(),
            'requests (leave, overtime, corrections…) in this cut-off are still pending — decide them, then recompute.');

        $payslips = $run->payslips()->with('employee:id,bank_name,bank_account_no')->get();
        $add('negative_net', 'error', $payslips->where('net_pay', '<', 0)->count(), 'payslips have negative net pay — approval is blocked.');
        $add('no_record_days', 'info', $payslips->filter(fn (Payslip $p) => ($p->meta['days']['no_record'] ?? 0) > 0)->count(),
            'employees have working days without a time record — close those days in Time & Attendance.');
        $add('no_bank', 'info', $payslips->filter(fn (Payslip $p) => blank($p->employee?->bank_account_no))->count(),
            'employees have no payroll bank account and must be paid by cash or cheque.');
        $add('missing_ids', 'info', $payslips->filter(fn (Payslip $p) => collect($p->meta['warnings'] ?? [])->contains(fn ($w) => str_contains($w, 'number on file')))->count(),
            'employees are missing an SSS, PhilHealth, Pag-IBIG or TIN number needed for remittance.');

        return $items;
    }

    // -----------------------------------------------------------------------------------------

    protected function computeInto(PayrollRun $run, PayrollPeriod $period, int $userId): void
    {
        $start = $period->start_date->toDateString();
        $end = $period->end_date->toDateString();

        $run->payslips()->delete();

        // Everyone employed at any point of the cut-off and set to be paid.
        $employees = Employee::query()
            ->withoutEntityScope()
            ->where('entity_id', $period->entity_id)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('hire_date')->orWhereDate('hire_date', '<=', $end))
            ->where(fn ($q) => $q->whereNull('separation_date')->orWhereDate('separation_date', '>=', $start))
            ->whereIn('employment_status', ['active', 'separated'])
            ->orderBy('lastname')
            ->get();

        $dtrs = DtrEntry::query()
            ->withoutEntityScope()
            ->whereIn('employee_id', $employees->pluck('id'))
            ->whereBetween('work_date', [$start, $end])
            ->get()
            ->groupBy('employee_id');

        $leaves = LeaveRequest::query()
            ->withoutEntityScope()
            ->with('type:id,code,name,is_paid')
            ->whereIn('id', $dtrs->flatten()->pluck('leave_request_id')->filter()->unique())
            ->get()
            ->keyBy('id');

        $adjustments = PayrollAdjustment::query()->where('payroll_run_id', $run->id)->get()->groupBy('employee_id');

        $benefits = EmployeeBenefit::query()
            ->with('program')
            ->whereIn('employee_id', $employees->pluck('id'))
            ->whereHas('program', fn ($q) => $q->where('is_active', true)->whereIn('payroll_mode', [BenefitProgram::MODE_EARNING, BenefitProgram::MODE_CONTRIBUTION]))
            ->get()
            ->filter(fn (EmployeeBenefit $b) => $b->isEffectiveDuring($period->start_date, $period->end_date))
            ->groupBy('employee_id');

        $totals = ['gross' => 0.0, 'deductions' => 0.0, 'net' => 0.0, 'employer' => 0.0];
        foreach ($employees as $employee) {
            $data = $this->calculator->compute(
                $employee,
                $period,
                $dtrs->get($employee->id, collect()),
                $leaves,
                $adjustments->get($employee->id, collect()),
                $benefits->get($employee->id, collect()),
            );

            $payslip = $run->payslips()->create($data);

            $totals['gross'] += (float) $payslip->gross_pay;
            $totals['deductions'] += $payslip->totalDeductions();
            $totals['net'] += (float) $payslip->net_pay;
            $totals['employer'] += $payslip->employerContributions();
        }

        $run->update([
            'headcount' => $employees->count(),
            'gross_total' => round($totals['gross'], 2),
            'deduction_total' => round($totals['deductions'], 2),
            'net_total' => round($totals['net'], 2),
            'employer_total' => round($totals['employer'], 2),
            'computed_by' => $userId,
            'computed_at' => now(),
        ]);
        $run->update(['warnings' => $this->preflight($run->fresh())]);
    }

    protected function unlockTimeRecords(PayrollRun $run): void
    {
        DtrEntry::query()
            ->withoutEntityScope()
            ->where('payroll_period_id', $run->payroll_period_id)
            ->where('status', DtrEntry::STATUS_LOCKED)
            ->update(['status' => DtrEntry::STATUS_APPROVED]);
    }

    protected function nextRunNo(PayrollPeriod $period): string
    {
        $base = 'PR-'.$period->code;
        $taken = PayrollRun::query()->withoutEntityScope()->where('entity_id', $period->entity_id)->where('run_no', 'like', $base.'%')->count();

        return $taken === 0 ? $base : $base.'-'.($taken + 1);
    }

    protected function assertStatus(PayrollRun $run, string $expected, string $action): void
    {
        if ($run->status !== $expected) {
            throw ValidationException::withMessages([
                'status' => "Only a {$expected} payroll can be {$action}. This one is {$run->status}.",
            ]);
        }
    }

    /**
     * @return array{account_id: int, debit: float, credit: float, memo: string}|null
     */
    protected function line(string $key, float $debit, float $credit, string $memo): ?array
    {
        if (round($debit, 2) == 0 && round($credit, 2) == 0) {
            return null;
        }

        return ['account_id' => $this->account($key)->id, 'debit' => round($debit, 2), 'credit' => round($credit, 2), 'memo' => $memo];
    }

    /**
     * Payroll GL account by its config key. Accounts the chart is missing are added under the configured type.
     */
    protected function account(string $key): Account
    {
        $cfg = config("people.payroll.accounts.{$key}");
        $account = Account::query()->where('code', $cfg['code'])->first();
        if ($account) {
            return $account;
        }

        $type = AccountType::query()->where('name', $cfg['type'])->first();
        if (! $type) {
            throw ValidationException::withMessages([
                'status' => "GL account {$cfg['code']} {$cfg['name']} is missing from the chart of accounts.",
            ]);
        }

        return Account::query()->create([
            'code' => $cfg['code'],
            'name' => $cfg['name'],
            'account_type_id' => $type->id,
            'is_postable' => true,
            'is_active' => true,
        ]);
    }

    /**
     * Create the journal entry, reporting accounting setup problems (e.g. a closed period) as validation errors.
     */
    protected function journalEntry(array $data, array $lines, User $user): JournalEntry
    {
        try {
            return $this->journalPostingService->create($data, $lines, $user);
        } catch (AccountingException $e) {
            throw ValidationException::withMessages(['status' => $e->getMessage().' Open it in Accounting, then try again.']);
        }
    }

    protected function journal(): Journal
    {
        return Journal::query()->where('code', 'GJ')->first()
            ?? throw ValidationException::withMessages(['status' => 'The General Journal (GJ) is not set up in Accounting.']);
    }

    /**
     * Turn a date into the default pay day of a cut-off ("0" = last day of the month).
     */
    public static function payDay(Carbon $periodEnd, int $day): Carbon
    {
        return $day === 0 ? $periodEnd->copy()->endOfMonth() : $periodEnd->copy()->day(min($day, $periodEnd->daysInMonth));
    }
}
