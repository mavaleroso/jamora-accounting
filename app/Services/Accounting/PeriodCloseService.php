<?php

namespace App\Services\Accounting;

use App\Exceptions\AccountingException;
use App\Models\Account;
use App\Models\AccountingPeriod;
use App\Models\AccountPeriodBalance;
use App\Models\Journal;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PeriodCloseService
{
    public function __construct(
        protected JournalPostingService $journalPostingService
    ) {}

    public function softClose(AccountingPeriod $period, User $user): AccountingPeriod
    {
        if ($period->status === 'closed') {
            throw new AccountingException('A closed period cannot be soft-closed.');
        }

        $period->update([
            'status' => 'soft-closed',
            'closed_by' => $user->id,
            'closed_at' => now(),
        ]);

        return $period->fresh();
    }

    public function close(AccountingPeriod $period, User $user): AccountingPeriod
    {
        if ($period->status === 'closed') {
            throw new AccountingException('This accounting period is already closed.');
        }

        return DB::transaction(function () use ($period, $user) {
            if ($this->isLastPeriodOfFiscalYear($period)) {
                $this->createYearEndClosingEntry($period, $user);
            }

            $period->update([
                'status' => 'closed',
                'closed_by' => $user->id,
                'closed_at' => now(),
            ]);

            return $period->fresh();
        });
    }

    public function reopen(AccountingPeriod $period, User $user): AccountingPeriod
    {
        if ($period->status === 'open') {
            throw new AccountingException('This accounting period is already open.');
        }

        $period->update([
            'status' => 'open',
            'closed_by' => null,
            'closed_at' => null,
        ]);

        return $period->fresh();
    }

    protected function isLastPeriodOfFiscalYear(AccountingPeriod $period): bool
    {
        $maxPeriodNo = AccountingPeriod::query()
            ->where('fiscal_year_id', $period->fiscal_year_id)
            ->max('period_no');

        return (int) $period->period_no === (int) $maxPeriodNo;
    }

    protected function createYearEndClosingEntry(AccountingPeriod $period, User $user): void
    {
        $retainedEarningsCode = config('accounting.retained_earnings_code', '3100');
        $retainedEarnings = Account::where('code', $retainedEarningsCode)->first()
            ?? Account::where('name', 'like', '%Retained Earnings%')->first();

        if (! $retainedEarnings) {
            throw new AccountingException("Retained earnings account ({$retainedEarningsCode}) not found.");
        }

        $periodIds = AccountingPeriod::query()
            ->where('fiscal_year_id', $period->fiscal_year_id)
            ->pluck('id');

        $balances = AccountPeriodBalance::query()
            ->with(['account.accountType'])
            ->whereIn('accounting_period_id', $periodIds)
            ->whereHas('account.accountType', fn ($q) => $q->whereIn('classification', ['revenue', 'expense']))
            ->get()
            ->groupBy('account_id');

        $lines = [];
        $totalDebit = 0.0;
        $totalCredit = 0.0;

        foreach ($balances as $accountBalances) {
            $account = $accountBalances->first()->account;
            $periodDebit = $accountBalances->sum(fn ($b) => (float) $b->period_debit);
            $periodCredit = $accountBalances->sum(fn ($b) => (float) $b->period_credit);

            if ($account->accountType->classification === 'revenue') {
                $balance = $periodCredit - $periodDebit;
                if (abs($balance) < 0.01) {
                    continue;
                }
                if ($balance > 0) {
                    $lines[] = ['account_id' => $account->id, 'debit' => round($balance, 2), 'credit' => 0, 'memo' => 'Year-end close'];
                    $totalDebit += $balance;
                } else {
                    $lines[] = ['account_id' => $account->id, 'debit' => 0, 'credit' => round(abs($balance), 2), 'memo' => 'Year-end close'];
                    $totalCredit += abs($balance);
                }
            } else {
                $balance = $periodDebit - $periodCredit;
                if (abs($balance) < 0.01) {
                    continue;
                }
                if ($balance > 0) {
                    $lines[] = ['account_id' => $account->id, 'debit' => 0, 'credit' => round($balance, 2), 'memo' => 'Year-end close'];
                    $totalCredit += $balance;
                } else {
                    $lines[] = ['account_id' => $account->id, 'debit' => round(abs($balance), 2), 'credit' => 0, 'memo' => 'Year-end close'];
                    $totalDebit += abs($balance);
                }
            }
        }

        if (empty($lines)) {
            return;
        }

        $netIncome = $totalCredit - $totalDebit;
        if ($netIncome > 0) {
            $lines[] = ['account_id' => $retainedEarnings->id, 'debit' => 0, 'credit' => round($netIncome, 2), 'memo' => 'Year-end close to retained earnings'];
        } elseif ($netIncome < 0) {
            $lines[] = ['account_id' => $retainedEarnings->id, 'debit' => round(abs($netIncome), 2), 'credit' => 0, 'memo' => 'Year-end close to retained earnings'];
        }

        $journal = Journal::where('type', 'general')->first()
            ?? Journal::where('code', 'GJ')->first();

        if (! $journal) {
            throw new AccountingException('General journal not found for year-end closing entry.');
        }

        $period->load('fiscalYear');

        $entry = $this->journalPostingService->create([
            'journal_id' => $journal->id,
            'entry_date' => $period->end_date->toDateString(),
            'reference' => 'YEC-'.$period->fiscalYear->code,
            'memo' => 'Year-end closing entry',
            'source_system' => 'accounting',
            'source_type' => 'period_close',
            'source_id' => (string) $period->id,
        ], $lines, $user);

        $this->journalPostingService->post($entry, $user);
    }
}
