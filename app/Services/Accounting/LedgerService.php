<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\AccountingPeriod;
use App\Models\AccountPeriodBalance;
use App\Models\JournalEntryLine;

class LedgerService
{
    public function getLedger(int $accountId, ?string $from = null, ?string $to = null): array
    {
        $account = Account::with('accountType')->findOrFail($accountId);
        $normalBalance = $account->accountType->normal_balance;

        $lines = JournalEntryLine::query()
            ->with(['journalEntry:id,entry_no,entry_date,reference,status'])
            ->where('account_id', $accountId)
            ->whereHas('journalEntry', function ($query) use ($from, $to) {
                $query->where('status', 'posted');
                if ($from) {
                    $query->where('entry_date', '>=', $from);
                }
                if ($to) {
                    $query->where('entry_date', '<=', $to);
                }
            })
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->orderBy('journal_entries.entry_date')
            ->orderBy('journal_entries.id')
            ->orderBy('journal_entry_lines.line_no')
            ->select('journal_entry_lines.*')
            ->get();

        $running = 0.0;
        $result = [];

        foreach ($lines as $line) {
            $debit = (float) $line->debit;
            $credit = (float) $line->credit;

            if ($normalBalance === 'debit') {
                $running += $debit - $credit;
            } else {
                $running += $credit - $debit;
            }

            $result[] = [
                'entry_date' => $line->journalEntry->entry_date->toDateString(),
                'entry_no' => $line->journalEntry->entry_no,
                'reference' => $line->journalEntry->reference,
                'memo' => $line->memo,
                'debit' => $debit,
                'credit' => $credit,
                'running_balance' => round($running, 2),
            ];
        }

        return $result;
    }
}
