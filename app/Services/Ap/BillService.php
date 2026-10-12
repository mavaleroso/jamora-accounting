<?php

namespace App\Services\Ap;

use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\Bill;
use App\Models\BillLine;
use App\Models\BillPayment;
use App\Models\Journal;
use App\Services\Accounting\JournalPostingService;
use App\Support\EntityContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BillService
{
    public function __construct(protected JournalPostingService $journalPostingService) {}

    public function create(array $data, array $lines, int $userId): Bill
    {
        return DB::transaction(function () use ($data, $lines, $userId) {
            $subtotal = collect($lines)->sum(fn ($l) => (float) ($l['amount'] ?? 0));
            $vat = round($subtotal * (float) config('accounting.vat_rate', 0.12), 2);
            $total = $subtotal + $vat;

            $bill = Bill::query()->create([
                ...$data,
                'subtotal' => $subtotal,
                'vat_amount' => $vat,
                'total_amount' => $total,
                'amount_paid' => 0,
                'balance_due' => $total,
                'status' => 'draft',
                'created_by' => $userId,
            ]);

            foreach ($lines as $i => $line) {
                BillLine::query()->create([
                    'bill_id' => $bill->id,
                    'line_no' => $i + 1,
                    'description' => $line['description'],
                    'account_id' => $line['account_id'] ?? null,
                    'amount' => $line['amount'],
                    'tax_code_id' => $line['tax_code_id'] ?? null,
                ]);
            }

            return $bill->fresh(['lines', 'vendor']);
        });
    }

    public function post(Bill $bill, int $userId): Bill
    {
        if ($bill->status !== 'draft') {
            return $bill;
        }

        return DB::transaction(function () use ($bill, $userId) {
            $ap = Account::query()->where('code', '2000')->first();
            $inputVat = Account::query()->where('code', '1300')->first();
            $expense = Account::query()->where('code', '6400')->first();
            $journal = Journal::query()->where('code', 'PJ')->first();

            $lines = [];
            foreach ($bill->lines as $line) {
                $lines[] = [
                    'account_id' => $line->account_id ?: $expense?->id,
                    'debit' => (float) $line->amount,
                    'credit' => 0,
                    'memo' => $line->description,
                ];
            }
            if ((float) $bill->vat_amount > 0) {
                $lines[] = [
                    'account_id' => $inputVat?->id,
                    'debit' => (float) $bill->vat_amount,
                    'credit' => 0,
                    'memo' => 'Input VAT',
                ];
            }
            $lines[] = [
                'account_id' => $ap?->id,
                'debit' => 0,
                'credit' => (float) $bill->total_amount,
                'memo' => 'AP '.$bill->bill_no,
            ];

            $entry = $this->journalPostingService->create([
                'journal_id' => $journal?->id,
                'entry_date' => $bill->bill_date->toDateString(),
                'reference' => $bill->vendor_invoice_no ?: $bill->bill_no,
                'memo' => 'Bill '.$bill->bill_no,
                'source_system' => 'ap',
                'source_type' => 'bill',
                'source_id' => $bill->id,
            ], $lines, \App\Models\User::find($userId));

            $bill->update(['status' => 'posted', 'journal_entry_id' => $entry->id]);

            return $bill->fresh();
        });
    }

    public function pay(Bill $bill, array $payment, int $userId): BillPayment
    {
        $entityId = app(EntityContext::class)->id();
        $bankAccountId = $payment['bank_account_id'] ?? null;

        if ($bankAccountId) {
            $bank = BankAccount::query()->findOrFail($bankAccountId);
            if (! $bank->allowsEntity((int) $entityId)) {
                throw ValidationException::withMessages([
                    'bank_account_id' => 'Selected bank account is not allowed for the current entity.',
                ]);
            }
        }

        return DB::transaction(function () use ($bill, $payment, $userId, $bankAccountId, $entityId) {
            $amount = (float) $payment['amount'];
            $ap = Account::query()->where('code', '2000')->first();
            $cash = Account::query()->where('code', '1010')->first();
            $journal = Journal::query()->where('code', 'CDJ')->first();

            $entry = $this->journalPostingService->create([
                'journal_id' => $journal?->id,
                'entry_date' => $payment['paid_date'],
                'reference' => $payment['reference'] ?? $bill->bill_no,
                'memo' => 'Bill payment '.$bill->bill_no,
                'source_system' => 'ap',
                'source_type' => 'bill_payment',
                'source_id' => $bill->id,
            ], [
                [
                    'account_id' => $ap?->id,
                    'debit' => $amount,
                    'credit' => 0,
                    'memo' => 'AP clear',
                ],
                [
                    'account_id' => $cash?->id,
                    'debit' => 0,
                    'credit' => $amount,
                    'memo' => 'Bank disbursement',
                ],
            ], \App\Models\User::find($userId));

            $record = BillPayment::query()->create([
                'bill_id' => $bill->id,
                'bank_account_id' => $bankAccountId,
                'paid_date' => $payment['paid_date'],
                'amount' => $amount,
                'payment_method' => $payment['payment_method'] ?? 'bank',
                'reference' => $payment['reference'] ?? null,
                'journal_entry_id' => $entry->id,
                'paid_by' => $userId,
            ]);

            if ($bankAccountId) {
                BankTransaction::query()->create([
                    'bank_account_id' => $bankAccountId,
                    'entity_id' => $entityId,
                    'txn_date' => $payment['paid_date'],
                    'description' => 'Bill payment '.$bill->bill_no,
                    'amount' => $amount,
                    'direction' => 'out',
                    'reference' => $payment['reference'] ?? null,
                    'source_type' => 'bill_payment',
                    'source_id' => $record->id,
                    'journal_entry_id' => $entry->id,
                ]);
            }

            $paid = (float) $bill->amount_paid + $amount;
            $balance = max(0, (float) $bill->total_amount - $paid);
            $bill->update([
                'amount_paid' => $paid,
                'balance_due' => $balance,
                'status' => $balance <= 0 ? 'paid' : 'partially_paid',
            ]);

            return $record;
        });
    }
}
