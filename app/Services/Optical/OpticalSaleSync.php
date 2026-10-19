<?php

namespace App\Services\Optical;

use App\Models\CustomerDeposit;
use App\Models\Entity;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\InvoicePayment;
use App\Models\Partner;
use App\Models\PartnerBalance;
use App\Models\SyncDocument;
use App\Services\Billing\InvoiceService;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Completed optical orders → sales.
 *
 * optical-new only completes an order once it is fully paid, so the customer's payments are already in the books as
 * customer deposits of the collecting entity (see OpticalDepositSync). Completing the order:
 *
 *  1. records an invoice in each entity that owns part of the order (JAM Opticus for products, edging and repair; the
 *     clinic for its clinical services), with VAT unless the entity is non-VAT or the sale is senior/PWD;
 *  2. books cost of goods sold for the products at decoded unit cost;
 *  3. settles each invoice from the deposits: the collecting entity applies them to its own invoice, and for another
 *     entity's invoice it moves the deposit to Due to Related Entities while that entity books Due from.
 *
 * Un-completing, deleting or changing the order reverses everything it booked and books it again if still due.
 */
class OpticalSaleSync
{
    public const DOC = 'sale';

    public function __construct(
        protected OpticalRouter $router,
        protected OpticalLedger $ledger,
        protected OpticalDocuments $documents,
        protected InvoiceService $invoices,
    ) {}

    /**
     * @param  array<string, mixed>  $order
     * @return 'posted'|'review'|'skipped'|'reversed'
     */
    public function process(array $order): string
    {
        $collector = $this->router->collectorFor($order);
        $doc = $this->documents->find($collector, self::DOC, $order['id']);
        $completedOn = empty($order['deleted_at']) ? $this->router->businessDate($order['completed_at'] ?? null) : null;

        if ($completedOn === null) {
            if (! empty($doc?->meta)) {
                DB::transaction(fn () => $this->reverse($doc, 'Order '.$order['ts_no'].' was re-opened or deleted in the optical POS'));

                return 'reversed';
            }

            return 'skipped';
        }

        $hash = $this->hash($order, $collector);
        if ($this->documents->isUnchanged($doc, $hash)) {
            return 'skipped';
        }

        $start = $this->router->startDate();
        if ($start !== null && $completedOn < $start) {
            $this->documents->save($collector, self::DOC, $order['id'], $hash, $order, 'skipped', null, "Completed before go-live ({$start}); part of the opening balances.");

            return 'skipped';
        }

        return DB::transaction(function () use ($order, $doc, $collector, $completedOn, $hash) {
            if (! empty($doc?->meta)) {
                $this->reverse($doc, 'Order '.$order['ts_no'].' changed in the optical POS');
            }

            $meta = $this->book($order, $collector, $completedOn);
            $status = $meta['warnings'] === [] ? 'posted' : 'review';
            $doc = $this->documents->save($collector, self::DOC, $order['id'], $hash, $order, $status, $meta, $meta['warnings'] === [] ? null : implode(' ', $meta['warnings']));

            $this->settle($doc);

            return $status;
        });
    }

