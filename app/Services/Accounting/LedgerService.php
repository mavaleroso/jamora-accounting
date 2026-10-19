<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use Illuminate\Database\Eloquent\Builder;

class LedgerService
{
    /**
     * Account ledger for a date range: the balance brought forward from all posted activity before `from`,
     * then each posted line with a running balance in the account's normal-balance direction.
     *
     * @return array{account: array<string, mixed>, opening_balance: float, closing_balance: float, total_debit: float, total_credit: float, lines: list<array<string, mixed>>}
     */
    public function getLedger(int $accountId, ?string $from = null, ?string $to = null): array
    {
        $account = Account::with('accountType')->findOrFail($accountId);
        $debitNormal = $account->accountType?->normal_balance !== 'credit';
        $sign = fn (float $debit, float $credit) => $debitNormal ? $debit - $credit : $credit - $debit;

        $opening = 0.0;
        if ($from) {
            $before = $this->postedLines($accountId)
                ->whereDate('journal_entries.entry_date', '<', $from)
                ->selectRaw('COALESCE(SUM(journal_entry_lines.debit), 0) as d, COALESCE(SUM(journal_entry_lines.credit), 0) as c')
                ->first();
            $opening = $sign((float) $before->d, (float) $before->c);
        }

        $rows = $this->postedLines($accountId)
            ->when($from, fn ($q) => $q->whereDate('journal_entries.entry_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('journal_entries.entry_date', '<=', $to))
            ->leftJoin('journals', 'journal_entries.journal_id', '=', 'journals.id')
            ->orderBy('journal_entries.entry_date')
            ->orderBy('journal_entries.id')
            ->orderBy('journal_entry_lines.line_no')
            ->get([
                'journal_entry_lines.id',
                'journal_entry_lines.memo',
                'journal_entry_lines.debit',
                'journal_entry_lines.credit',
                'journal_entries.id as journal_entry_id',
                'journal_entries.entry_no',
                'journal_entries.entry_date',
                'journal_entries.reference',
                'journal_entries.memo as entry_memo',
                'journal_entries.source_type',
                'journal_entries.source_id',
                'journals.code as journal_code',
            ]);

        $running = $opening;
        $totalDebit = 0.0;
        $totalCredit = 0.0;
        $lines = [];

        foreach ($rows as $row) {
            $debit = (float) $row->debit;
            $credit = (float) $row->credit;
            $totalDebit += $debit;
            $totalCredit += $credit;
            $running += $sign($debit, $credit);

            $lines[] = [
                'id' => $row->id,
                'journal_entry_id' => $row->journal_entry_id,
                'entry_date' => substr((string) $row->entry_date, 0, 10),
                'entry_no' => $row->entry_no,
                'journal_code' => $row->journal_code,
                'reference' => $row->reference,
                'memo' => $row->memo ?: $row->entry_memo,
                'debit' => $debit,
                'credit' => $credit,
                'running_balance' => round($running, 2),
                'source_type' => $row->source_type,
                'source_url' => $this->sourceUrl($row->source_type, $row->source_id),
            ];
        }

        return [
            'account' => [
                'id' => $account->id,
                'code' => $account->code,
                'name' => $account->name,
                'normal_balance' => $debitNormal ? 'debit' : 'credit',
                'classification' => $account->accountType?->classification,
            ],
            'opening_balance' => round($opening, 2),
            'closing_balance' => round($running, 2),
            'total_debit' => round($totalDebit, 2),
            'total_credit' => round($totalCredit, 2),
            'lines' => $lines,
        ];
    }

    /** Link from a ledger line back to the document that produced it. */
    public function sourceUrl(?string $type, ?int $id): ?string
    {
        if (! $id) {
            return null;
        }

        return match ($type) {
            'invoice', 'invoice_payment', 'optical_sale', 'optical_due_from' => "/billing/invoices/{$id}",
            'optical_deposit', 'optical_due_to' => '/billing/deposits',
            'optical_cogs', 'optical_stock' => '/integration/inventory',
            'bill', 'bill_payment' => "/ap/bills/{$id}",
            'customer_deposit', 'deposit_application' => '/billing/deposits',
            'payroll_run', 'payroll_payment' => "/payroll/runs/{$id}",
            'cash_receipt', 'cash_payment' => '/accounting/cash-bank-records',
            default => null,
        };
    }

    protected function postedLines(int $accountId): Builder
    {
        return JournalEntryLine::query()
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->where('journal_entry_lines.account_id', $accountId)
            ->whereIn('journal_entries.status', JournalEntry::LEDGER_STATUSES)
            ->whereNull('journal_entries.deleted_at');
    }
}
