<?php

namespace App\Services\Billing;

use App\Models\Account;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePayment;
use App\Models\Journal;
use App\Models\Partner;
use App\Models\PartnerBalance;
use App\Services\Accounting\JournalPostingService;
use App\Support\EntityContext;
use Illuminate\Support\Facades\DB;

class InvoiceService
{
    public function __construct(protected JournalPostingService $journalPostingService) {}

    public function create(array $data, array $lines, int $userId): Invoice
    {
        return DB::transaction(function () use ($data, $lines, $userId) {
            $totals = $this->computeTotals($lines, (bool) ($data['is_vat_exempt'] ?? false));

            $invoice = Invoice::query()->create([
                ...$data,
                ...$totals,
                'amount_paid' => 0,
                'balance_due' => $totals['total_amount'],
                'status' => 'draft',
                'created_by' => $userId,
            ]);

            foreach ($lines as $i => $line) {
                InvoiceLine::query()->create([
                    'invoice_id' => $invoice->id,
                    'line_no' => $i + 1,
                    'line_type' => $line['line_type'] ?? 'product',
                    'description' => $line['description'],
                    'quantity' => $line['quantity'] ?? 1,
                    'unit_price' => $line['unit_price'] ?? 0,
                    'discount_amount' => $line['discount_amount'] ?? 0,
                    'amount' => $this->lineAmount($line),
                    'tax_code_id' => $line['tax_code_id'] ?? null,
                    'notes' => $line['notes'] ?? null,
                ]);
            }

            return $invoice->fresh(['lines', 'partner']);
        });
    }

    public function confirm(Invoice $invoice, int $userId): Invoice
    {
        if ($invoice->status !== 'draft') {
            return $invoice;
        }

        return DB::transaction(function () use ($invoice, $userId) {
            $entityId = app(EntityContext::class)->id();
            $ar = Account::query()->where('code', '1100')->first();
            $revenue = Account::query()->where('code', '4000')->first();
            $vat = Account::query()->where('code', '2100')->first();
            $journal = Journal::query()->where('code', 'SJ')->first();

            $lines = [
                [
                    'account_id' => $ar?->id,
                    'debit' => (float) $invoice->total_amount,
                    'credit' => 0,
                    'memo' => 'AR '.$invoice->invoice_no,
                    'partner_type' => Partner::class,
                    'partner_id' => $invoice->partner_id,
                ],
                [
                    'account_id' => $revenue?->id,
                    'debit' => 0,
                    'credit' => (float) $invoice->subtotal - (float) $invoice->discount_amount,
                    'memo' => 'Sales '.$invoice->invoice_no,
                ],
            ];

            if ((float) $invoice->vat_amount > 0) {
                $lines[] = [
                    'account_id' => $vat?->id,
                    'debit' => 0,
                    'credit' => (float) $invoice->vat_amount,
                    'memo' => 'Output VAT '.$invoice->invoice_no,
                ];
            }

            $entry = $this->journalPostingService->create([
                'journal_id' => $journal?->id,
                'entry_date' => $invoice->invoice_date->toDateString(),
                'reference' => $invoice->bir_si_or_no ?: $invoice->invoice_no,
                'memo' => 'Invoice '.$invoice->invoice_no,
                'source_system' => 'billing',
                'source_type' => 'invoice',
                'source_id' => $invoice->id,
            ], $lines, \App\Models\User::find($userId));

            if (! config('accounting.sync_as_draft', true)) {
                $this->journalPostingService->post($entry, \App\Models\User::findOrFail($userId));
            }

            $invoice->update([
                'status' => 'confirmed',
                'journal_entry_id' => $entry->id,
            ]);

            $this->adjustPartnerBalance($invoice->partner_id, (float) $invoice->total_amount);

            return $invoice->fresh();
        });
    }