    /**
     * Apply the order's open deposits to its open invoices. Runs after booking, and again whenever a deposit for an
     * already-booked order arrives later.
     */
    public function settle(SyncDocument $doc): void
    {
        $meta = $doc->meta ?? [];
        $invoiceIds = $meta['invoice_ids'] ?? [];
        if ($invoiceIds === []) {
            return;
        }

        $collector = Entity::query()->findOrFail($doc->entity_id);
        $deposits = CustomerDeposit::query()->withoutGlobalScope('entity')
            ->where('entity_id', $collector->id)
            ->where('source_system', 'optical')
            ->where('external_order_id', (string) $doc->source_id)
            ->where('status', 'open')
            ->orderBy('deposit_date')
            ->orderBy('id')
            ->get();

        // The collecting entity's own invoice is settled first.
        $invoices = Invoice::query()->withoutGlobalScope('entity')->whereIn('id', $invoiceIds)->get()
            ->sortBy(fn (Invoice $i) => [(int) $i->entity_id !== (int) $collector->id, $i->id]);

        foreach ($invoices as $invoice) {
            foreach ($deposits as $deposit) {
                $due = round((float) $invoice->balance_due, 2);
                $take = round(min($due, $deposit->remainingAmount()), 2);
                if ($due <= 0 || $take <= 0) {
                    continue;
                }

                $date = max($deposit->deposit_date->toDateString(), $invoice->invoice_date->toDateString());
                $journalIds = (int) $invoice->entity_id === (int) $collector->id
                    ? $this->applyOwnDeposit($collector, $invoice, $deposit, $take, $date)
                    : $this->applyForRelatedEntity($collector, $invoice, $deposit, $take, $date);

                $meta['journal_entry_ids'] = [...($meta['journal_entry_ids'] ?? []), ...$journalIds];
                $meta['applications'][] = ['deposit_id' => $deposit->id, 'invoice_id' => $invoice->id, 'amount' => $take];
                $invoice->refresh();
                $deposit->refresh();
            }
        }

        $doc->update(['meta' => $meta]);
    }

    /**
     * Undo everything a sale document booked: give the deposits back, reverse its journal entries, void its invoices.
     */
    public function reverse(SyncDocument $doc, string $reason): void
    {
        $meta = $doc->meta ?? [];

        foreach ($meta['applications'] ?? [] as $application) {
            $deposit = CustomerDeposit::query()->withoutGlobalScope('entity')->find($application['deposit_id']);
            if ($deposit) {
                $applied = round(max(0, (float) $deposit->applied_amount - (float) $application['amount']), 2);
                $deposit->update(['applied_amount' => $applied, 'status' => $deposit->status === 'void' ? 'void' : 'open', 'invoice_id' => $applied > 0 ? $deposit->invoice_id : null]);
            }
        }

        $this->ledger->reverse($meta['journal_entry_ids'] ?? [], 'Reversal: '.$reason);

        foreach ($meta['invoice_ids'] ?? [] as $invoiceId) {
            $invoice = Invoice::query()->withoutGlobalScope('entity')->find($invoiceId);
            if (! $invoice || $invoice->status === 'void') {
                continue;
            }

            $this->adjustPartnerBalance($invoice->partner_id, -(float) $invoice->balance_due);
            // Free the number so a corrected sale can reuse it.
            $invoice->update(['status' => 'void', 'invoice_no' => $invoice->invoice_no.'-VOID'.$invoice->id, 'balance_due' => 0, 'notes' => trim(($invoice->notes ?? '')."\nVoided: {$reason}")]);
        }

        InventoryMovement::query()->withoutGlobalScope('entity')->whereIn('id', $meta['movement_ids'] ?? [])->update(['review_status' => 'reversed']);

        $doc->update(['meta' => null, 'status' => 'reversed', 'journal_entry_id' => null, 'error' => $reason]);
    }

    /**
     * @param  array<string, mixed>  $order
     * @return array{journal_entry_ids: list<int>, invoice_ids: list<int>, movement_ids: list<int>, applications: list<array<string, mixed>>, warnings: list<string>}
     */
    protected function book(array $order, Entity $collector, string $date): array
    {
        $lines = $this->lines($order, $collector);
        if ($lines === []) {
            throw new RuntimeException("Order {$order['ts_no']} has no line items.");
        }

        $meta = ['journal_entry_ids' => [], 'invoice_ids' => [], 'movement_ids' => [], 'applications' => [], 'warnings' => []];
        $byOwner = collect($lines)->groupBy(fn (array $l) => $l['owner']->id);
        $split = $byOwner->count() > 1;

        foreach ($byOwner as $ownerLines) {
            $owner = $ownerLines->first()['owner'];

            $this->ledger->in($owner, function () use ($order, $owner, $ownerLines, $split, $date, &$meta) {
                $this->invoice($order, $owner, $ownerLines->all(), $split, $date, $meta);
                $this->costOfSales($order, $ownerLines->where('class', 'product')->all(), $date, $meta);
            });
        }

        return $meta;
    }

