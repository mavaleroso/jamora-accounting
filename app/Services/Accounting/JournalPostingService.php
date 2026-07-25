<?php

namespace App\Services\Accounting;

use App\Exceptions\AccountingException;
use App\Models\Account;
use App\Models\AccountingPeriod;
use App\Models\AccountPeriodBalance;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class JournalPostingService
{
    public function create(array $data, array $lines, ?User $user = null): JournalEntry
    {
        return DB::transaction(function () use ($data, $lines, $user) {
            $this->validateLines($lines);

            $journal = Journal::findOrFail($data['journal_id']);
            $entryDate = $data['entry_date'];
            $period = $this->resolveOpenPeriod($entryDate);
            $entryNo = $this->assignEntryNumber($journal);
            $totals = $this->calculateTotals($lines);

            $entry = JournalEntry::create([
                'entry_no' => $entryNo,
                'journal_id' => $journal->id,
                'accounting_period_id' => $period->id,
                'entry_date' => $entryDate,
                'reference' => $data['reference'] ?? null,
                'memo' => $data['memo'] ?? null,
                'source_system' => $data['source_system'] ?? 'manual',
                'source_type' => $data['source_type'] ?? null,
                'source_id' => $data['source_id'] ?? null,
                'status' => 'draft',
                'total_debit' => $totals['debit'],
                'total_credit' => $totals['credit'],
                'prepared_by' => $user?->id,
            ]);

            $this->syncLines($entry, $lines);

            return $entry->fresh(['lines.account']);
        });
    }

    public function update(JournalEntry $entry, array $data, array $lines): JournalEntry
    {
        if (! in_array($entry->status, ['draft', 'pending'], true)) {
            throw new AccountingException('Only draft or pending journal entries can be updated.');
        }

        return DB::transaction(function () use ($entry, $data, $lines) {
            $this->validateLines($lines);

            $entryDate = $data['entry_date'] ?? $entry->entry_date->toDateString();
            $period = $this->resolveOpenPeriod($entryDate);
            $totals = $this->calculateTotals($lines);

            $entry->update([
                'accounting_period_id' => $period->id,
                'entry_date' => $entryDate,
                'reference' => $data['reference'] ?? $entry->reference,
                'memo' => $data['memo'] ?? $entry->memo,
                'source_system' => $data['source_system'] ?? $entry->source_system,
                'source_type' => $data['source_type'] ?? $entry->source_type,
                'source_id' => $data['source_id'] ?? $entry->source_id,
                'total_debit' => $totals['debit'],
                'total_credit' => $totals['credit'],
            ]);

            $entry->lines()->delete();
            $this->syncLines($entry, $lines);

            return $entry->fresh(['lines.account']);
        });
    }

    public function post(JournalEntry $entry, User $user): JournalEntry
    {
        if (! in_array($entry->status, ['draft', 'pending'], true)) {
            throw new AccountingException('Only draft or pending journal entries can be posted.');
        }

        return DB::transaction(function () use ($entry, $user) {
            $entry->load(['lines.account.accountType', 'accountingPeriod']);

            if ($entry->accountingPeriod->status !== 'open') {
                throw new AccountingException('Cannot post to a non-open accounting period.');
            }

            foreach ($entry->lines as $line) {
                $this->applyBalanceChange(
                    $line->account_id,
                    $entry->accounting_period_id,
                    (float) $line->debit,
                    (float) $line->credit,
                    true
                );
            }

            $entry->update([
                'status' => 'posted',
                'posted_by' => $user->id,
                'posted_at' => now(),
            ]);

            return $entry->fresh(['lines.account']);
        });
    }

    public function void(JournalEntry $entry, User $user, ?string $memo = null): JournalEntry
    {
        if ($entry->status !== 'posted') {
            throw new AccountingException('Only posted journal entries can be voided.');
        }

        return DB::transaction(function () use ($entry, $user, $memo) {
            $entry->load(['lines', 'journal', 'accountingPeriod']);

            if ($entry->accountingPeriod->status === 'closed') {
                throw new AccountingException('Cannot void entries in a closed accounting period.');
            }

            $reversingLines = [];
            foreach ($entry->lines as $line) {
                $reversingLines[] = [
                    'account_id' => $line->account_id,
                    'debit' => (float) $line->credit,
                    'credit' => (float) $line->debit,
                    'memo' => $line->memo ? 'Reversal: '.$line->memo : 'Reversal',
                    'cost_center_id' => $line->cost_center_id,
                    'partner_type' => $line->partner_type,
                    'partner_id' => $line->partner_id,
                    'tax_code_id' => $line->tax_code_id,
                ];
            }

            $reversingEntry = $this->create([
                'journal_id' => $entry->journal_id,
                'entry_date' => now()->toDateString(),
                'reference' => $entry->entry_no,
                'memo' => $memo ?? "Void of {$entry->entry_no}",
                'source_system' => $entry->source_system,
                'source_type' => $entry->source_type,
                'source_id' => $entry->source_id,
            ], $reversingLines, $user);

            $reversingEntry->update(['void_of_entry_id' => $entry->id]);
            $this->post($reversingEntry, $user);

            $entry->update([
                'status' => 'void',
                'voided_by' => $user->id,
                'voided_at' => now(),
            ]);

            return $entry->fresh(['lines.account', 'reversingEntries']);
        });
    }

    public function delete(JournalEntry $entry): void
    {
        if ($entry->status !== 'draft') {
            throw new AccountingException('Only draft journal entries can be deleted.');
        }

        DB::transaction(function () use ($entry) {
            $entry->lines()->delete();
            $entry->forceDelete();
        });
    }

    public function applyBalanceChange(
        int $accountId,
        int $periodId,
        float $debit,
        float $credit,
        bool $increment = true
    ): void {
        $account = Account::with('accountType')->findOrFail($accountId);

        $balance = AccountPeriodBalance::firstOrCreate(
            [
                'account_id' => $accountId,
                'accounting_period_id' => $periodId,
            ],
            [
                'opening_debit' => 0,
                'opening_credit' => 0,
                'period_debit' => 0,
                'period_credit' => 0,
                'closing_debit' => 0,
                'closing_credit' => 0,
            ]
        );

        $multiplier = $increment ? 1 : -1;
        $balance->period_debit = (float) $balance->period_debit + ($debit * $multiplier);
        $balance->period_credit = (float) $balance->period_credit + ($credit * $multiplier);

        $this->recalculateClosing($balance, $account);
        $balance->save();
    }

    public function recalculateClosing(AccountPeriodBalance $balance, Account $account): void
    {
        $account->loadMissing('accountType');

        $net = ((float) $balance->opening_debit - (float) $balance->opening_credit)
            + ((float) $balance->period_debit - (float) $balance->period_credit);

        if ($account->accountType->normal_balance === 'credit') {
            $net = -$net;
        }

        if ($net >= 0) {
            if ($account->accountType->normal_balance === 'debit') {
                $balance->closing_debit = round($net, 2);
                $balance->closing_credit = 0;
            } else {
                $balance->closing_credit = round($net, 2);
                $balance->closing_debit = 0;
            }
        } else {
            $abs = round(abs($net), 2);
            if ($account->accountType->normal_balance === 'debit') {
                $balance->closing_debit = 0;
                $balance->closing_credit = $abs;
            } else {
                $balance->closing_credit = 0;
                $balance->closing_debit = $abs;
            }
        }
    }

    protected function validateLines(array $lines): void
    {
        if (count($lines) < 2) {
            throw ValidationException::withMessages([
                'lines' => ['A journal entry must have at least two lines.'],
            ]);
        }

        $totalDebit = 0;
        $totalCredit = 0;

        foreach ($lines as $index => $line) {
            $debit = round((float) ($line['debit'] ?? 0), 2);
            $credit = round((float) ($line['credit'] ?? 0), 2);

            $hasDebit = $debit > 0;
            $hasCredit = $credit > 0;

            if ($hasDebit === $hasCredit) {
                throw ValidationException::withMessages([
                    "lines.{$index}" => ['Each line must have either a debit or a credit amount, but not both.'],
                ]);
            }

            if ($debit < 0 || $credit < 0) {
                throw ValidationException::withMessages([
                    "lines.{$index}" => ['Debit and credit amounts must be zero or positive.'],
                ]);
            }

            $account = Account::with('accountType')->find($line['account_id'] ?? null);
            if (! $account) {
                throw ValidationException::withMessages([
                    "lines.{$index}.account_id" => ['A valid account is required.'],
                ]);
            }

            if (! $account->is_postable) {
                throw ValidationException::withMessages([
                    "lines.{$index}.account_id" => ["Account {$account->code} is not postable."],
                ]);
            }

            if (! $account->is_active) {
                throw ValidationException::withMessages([
                    "lines.{$index}.account_id" => ["Account {$account->code} is not active."],
                ]);
            }

            $totalDebit += $debit;
            $totalCredit += $credit;
        }

        if (abs($totalDebit - $totalCredit) >= 0.01) {
            throw ValidationException::withMessages([
                'lines' => ['Total debits must equal total credits.'],
            ]);
        }
    }

    protected function calculateTotals(array $lines): array
    {
        $debit = 0;
        $credit = 0;

        foreach ($lines as $line) {
            $debit += (float) ($line['debit'] ?? 0);
            $credit += (float) ($line['credit'] ?? 0);
        }

        return [
            'debit' => round($debit, 2),
            'credit' => round($credit, 2),
        ];
    }

    protected function syncLines(JournalEntry $entry, array $lines): void
    {
        foreach ($lines as $index => $line) {
            JournalEntryLine::create([
                'journal_entry_id' => $entry->id,
                'line_no' => $index + 1,
                'account_id' => $line['account_id'],
                'debit' => round((float) ($line['debit'] ?? 0), 2),
                'credit' => round((float) ($line['credit'] ?? 0), 2),
                'memo' => $line['memo'] ?? null,
                'cost_center_id' => $line['cost_center_id'] ?? null,
                'partner_type' => $line['partner_type'] ?? null,
                'partner_id' => $line['partner_id'] ?? null,
                'tax_code_id' => $line['tax_code_id'] ?? null,
            ]);
        }
    }

    protected function resolveOpenPeriod(string $date): AccountingPeriod
    {
        $period = AccountingPeriod::query()
            ->where('start_date', '<=', $date)
            ->where('end_date', '>=', $date)
            ->where('status', 'open')
            ->first();

        if (! $period) {
            throw new AccountingException("No open accounting period found for date {$date}.");
        }

        return $period;
    }

    protected function assignEntryNumber(Journal $journal): string
    {
        $entryNo = $journal->sequence_prefix.str_pad((string) $journal->next_sequence, 6, '0', STR_PAD_LEFT);
        $journal->increment('next_sequence');

        return $entryNo;
    }
}
