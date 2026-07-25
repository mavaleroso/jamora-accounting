<?php

namespace App\Services\Accounting;

use App\Models\AccountingPeriod;
use App\Models\AccountPeriodBalance;
use App\Models\JournalEntryLine;
use Illuminate\Support\Facades\DB;

class TrialBalanceService
{
    public function getTrialBalance(int $periodId): array
    {
        $period = AccountingPeriod::findOrFail($periodId);

        $balances = AccountPeriodBalance::query()
            ->with(['account.accountType'])
            ->where('accounting_period_id', $periodId)
            ->get();

        if ($balances->isNotEmpty()) {
            return $this->formatBalances($balances);
        }

        return $this->computeFromPostedLines($period);
    }

    protected function formatBalances($balances): array
    {
        $result = [];

        foreach ($balances as $balance) {
            $debit = (float) $balance->closing_debit;
            $credit = (float) $balance->closing_credit;

            if ($debit == 0.0 && $credit == 0.0) {
                continue;
            }

            $result[] = [
                'account_id' => $balance->account_id,
                'account_code' => $balance->account->code,
                'account_name' => $balance->account->name,
                'classification' => $balance->account->accountType->classification,
                'debit' => $debit,
                'credit' => $credit,
            ];
        }

        usort($result, fn (array $a, array $b) => strcmp($a['account_code'], $b['account_code']));

        return $result;
    }

    protected function computeFromPostedLines(AccountingPeriod $period): array
    {
        $rows = JournalEntryLine::query()
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->join('accounts', 'journal_entry_lines.account_id', '=', 'accounts.id')
            ->join('account_types', 'accounts.account_type_id', '=', 'account_types.id')
            ->where('journal_entries.accounting_period_id', $period->id)
            ->where('journal_entries.status', 'posted')
            ->groupBy(
                'journal_entry_lines.account_id',
                'accounts.code',
                'accounts.name',
                'account_types.classification',
                'account_types.normal_balance'
            )
            ->select([
                'journal_entry_lines.account_id',
                'accounts.code as account_code',
                'accounts.name as account_name',
                'account_types.classification',
                'account_types.normal_balance',
                DB::raw('SUM(journal_entry_lines.debit) as total_debit'),
                DB::raw('SUM(journal_entry_lines.credit) as total_credit'),
            ])
            ->get();

        $result = [];

        foreach ($rows as $row) {
            $net = (float) $row->total_debit - (float) $row->total_credit;

            if ($row->normal_balance === 'credit') {
                $net = -$net;
            }

            if (abs($net) < 0.01) {
                continue;
            }

            $result[] = [
                'account_id' => $row->account_id,
                'account_code' => $row->account_code,
                'account_name' => $row->account_name,
                'classification' => $row->classification,
                'debit' => $net > 0 ? round($net, 2) : 0.0,
                'credit' => $net < 0 ? round(abs($net), 2) : 0.0,
            ];
        }

        usort($result, fn (array $a, array $b) => strcmp($a['account_code'], $b['account_code']));

        return $result;
    }
}
