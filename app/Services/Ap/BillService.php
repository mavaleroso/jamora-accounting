<?php

namespace App\Services\Ap;

use App\Models\Account;
use App\Models\Bill;
use App\Models\BillLine;
use App\Models\BillPayment;
use App\Models\Journal;
use App\Services\Accounting\CashMovementService;
use App\Support\EntityContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BillService
{
    public const VAT_TREATMENTS = ['exclusive', 'inclusive', 'non_vat'];

    public const PAYMENT_METHODS = ['check', 'bank_transfer', 'cash', 'gcash'];

    public function __construct(protected CashMovementService $cash) {}

    public function create(array $data, array $lines, int $userId): Bill
    {
        return DB::transaction(function () use ($data, $lines, $userId) {
            $totals = $this->computeTotals($lines, $data['vat_treatment'] ?? 'exclusive');

            $bill = Bill::query()->create([
                ...$data,
                ...$totals,
                'amount_paid' => 0,
                'balance_due' => $totals['total_amount'],
                'status' => 'draft',
                'created_by' => $userId,
            ]);

            foreach ($lines as $i => $line) {
                BillLine::query()->create([
                    'bill_id' => $bill->id,
                    'line_no' => $i + 1,
                    'description' => $line['description'],
                    'account_id' => $line['account_id'] ?? null,
                    'amount' => round((float) $line['amount'], 2),
                    'tax_code_id' => $line['tax_code_id'] ?? null,
                ]);
            }

            return $bill->fresh(['lines', 'vendor']);
        });
    }

    /**
     * @return array{subtotal: float, vat_amount: float, total_amount: float}
     */
    public function computeTotals(array $lines, string $vatTreatment): array
    {
        $sum = round(collect($lines)->sum(fn ($l) => (float) ($l['amount'] ?? 0)), 2);
        $rate = (float) config('accounting.vat_rate', 0.12);

        return match ($vatTreatment) {
            'inclusive' => (function () use ($sum, $rate) {
                $vat = round($sum * $rate / (1 + $rate), 2);

                return ['subtotal' => round($sum - $vat, 2), 'vat_amount' => $vat, 'total_amount' => $sum];
            })(),
            'non_vat' => ['subtotal' => $sum, 'vat_amount' => 0.0, 'total_amount' => $sum],
            default => (function () use ($sum, $rate) {
                $vat = round($sum * $rate, 2);

                return ['subtotal' => $sum, 'vat_amount' => $vat, 'total_amount' => round($sum + $vat, 2)];
            })(),
        };
    }

    /**
     * Recognise the payable: Dr expense/asset lines (net of VAT) and Input VAT, Cr Accounts Payable.
     */
    public function post(Bill $bill, int $userId): Bill
    {
        if ($bill->status !== 'draft') {
            throw ValidationException::withMessages(['bill' => 'Only draft bills can be posted.']);
        }

        return DB::transaction(function () use ($bill, $userId) {
            $bill->loadMissing('lines');
            $ap = $this->account('2000');
            $fallbackExpense = $this->account('6400');
            $journal = Journal::query()->where('code', 'PJ')->firstOrFail();

            // Spread the net amount across lines in proportion so inclusive-VAT bills debit net expense.
            $gross = (float) $bill->lines->sum('amount');
            $net = (float) $bill->subtotal;
            $remaining = $net;
            $lines = [];
            foreach ($bill->lines->values() as $i => $line) {
                $isLast = $i === $bill->lines->count() - 1;
                $amount = $isLast ? round($remaining, 2) : round($gross > 0 ? (float) $line->amount * $net / $gross : 0, 2);
                $remaining -= $amount;
                $lines[] = ['account_id' => $line->account_id ?: $fallbackExpense->id, 'debit' => $amount, 'credit' => 0, 'memo' => $line->description];
            }
            if ((float) $bill->vat_amount > 0) {
                $lines[] = ['account_id' => $this->account('1300')->id, 'debit' => (float) $bill->vat_amount, 'credit' => 0, 'memo' => 'Input VAT'];
            }
            $lines[] = ['account_id' => $ap->id, 'debit' => 0, 'credit' => (float) $bill->total_amount, 'memo' => 'AP '.$bill->bill_no];

            $entry = $this->cash->journal([
                'journal_id' => $journal->id,
                'entry_date' => $bill->bill_date->toDateString(),
                'reference' => $bill->vendor_invoice_no ?: $bill->bill_no,
                'memo' => 'Bill '.$bill->bill_no,
                'source_system' => 'ap',
                'source_type' => 'bill',
                'source_id' => $bill->id,
            ], array_values(array_filter($lines, fn ($l) => $l['debit'] > 0 || $l['credit'] > 0)), $userId);

            $bill->update(['status' => 'posted', 'journal_entry_id' => $entry->id]);

            return $bill->fresh();
        });
    }

    /**
     * Pay a posted bill: Dr Accounts Payable, Cr the paying cash/bank account. A bank disbursement must come from
     * one of this entity's own bank accounts and is written to that account's register.
     */
    public function pay(Bill $bill, array $payment, int $userId): BillPayment
    {
        $amount = round((float) $payment['amount'], 2);
        $method = $payment['payment_method'] ?? 'check';

        if (! in_array($bill->status, ['posted', 'partially_paid'], true)) {
            throw ValidationException::withMessages(['amount' => 'Post the bill before recording payments.']);
        }
        if ($amount <= 0 || $amount > (float) $bill->balance_due + 0.001) {
            throw ValidationException::withMessages([
                'amount' => 'Amount must be between 0.01 and the balance due ('.number_format((float) $bill->balance_due, 2).').',
            ]);
        }

        $bank = $this->cash->bankAccountFor(isset($payment['bank_account_id']) ? (int) $payment['bank_account_id'] : null);
        if ($this->cash->requiresBank($method) && ! $bank) {
            throw ValidationException::withMessages(['bank_account_id' => 'Select the bank account the payment is drawn from.']);
        }

        return DB::transaction(function () use ($bill, $payment, $userId, $amount, $method, $bank) {
            $entityId = app(EntityContext::class)->id();
            $journal = Journal::query()->where('code', 'CDJ')->firstOrFail();

            $entry = $this->cash->journal([
                'journal_id' => $journal->id,
                'entry_date' => $payment['paid_date'],
                'reference' => $payment['reference'] ?? $bill->bill_no,
                'memo' => 'Payment of bill '.$bill->bill_no,
                'source_system' => 'ap',
                'source_type' => 'bill_payment',
                'source_id' => $bill->id,
            ], [
                ['account_id' => $this->account('2000')->id, 'debit' => $amount, 'credit' => 0, 'memo' => 'AP '.$bill->bill_no],
                ['account_id' => $this->cash->cashAccountFor($method, $bank)->id, 'debit' => 0, 'credit' => $amount, 'memo' => 'Disbursement'],
            ], $userId);

            $record = BillPayment::query()->create([
                'bill_id' => $bill->id,
                'bank_account_id' => $bank?->id,
                'paid_date' => $payment['paid_date'],
                'amount' => $amount,
                'payment_method' => $method,
                'reference' => $payment['reference'] ?? null,
                'journal_entry_id' => $entry->id,
                'paid_by' => $userId,
            ]);

            if ($bank) {
                $bill->loadMissing('vendor');
                $this->cash->recordBankLine($bank, [
                    'entity_id' => $entityId,
                    'txn_date' => $payment['paid_date'],
                    'description' => 'Bill '.$bill->bill_no.' — '.($bill->vendor?->name ?? 'supplier'),
                    'amount' => $amount,
                    'direction' => 'out',
                    'reference' => $payment['reference'] ?? null,
                    'source_type' => 'bill_payment',
                    'source_id' => $record->id,
                    'journal_entry_id' => $entry->id,
                ]);
            }

            $paid = round((float) $bill->amount_paid + $amount, 2);
            $balance = round(max(0, (float) $bill->total_amount - $paid), 2);
            $bill->update([
                'amount_paid' => $paid,
                'balance_due' => $balance,
                'status' => $balance <= 0 ? 'paid' : 'partially_paid',
            ]);

            return $record;
        });
    }

    protected function account(string $code): Account
    {
        return Account::query()->where('code', $code)->first()
            ?? throw ValidationException::withMessages(['bill' => "Account {$code} is missing from this entity's chart of accounts."]);
    }
}