    public function collect(Invoice $invoice, array $payment, int $userId): InvoicePayment
    {
        return DB::transaction(function () use ($invoice, $payment, $userId) {
            $amount = (float) $payment['amount'];
            $cashCode = match ($payment['payment_method'] ?? 'cash') {
                'card' => '1020',
                'gcash' => '1030',
                'check', 'bank' => '1010',
                default => '1000',
            };

            $cash = Account::query()->where('code', $cashCode)->first()
                ?? Account::query()->where('code', '1000')->first();
            $ar = Account::query()->where('code', '1100')->first();
            $journal = Journal::query()->where('code', 'CRJ')->first();

            $entry = $this->journalPostingService->create([
                'journal_id' => $journal?->id,
                'entry_date' => $payment['paid_date'],
                'reference' => $payment['reference'] ?? $invoice->invoice_no,
                'memo' => 'Collection '.$invoice->invoice_no,
                'source_system' => 'billing',
                'source_type' => 'invoice_payment',
                'source_id' => $invoice->id,
            ], [
                [
                    'account_id' => $cash?->id,
                    'debit' => $amount,
                    'credit' => 0,
                    'memo' => 'Collection',
                ],
                [
                    'account_id' => $ar?->id,
                    'debit' => 0,
                    'credit' => $amount,
                    'memo' => 'AR clear',
                    'partner_type' => Partner::class,
                    'partner_id' => $invoice->partner_id,
                ],
            ], \App\Models\User::find($userId));

            if (! config('accounting.sync_as_draft', true)) {
                $this->journalPostingService->post($entry, \App\Models\User::findOrFail($userId));
            }

            $record = InvoicePayment::query()->create([
                'invoice_id' => $invoice->id,
                'paid_date' => $payment['paid_date'],
                'amount' => $amount,
                'payment_method' => $payment['payment_method'],
                'reference' => $payment['reference'] ?? null,
                'bank_account_id' => $payment['bank_account_id'] ?? null,
                'customer_deposit_id' => $payment['customer_deposit_id'] ?? null,
                'journal_entry_id' => $entry->id,
                'received_by' => $userId,
            ]);

            $paid = (float) $invoice->amount_paid + $amount;
            $balance = max(0, (float) $invoice->total_amount - $paid);
            $invoice->update([
                'amount_paid' => $paid,
                'balance_due' => $balance,
                'status' => $balance <= 0 ? 'paid' : 'partially_paid',
            ]);

            $this->adjustPartnerBalance($invoice->partner_id, -$amount);

            return $record;
        });
    }

    protected function computeTotals(array $lines, bool $vatExempt): array
    {
        $subtotal = 0;
        $discount = 0;
        foreach ($lines as $line) {
            $subtotal += ((float) ($line['quantity'] ?? 1)) * ((float) ($line['unit_price'] ?? 0));
            $discount += (float) ($line['discount_amount'] ?? 0);
        }
        $net = max(0, $subtotal - $discount);
        $vatRate = (float) config('accounting.vat_rate', 0.12);
        $vat = $vatExempt ? 0 : round($net * $vatRate / (1 + $vatRate), 2);
        // If prices are VAT-inclusive, net of VAT is total - vat; treat unit prices as VAT-inclusive retail.
        $sales = $vatExempt ? $net : ($net - $vat);

        return [
            'subtotal' => round($sales + $discount, 2),
            'discount_amount' => round($discount, 2),
            'vat_amount' => $vat,
            'total_amount' => round($net, 2),
        ];
    }

    protected function lineAmount(array $line): float
    {
        return round(
            ((float) ($line['quantity'] ?? 1)) * ((float) ($line['unit_price'] ?? 0)) - (float) ($line['discount_amount'] ?? 0),
            2
        );
    }

    protected function adjustPartnerBalance(int $partnerId, float $delta): void
    {
        $balance = PartnerBalance::query()->firstOrCreate(
            ['partner_id' => $partnerId],
            ['balance' => 0]
        );
        $balance->update(['balance' => (float) $balance->balance + $delta]);
    }
}
