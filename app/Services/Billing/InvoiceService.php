<?php

namespace App\Services\Billing;

use App\Models\Account;
use App\Models\CustomerDeposit;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePayment;
use App\Models\Journal;
use App\Models\Partner;
use App\Models\PartnerBalance;
use App\Services\Accounting\CashMovementService;
use App\Support\EntityContext;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InvoiceService
{
    /** Senior citizen / PWD discount rate (RA 9994 / RA 10754), applied to the VAT-exclusive price. */
    public const SENIOR_PWD_DISCOUNT_RATE = 0.20;

    /** Line types booked to Service Revenue (4010) rather than Sales Revenue (4000). */
    public const SERVICE_LINE_TYPES = ['service', 'edging', 'repair', 'eye_exam'];

    public function __construct(protected CashMovementService $cash) {}

    public function create(array $data, array $lines, int $userId): Invoice
    {
        return DB::transaction(function () use ($data, $lines, $userId) {
            // A non-VAT entity charges no output VAT on any sale.
            $vatExempt = (bool) ($data['is_vat_exempt'] ?? false) || ! (app(EntityContext::class)->current()?->vatRegistered() ?? true);
            $totals = $this->computeTotals($lines, $vatExempt, (bool) ($data['is_senior_pwd'] ?? false));

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
                    'inventory_item_id' => $line['inventory_item_id'] ?? null,
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

    /**
     * Recognise the sale: Dr AR (and Sales Discounts), Cr Sales / Service Revenue and Output VAT.
     */
    public function confirm(Invoice $invoice, int $userId): Invoice
    {
        if ($invoice->status !== 'draft') {
            throw ValidationException::withMessages(['invoice' => 'Only draft invoices can be confirmed.']);
        }

        return DB::transaction(function () use ($invoice, $userId) {
            $invoice->loadMissing('lines');
            $ar = $this->account('1100');
            // Statutory senior/PWD discounts are kept apart from ordinary sales discounts.
            $discounts = ($invoice->is_senior_pwd ? Account::query()->where('code', '4110')->first() : null) ?? $this->account('4100');
            $vat = $this->account('2100');
            $journal = Journal::query()->where('code', 'SJ')->firstOrFail();

            $lines = [[
                'account_id' => $ar->id,
                'debit' => (float) $invoice->total_amount,
                'credit' => 0,
                'memo' => 'AR '.$invoice->invoice_no,
                'partner_type' => Partner::class,
                'partner_id' => $invoice->partner_id,
            ]];

            if ((float) $invoice->discount_amount > 0) {
                $lines[] = [
                    'account_id' => $discounts->id,
                    'debit' => (float) $invoice->discount_amount,
                    'credit' => 0,
                    'memo' => $invoice->is_senior_pwd ? 'Senior/PWD and line discounts' : 'Sales discounts',
                ];
            }

            foreach ($this->revenueSplit($invoice) as $code => $amount) {
                // Wholesale product sales go to Sales Revenue – Wholesale where the entity has it.
                $account = $code === '4000' && $invoice->pricing_type === 'wholesale'
                    ? (Account::query()->where('code', '4005')->first() ?? $this->account('4000'))
                    : $this->account($code);

                $lines[] = [
                    'account_id' => $account->id,
                    'debit' => 0,
                    'credit' => $amount,
                    'memo' => ($code === '4010' ? 'Service revenue ' : 'Sales ').$invoice->invoice_no,
                ];
            }

            if ((float) $invoice->vat_amount > 0) {
                $lines[] = [
                    'account_id' => $vat->id,
                    'debit' => 0,
                    'credit' => (float) $invoice->vat_amount,
                    'memo' => 'Output VAT '.$invoice->invoice_no,
                ];
            }

            $entry = $this->cash->journal([
                'journal_id' => $journal->id,
                'entry_date' => $invoice->invoice_date->toDateString(),
                'reference' => $invoice->bir_si_or_no ?: $invoice->invoice_no,
                'memo' => 'Invoice '.$invoice->invoice_no,
                'source_system' => 'billing',
                'source_type' => 'invoice',
                'source_id' => $invoice->id,
            ], $lines, $userId);

            $invoice->update(['status' => 'confirmed', 'journal_entry_id' => $entry->id]);
            $this->adjustPartnerBalance($invoice->partner_id, (float) $invoice->total_amount);

            return $invoice->fresh();
        });
    }

    /**
     * Record a collection against the invoice: Dr cash/bank (per payment method), Cr AR.
     */
    public function collect(Invoice $invoice, array $payment, int $userId): InvoicePayment
    {
        $amount = round((float) $payment['amount'], 2);
        $this->assertCollectible($invoice, $amount);

        $method = $payment['payment_method'];
        $bank = $this->cash->bankAccountFor(isset($payment['bank_account_id']) ? (int) $payment['bank_account_id'] : null);

        if ($this->cash->requiresBank($method) && ! $bank) {
            throw ValidationException::withMessages(['bank_account_id' => 'Select the bank account this payment was deposited to.']);
        }

        return DB::transaction(function () use ($invoice, $payment, $userId, $amount, $method, $bank) {
            $cashAccount = $this->cash->cashAccountFor($method, $bank);
            $journal = Journal::query()->where('code', 'CRJ')->firstOrFail();

            $entry = $this->cash->journal([
                'journal_id' => $journal->id,
                'entry_date' => $payment['paid_date'],
                'reference' => $payment['reference'] ?? $invoice->invoice_no,
                'memo' => 'Collection '.$invoice->invoice_no.' ('.$this->methodLabel($method).')',
                'source_system' => 'billing',
                'source_type' => 'invoice_payment',
                'source_id' => $invoice->id,
            ], [
                ['account_id' => $cashAccount->id, 'debit' => $amount, 'credit' => 0, 'memo' => 'Collection'],
                [
                    'account_id' => $this->account('1100')->id,
                    'debit' => 0,
                    'credit' => $amount,
                    'memo' => 'AR clear',
                    'partner_type' => Partner::class,
                    'partner_id' => $invoice->partner_id,
                ],
            ], $userId);

            $record = InvoicePayment::query()->create([
                'invoice_id' => $invoice->id,
                'paid_date' => $payment['paid_date'],
                'amount' => $amount,
                'payment_method' => $method,
                'reference' => $payment['reference'] ?? null,
                'bank_account_id' => $bank?->id,
                'journal_entry_id' => $entry->id,
                'received_by' => $userId,
            ]);

            if ($bank) {
                $this->cash->recordBankLine($bank, [
                    'txn_date' => $payment['paid_date'],
                    'description' => 'Collection '.$invoice->invoice_no,
                    'amount' => $amount,
                    'direction' => 'in',
                    'reference' => $payment['reference'] ?? $invoice->invoice_no,
                    'source_type' => 'invoice_payment',
                    'source_id' => $record->id,
                    'journal_entry_id' => $entry->id,
                ]);
            }

            $this->applyToInvoice($invoice, $amount);

            return $record;
        });
    }

    /**
     * Apply an open customer deposit to the invoice: Dr Customer Deposits (liability), Cr AR.
     */
    public function applyDeposit(Invoice $invoice, CustomerDeposit $deposit, float $amount, string $date, ?int $userId): InvoicePayment
    {
        $amount = round($amount, 2);
        $this->assertCollectible($invoice, $amount);

        if ($deposit->partner_id !== $invoice->partner_id) {
            throw ValidationException::withMessages(['customer_deposit_id' => 'The deposit belongs to a different customer.']);
        }
        if ($deposit->status !== 'open' || $amount > $deposit->remainingAmount() + 0.001) {
            throw ValidationException::withMessages([
                'amount' => 'Only '.number_format($deposit->remainingAmount(), 2).' remains on this deposit.',
            ]);
        }

        return DB::transaction(function () use ($invoice, $deposit, $amount, $date, $userId) {
            $journal = Journal::query()->whereIn('code', ['GJ', 'CRJ'])->orderByRaw("code = 'GJ' desc")->firstOrFail();

            $entry = $this->cash->journal([
                'journal_id' => $journal->id,
                'entry_date' => $date,
                'reference' => $deposit->reference ?: 'DEP-'.$deposit->id,
                'memo' => 'Deposit applied to '.$invoice->invoice_no,
                'source_system' => 'billing',
                'source_type' => 'deposit_application',
                'source_id' => $deposit->id,
            ], [
                ['account_id' => $this->account('2300')->id, 'debit' => $amount, 'credit' => 0, 'memo' => 'Customer deposit applied'],
                [
                    'account_id' => $this->account('1100')->id,
                    'debit' => 0,
                    'credit' => $amount,
                    'memo' => 'AR clear',
                    'partner_type' => Partner::class,
                    'partner_id' => $invoice->partner_id,
                ],
            ], $userId);

            $record = InvoicePayment::query()->create([
                'invoice_id' => $invoice->id,
                'paid_date' => $date,
                'amount' => $amount,
                'payment_method' => 'deposit',
                'reference' => $deposit->reference,
                'customer_deposit_id' => $deposit->id,
                'journal_entry_id' => $entry->id,
                'received_by' => $userId,
            ]);

            $applied = round((float) $deposit->applied_amount + $amount, 2);
            $deposit->update([
                'applied_amount' => $applied,
                'invoice_id' => $invoice->id,
                'status' => $applied >= (float) $deposit->amount - 0.001 ? 'applied' : 'open',
            ]);

            $this->applyToInvoice($invoice, $amount);

            return $record;
        });
    }

    /**
     * Totals for VAT-inclusive prices.
     *  - Regular: VAT is extracted from the net price.
     *  - VAT-exempt: no VAT.
     *  - Senior/PWD: VAT removed, then a 20% discount on the VAT-exclusive amount; no VAT.
     *
     * @return array{subtotal: float, discount_amount: float, vat_amount: float, total_amount: float}
     */
    public function computeTotals(array $lines, bool $vatExempt, bool $seniorPwd = false): array
    {
        $gross = 0.0;
        $lineDiscounts = 0.0;
        foreach ($lines as $line) {
            $gross += (float) ($line['quantity'] ?? 1) * (float) ($line['unit_price'] ?? 0);
            $lineDiscounts += (float) ($line['discount_amount'] ?? 0);
        }

        $net = max(0, $gross - $lineDiscounts);
        $vatRate = (float) config('accounting.vat_rate', 0.12);

        if ($seniorPwd) {
            $base = round($net / (1 + $vatRate), 2);
            $seniorDiscount = round($base * self::SENIOR_PWD_DISCOUNT_RATE, 2);

            return [
                'subtotal' => round($base + $lineDiscounts, 2),
                'discount_amount' => round($lineDiscounts + $seniorDiscount, 2),
                'vat_amount' => 0.0,
                'total_amount' => round($base - $seniorDiscount, 2),
            ];
        }

        $vat = $vatExempt ? 0.0 : round($net * $vatRate / (1 + $vatRate), 2);

        return [
            'subtotal' => round($net - $vat + $lineDiscounts, 2),
            'discount_amount' => round($lineDiscounts, 2),
            'vat_amount' => $vat,
            'total_amount' => round($net, 2),
        ];
    }

    public function methodLabel(string $method): string
    {
        return match ($method) {
            'gcash' => 'GCash',
            'bank_transfer' => 'Bank transfer',
            default => ucfirst($method),
        };
    }

    /**
     * Gross revenue (subtotal) split between Sales Revenue and Service Revenue by line value.
     *
     * @return array<string, float>
     */
    protected function revenueSplit(Invoice $invoice): array
    {
        $subtotal = (float) $invoice->subtotal;
        $gross = (float) $invoice->lines->sum(fn (InvoiceLine $l) => (float) $l->quantity * (float) $l->unit_price);
        $service = (float) $invoice->lines
            ->filter(fn (InvoiceLine $l) => in_array($l->line_type, self::SERVICE_LINE_TYPES, true))
            ->sum(fn (InvoiceLine $l) => (float) $l->quantity * (float) $l->unit_price);

        $serviceShare = $gross > 0 ? round($subtotal * $service / $gross, 2) : 0.0;

        return array_filter([
            '4000' => round($subtotal - $serviceShare, 2),
            '4010' => $serviceShare,
        ], fn (float $amount) => $amount > 0);
    }

    protected function assertCollectible(Invoice $invoice, float $amount): void
    {
        if (! in_array($invoice->status, ['confirmed', 'partially_paid'], true)) {
            throw ValidationException::withMessages(['amount' => 'Confirm the invoice before recording payments.']);
        }
        if ($amount <= 0 || $amount > (float) $invoice->balance_due + 0.001) {
            throw ValidationException::withMessages([
                'amount' => 'Amount must be between 0.01 and the balance due ('.number_format((float) $invoice->balance_due, 2).').',
            ]);
        }
    }

    /**
     * Record a settlement that is journalized elsewhere (e.g. a related entity that collected the money): update
     * the invoice's paid amount, balance and status and the customer's open balance.
     */
    public function recordSettlement(Invoice $invoice, float $amount): void
    {
        $this->applyToInvoice($invoice, round($amount, 2));
    }

    protected function applyToInvoice(Invoice $invoice, float $amount): void
    {
        $paid = round((float) $invoice->amount_paid + $amount, 2);
        $balance = round(max(0, (float) $invoice->total_amount - $paid), 2);

        $invoice->update([
            'amount_paid' => $paid,
            'balance_due' => $balance,
            'status' => $balance <= 0 ? 'paid' : 'partially_paid',
        ]);

        $this->adjustPartnerBalance($invoice->partner_id, -$amount);
    }

    protected function account(string $code): Account
    {
        $account = Account::query()->where('code', $code)->first();

        if (! $account) {
            throw ValidationException::withMessages([
                'invoice' => "Account {$code} is missing from this entity's chart of accounts.",
            ]);
        }

        return $account;
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
        $balance = PartnerBalance::query()->firstOrCreate(['partner_id' => $partnerId], ['balance' => 0]);
        $balance->update(['balance' => (float) $balance->balance + $delta]);
    }
}