    /**
     * Order lines with each line's net share of the payable total. Older orders keep the doctor's discount at order
     * level, newer ones spread it over the lines, so the line amounts are scaled to the payable total either way.
     *
     * @param  array<string, mixed>  $order
     * @return list<array<string, mixed>>
     */
    protected function lines(array $order, Entity $collector): array
    {
        $items = array_values($order['items'] ?? []);
        if ($items === []) {
            return [];
        }

        $payable = round((float) ($order['payable_total'] ?? $order['total_amount'] ?? 0), 2);
        $amounts = array_map(fn (array $i) => max(0, (float) ($i['amount'] ?? 0)), $items);
        $basis = array_sum($amounts) > 0 ? $amounts : array_map(fn (array $i) => max(0, (float) ($i['gross_amount'] ?? 0)), $items);
        $basisTotal = array_sum($basis);

        $nets = [];
        foreach (array_keys($items) as $k) {
            $nets[$k] = $basisTotal > 0 ? round($payable * $basis[$k] / $basisTotal, 2) : 0.0;
        }
        // Rounding difference goes on the largest line.
        if ($nets !== [] && ($diff = round($payable - array_sum($nets), 2)) != 0.0) {
            $largest = array_keys($nets, max($nets))[0];
            $nets[$largest] = round($nets[$largest] + $diff, 2);
        }

        return array_map(function (array $item, int $k) use ($nets, $collector) {
            $quantity = max(1, (int) ($item['quantity'] ?? 1));
            $net = $nets[$k];
            $gross = max($net, round((float) ($item['gross_amount'] ?? $item['amount'] ?? 0), 2));

            return [
                'item' => $item,
                'class' => $this->router->lineClass($item),
                'owner' => $this->router->ownerFor($item, $collector),
                'label' => (string) ($item['product_label'] ?? $item['stock_type'] ?? 'Item'),
                'quantity' => $quantity,
                'gross' => $gross,
                'net' => $net,
                'discount' => round($gross - $net, 2),
                'unit_cost' => round((float) ($item['unit_cost'] ?? 0), 2),
            ];
        }, $items, array_keys($items));
    }

    /**
     * Record the owner's invoice and its sales entry: Dr AR, Dr discounts, Cr revenue by line class, Cr output VAT.
     *
     * @param  array<string, mixed>  $order
     * @param  list<array<string, mixed>>  $lines
     * @param  array<string, mixed>  $meta
     */
    protected function invoice(array $order, Entity $owner, array $lines, bool $split, string $date, array &$meta): void
    {
        $exempt = $this->router->isVatExempt($order);
        $vatable = $owner->vatRegistered() && ! $exempt;
        $rate = $this->ledger->vatRate();
        $wholesale = ! empty($order['is_wholesale_order']);

        $groups = [];
        foreach ($lines as $line) {
            $event = $line['class'] === 'product' ? ($wholesale ? 'sale_product_wholesale' : 'sale_product_retail') : 'sale_service';
            $groups[$event]['gross'] = ($groups[$event]['gross'] ?? 0) + $line['gross'];
            $groups[$event]['net'] = ($groups[$event]['net'] ?? 0) + $line['net'];
        }

        $total = round(array_sum(array_column($lines, 'net')), 2);
        $discount = round(array_sum(array_column($lines, 'discount')), 2);
        if ($total <= 0 && $discount <= 0) {
            return;
        }

        $vatTotal = 0.0;
        $revenue = [];
        foreach ($groups as $event => $g) {
            $vat = $vatable ? round($g['net'] * $rate / (1 + $rate), 2) : 0.0;
            $vatTotal += $vat;
            $revenue[$event] = round($g['gross'] - $vat, 2);
        }
        $vatTotal = round($vatTotal, 2);

        $partner = $this->router->partnerFor($order, $owner);
        $number = 'OPT-'.($order['ts_no'] ?: $order['id']).($split ? '-'.$this->shortCode($owner) : '');
        $customer = trim((string) ($order['customer_name'] ?? ''));

        $invoice = Invoice::query()->create([
            'entity_id' => $owner->id,
            'partner_id' => $partner->id,
            'invoice_no' => $number,
            'bir_si_or_no' => ($order['si'] ?? null) ?: (($order['or'] ?? null) ?: null),
            'invoice_date' => $date,
            'due_date' => $date,
            'pricing_type' => $wholesale ? 'wholesale' : 'retail',
            'status' => 'confirmed',
            'is_senior_pwd' => $exempt,
            'is_vat_exempt' => $exempt,
            'subtotal' => round(array_sum($revenue), 2),
            'discount_amount' => $discount,
            'vat_amount' => $vatTotal,
            'total_amount' => $total,
            'amount_paid' => 0,
            'balance_due' => $total,
            'source_system' => 'optical',
            'source_type' => 'order',
            'source_id' => $order['id'],
            'notes' => trim('Optical POS order '.$order['ts_no'].($customer !== '' ? ' — '.$customer : '').($split ? ' (part of a split order)' : '')),
        ]);

        foreach (array_values($lines) as $n => $line) {
            InvoiceLine::query()->create([
                'invoice_id' => $invoice->id,
                'line_no' => $n + 1,
                'line_type' => $this->lineType($line),
                'description' => mb_substr($line['label'], 0, 250),
                'quantity' => $line['quantity'],
                'unit_price' => round($line['gross'] / $line['quantity'], 2),
                'discount_amount' => $line['discount'],
                'amount' => $line['net'],
                'notes' => ($line['item']['stock_type'] ?? 'item').':'.($line['item']['products_id'] ?? ''),
            ]);
        }

        $memo = 'Optical sale '.$order['ts_no'].($customer !== '' ? ' — '.$customer : '');
        $entryLines = [[
            'account_id' => $this->ledger->rule('sale_product_retail')->debit_account_id,
            'debit' => $total,
            'credit' => 0,
            'memo' => 'Accounts receivable '.$number,
            'partner_type' => Partner::class,
            'partner_id' => $partner->id,
        ]];
        if ($discount > 0) {
            $entryLines[] = ['account_id' => $this->ledger->rule($exempt ? 'sale_senior_pwd_discount' : 'sale_discount')->debit_account_id, 'debit' => $discount, 'credit' => 0, 'memo' => $exempt ? 'Senior citizen / PWD discount' : 'Sales discounts'];
        }
        foreach ($revenue as $event => $amount) {
            $entryLines[] = ['account_id' => $this->ledger->rule($event)->credit_account_id, 'debit' => 0, 'credit' => $amount, 'memo' => $event === 'sale_service' ? 'Service revenue' : 'Product sales'];
        }
        if ($vatTotal > 0) {
            $entryLines[] = ['account_id' => $this->ledger->rule('output_vat')->credit_account_id, 'debit' => 0, 'credit' => $vatTotal, 'memo' => 'Output VAT'];
        }

        $entry = $this->ledger->journal('SJ', [
            'entry_date' => $date,
            'reference' => $invoice->bir_si_or_no ?: $number,
            'memo' => $memo,
            'source_type' => 'optical_sale',
            'source_id' => $invoice->id,
        ], $entryLines);

        $invoice->update(['journal_entry_id' => $entry->id]);
        $this->adjustPartnerBalance($partner->id, $total);

        $meta['invoice_ids'][] = $invoice->id;
        $meta['journal_entry_ids'][] = $entry->id;
    }

    /**
     * Cost of goods sold for the product lines at decoded unit cost: Dr COGS, Cr Inventory. Lines without a cost are
     * listed for review instead.
     *
     * @param  array<string, mixed>  $order
     * @param  array<int, array<string, mixed>>  $productLines
     * @param  array<string, mixed>  $meta
     */
    protected function costOfSales(array $order, array $productLines, string $date, array &$meta): void
    {
        if ($productLines === []) {
            return;
        }

        $entity = $this->ledger->current();
        $customer = trim((string) ($order['customer_name'] ?? ''));
        $total = 0.0;
        $movements = [];

        foreach ($productLines as $line) {
            $cost = round($line['unit_cost'] * $line['quantity'], 2);
            $total += $cost;

            $movements[] = InventoryMovement::query()->create([
                'entity_id' => $entity->id,
                'movement_reference' => (string) $order['ts_no'],
                'movement_type' => 'sales_issue',
                'quantity' => -$line['quantity'],
                'unit_cost' => $line['unit_cost'],
                'total_cost' => $cost,
                'accounting_link_type' => 'cogs',
                'review_status' => $cost > 0 ? 'matched' : 'needs_review',
                'notes' => $cost > 0 ? null : 'No decodable cost in the optical POS — cost of goods sold not booked for this item.',
                'source_system' => 'optical',
                'source_ref' => ($line['item']['stock_type'] ?? 'item').':'.($line['item']['products_id'] ?? ''),
                'stock_type' => $line['item']['stock_type'] ?? null,
                'product_code' => $line['item']['product_code'] ?? null,
                'description' => mb_substr($line['label'], 0, 250),
                'counterparty' => $customer !== '' ? mb_substr($customer, 0, 250) : null,
                'occurred_on' => $date,
            ]);

            if ($cost <= 0) {
                $meta['warnings'][] = "No cost for {$line['label']}.";
            }
        }

        $total = round($total, 2);
        $entryId = null;
        if ($total > 0) {
            $rule = $this->ledger->rule('cogs');
            $entryId = $this->ledger->journal('GJ', [
                'entry_date' => $date,
                'reference' => (string) $order['ts_no'],
                'memo' => 'Cost of goods sold — optical order '.$order['ts_no'],
                'source_type' => 'optical_cogs',
                'source_id' => $movements[0]->id,
            ], [
                ['account_id' => $rule->debit_account_id, 'debit' => $total, 'credit' => 0, 'memo' => 'Cost of goods sold'],
                ['account_id' => $rule->credit_account_id, 'debit' => 0, 'credit' => $total, 'memo' => 'Inventory issued'],
            ])->id;
            $meta['journal_entry_ids'][] = $entryId;
        }

        foreach ($movements as $movement) {
            if ($entryId && (float) $movement->total_cost > 0) {
                $movement->update(['journal_entry_id' => $entryId]);
            }
            $meta['movement_ids'][] = $movement->id;
        }
    }

    /**
     * The collecting entity applies its customer's deposit to its own invoice: Dr Customer Deposits, Cr AR.
     *
     * @return list<int>
     */
    protected function applyOwnDeposit(Entity $collector, Invoice $invoice, CustomerDeposit $deposit, float $amount, string $date): array
    {
        return $this->ledger->in($collector, function () use ($invoice, $deposit, $amount, $date) {
            $payment = $this->invoices->applyDeposit($invoice, $deposit, $amount, $date, null);

            return [(int) $payment->journal_entry_id];
        });
    }

    /**
     * The collecting entity holds the customer's deposit for another entity's invoice. Collector: Dr Customer
     * Deposits, Cr Due to Related Entities. Owner: Dr Due from Related Entities, Cr AR.
     *
     * @return list<int>
     */
    protected function applyForRelatedEntity(Entity $collector, Invoice $invoice, CustomerDeposit $deposit, float $amount, string $date): array
    {
        $owner = Entity::query()->findOrFail($invoice->entity_id);

        $collectorEntry = $this->ledger->in($collector, function () use ($owner, $invoice, $deposit, $amount, $date) {
            $rule = $this->ledger->rule('intercompany_collected');

            $entry = $this->ledger->journal('GJ', [
                'entry_date' => $date,
                'reference' => $invoice->bir_si_or_no ?: $invoice->invoice_no,
                'memo' => "Deposit used for {$owner->name} invoice {$invoice->invoice_no}",
                'source_type' => 'optical_due_to',
                'source_id' => $deposit->id,
            ], [
                ['account_id' => $rule->debit_account_id, 'debit' => $amount, 'credit' => 0, 'memo' => 'Customer deposit applied'],
                ['account_id' => $rule->credit_account_id, 'debit' => 0, 'credit' => $amount, 'memo' => "Due to {$owner->name}"],
            ]);

            $applied = round((float) $deposit->applied_amount + $amount, 2);
            $deposit->update([
                'applied_amount' => $applied,
                'invoice_id' => $deposit->invoice_id ?? $invoice->id,
                'status' => $applied >= (float) $deposit->amount - 0.001 ? 'applied' : 'open',
            ]);

            return $entry;
        });

        $ownerEntry = $this->ledger->in($owner, function () use ($collector, $invoice, $deposit, $amount, $date) {
            $rule = $this->ledger->rule('intercompany_billed');

            $entry = $this->ledger->journal('GJ', [
                'entry_date' => $date,
                'reference' => $invoice->bir_si_or_no ?: $invoice->invoice_no,
                'memo' => "{$invoice->invoice_no} settled by {$collector->name} (customer paid there)",
                'source_type' => 'optical_due_from',
                'source_id' => $invoice->id,
            ], [
                ['account_id' => $rule->debit_account_id, 'debit' => $amount, 'credit' => 0, 'memo' => "Due from {$collector->name}"],
                ['account_id' => $rule->credit_account_id, 'debit' => 0, 'credit' => $amount, 'memo' => 'AR clear', 'partner_type' => Partner::class, 'partner_id' => $invoice->partner_id],
            ]);

            InvoicePayment::query()->create([
                'entity_id' => $invoice->entity_id,
                'invoice_id' => $invoice->id,
                'paid_date' => $date,
                'amount' => $amount,
                'payment_method' => 'intercompany',
                'reference' => 'Collected by '.$collector->name,
                'customer_deposit_id' => $deposit->id,
                'journal_entry_id' => $entry->id,
            ]);
            $this->invoices->recordSettlement($invoice, $amount);

            return $entry;
        });

        return [$collectorEntry->id, $ownerEntry->id];
    }

    /**
     * @param  array<string, mixed>  $line
     */
    protected function lineType(array $line): string
    {
        if ($line['class'] === 'product') {
            return 'product';
        }

        $label = strtolower($line['label']);
        if ($line['class'] === 'workshop') {
            return str_contains($label, 'repair') ? 'repair' : 'edging';
        }

        return str_contains($label, 'eye') || str_contains($label, 'consult') ? 'eye_exam' : 'service';
    }

    protected function shortCode(Entity $entity): string
    {
        return match ($entity->code) {
            'JAM_OPTICUS' => 'JAM',
            'A_JAMORA' => 'AJO',
            'AL_JAMORA' => 'ALJ',
            default => strtoupper(substr($entity->code, 0, 6)),
        };
    }

    protected function adjustPartnerBalance(int $partnerId, float $delta): void
    {
        if (abs($delta) < 0.005) {
            return;
        }

        $balance = PartnerBalance::query()->firstOrCreate(['partner_id' => $partnerId], ['balance' => 0]);
        $balance->update(['balance' => round((float) $balance->balance + $delta, 2)]);
    }

    /**
     * Fingerprint of everything that changes the books. Payment status and paid amounts are left out: payments are
     * booked separately, as deposits.
     *
     * @param  array<string, mixed>  $order
     */
    protected function hash(array $order, Entity $collector): string
    {
        return OpticalDocuments::hash([
            'collector' => $collector->code,
            'completed_on' => $this->router->businessDate($order['completed_at'] ?? null),
            'payable' => round((float) ($order['payable_total'] ?? 0), 2),
            'category' => $order['category'] ?? null,
            'wholesale' => (bool) ($order['is_wholesale_order'] ?? false),
            'customer' => [$order['wholesale_client_id'] ?? null, $order['patient_id'] ?? null, $order['customer_name'] ?? null],
            'document' => [$order['si'] ?? null, $order['or'] ?? null],
            'items' => collect($order['items'] ?? [])->map(fn (array $i) => [
                $i['products_type'] ?? null, $i['products_id'] ?? null, (int) ($i['quantity'] ?? 1),
                round((float) ($i['amount'] ?? 0), 2), round((float) ($i['gross_amount'] ?? 0), 2), round((float) ($i['unit_cost'] ?? 0), 2),
            ])->sort()->values()->all(),
        ]);
    }
}
