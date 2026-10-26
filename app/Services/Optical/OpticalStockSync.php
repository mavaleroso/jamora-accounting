<?php

namespace App\Services\Optical;

use App\Models\Entity;
use App\Models\InventoryMovement;
use App\Models\SyncDocument;
use Illuminate\Support\Facades\DB;

/**
 * Optical stock events → the product entity's inventory accounts, at decoded unit cost.
 *
 *  delivery receipt   Dr Inventory                      Cr Goods Received Not Billed   (cleared by the supplier's bill)
 *  returned           Dr Goods Received Not Billed      Cr Inventory                   (review: match the credit memo)
 *  defective/expired  Dr Inventory Losses / Write-offs  Cr Inventory                   (review)
 *  sold, no order     Dr Cost of Goods Sold             Cr Inventory                   (review: no sale recorded)
 *
 * Items sold through an order get their cost of goods sold with the sale (OpticalSaleSync). Releases to a branch
 * stay within the same entity's stock and post nothing.
 */
class OpticalStockSync
{
    public const RECEIPT_DOC = 'stock_receipt';

    public const MOVEMENT_DOC = 'stock_movement';

    /** event => [posting rule, movement type, quantity sign, accounting link, note] */
    protected const EVENTS = [
        'defective' => ['inventory_writeoff', 'write_off', -1, 'inventory_loss', 'Tagged defective in the optical POS.'],
        'expired' => ['inventory_writeoff', 'write_off', -1, 'inventory_loss', 'Tagged expired in the optical POS.'],
        'returned' => ['inventory_return', 'return', -1, 'ap_receipt', 'Returned to the supplier — match the supplier credit memo.'],
        'sold' => ['cogs', 'sales_issue', -1, 'cogs', 'Tagged sold without an optical order — no sale is recorded for it.'],
    ];

    public function __construct(
        protected OpticalRouter $router,
        protected OpticalLedger $ledger,
        protected OpticalDocuments $documents,
    ) {}

    /**
     * @param  array<string, mixed>  $receipt
     * @return 'posted'|'review'|'skipped'
     */
    public function receipt(array $receipt): string
    {
        $entity = $this->router->productEntity();
        $doc = $this->documents->find($entity, self::RECEIPT_DOC, $receipt['key']);
        $receivedOn = substr((string) $receipt['received_at'], 0, 10);
        $total = round((float) $receipt['total_cost'], 2);
        $overcost = (int) ($receipt['overcost_count'] ?? 0);
        $hash = OpticalDocuments::hash([
            'items' => (int) $receipt['item_count'],
            'uncosted' => (int) ($receipt['uncosted_count'] ?? 0),
            'overcost' => $overcost,
            'total' => $total,
            'on' => $receivedOn,
            'supplier' => $receipt['supplier'] ?? null,
        ]);

        if ($this->documents->isUnchanged($doc, $hash)) {
            return 'skipped';
        }

        $start = $this->router->startDate();
        if ($start !== null && $receivedOn < $start) {
            $this->documents->save($entity, self::RECEIPT_DOC, $receipt['key'], $hash, $receipt, 'skipped', null, "Received before go-live ({$start}); part of opening inventory.");

            return 'skipped';
        }

        if ($receivedOn > $this->today()) {
            return $this->hold($entity, self::RECEIPT_DOC, $receipt['key'], $doc, $hash, $receipt, "Received on {$receivedOn}, a date still to come: fix the date in the optical POS. Nothing was booked.");
        }

        // Items costed above their selling price (a cost code keyed without its ".") are left out, like uncosted ones.
        $total = round($total - (float) ($receipt['overcost_cost'] ?? 0), 2);

        return DB::transaction(function () use ($receipt, $entity, $doc, $hash, $receivedOn, $total, $overcost) {
            $this->reverse($doc, 'Delivery '.$receipt['delivery_receipt'].' changed in the optical POS');

            $supplier = $receipt['supplier'] ?? null;
            $vendor = $this->router->vendorFor($supplier, $receipt['supplier_id'] ?? null);
            $count = (int) $receipt['item_count'];
            $uncosted = (int) ($receipt['uncosted_count'] ?? 0);
            $notes = array_values(array_filter([
                $uncosted > 0 ? "{$uncosted} of {$count} items have no decodable cost and were booked at zero." : null,
                $overcost > 0 ? "{$overcost} of {$count} items cost more than their selling price in the optical POS (check the cost code for a missing \".\") and were booked at zero." : null,
            ]));
            $warning = match (true) {
                $total <= 0 && $overcost === 0 => 'No item on this delivery has a decodable cost; nothing was booked.',
                $notes === [] => null,
                default => implode(' ', $notes).($total <= 0 ? ' Nothing was booked.' : ''),
            };

            $meta = $this->ledger->in($entity, function () use ($receipt, $entity, $vendor, $supplier, $count, $total, $receivedOn, $warning) {
                $movement = InventoryMovement::query()->create([
                    'entity_id' => $entity->id,
                    'movement_reference' => (string) $receipt['delivery_receipt'],
                    'movement_type' => 'receipt',
                    'quantity' => $count,
                    'unit_cost' => $count > 0 ? round($total / $count, 2) : 0,
                    'total_cost' => $total,
                    'accounting_link_type' => 'ap_receipt',
                    'review_status' => $warning ? 'needs_review' : 'matched',
                    'notes' => $warning,
                    'source_system' => 'optical',
                    'source_ref' => 'receipt:'.$receipt['key'],
                    'description' => $this->receiptDescription($receipt),
                    'counterparty' => $supplier ? mb_substr($supplier, 0, 250) : null,
                    'occurred_on' => $receivedOn,
                ]);

                $journalIds = [];
                if ($total > 0) {
                    $rule = $this->ledger->rule('inventory_receipt');
                    $entry = $this->ledger->journal('PJ', [
                        'entry_date' => $receivedOn,
                        'reference' => (string) $receipt['delivery_receipt'],
                        'memo' => 'Delivery '.$receipt['delivery_receipt'].($supplier ? ' from '.$supplier : '')." — {$count} item(s)",
                        'source_type' => 'optical_stock',
                        'source_id' => $movement->id,
                    ], [
                        ['account_id' => $rule->debit_account_id, 'debit' => $total, 'credit' => 0, 'memo' => 'Inventory received'],
                        ['account_id' => $rule->credit_account_id, 'debit' => 0, 'credit' => $total, 'memo' => 'Goods received not billed'.($supplier ? ' — '.$supplier : '')],
                    ]);
                    $movement->update(['journal_entry_id' => $entry->id]);
                    $journalIds[] = $entry->id;
                }

                return ['journal_entry_ids' => $journalIds, 'movement_ids' => [$movement->id], 'vendor_id' => $vendor?->id];
            });

            $status = $warning ? 'review' : 'posted';
            $this->documents->save($entity, self::RECEIPT_DOC, $receipt['key'], $hash, $receipt, $status, $meta, $warning);

            return $status;
        });
    }

    /**
     * @param  array<string, mixed>  $movement
     * @return 'posted'|'review'|'skipped'
     */
    public function movement(array $movement): string
    {
        $event = (string) ($movement['event_type'] ?? '');

        // Receipts come from the receipts feed; order sales carry their own cost; branch releases post nothing.
        if (! isset(self::EVENTS[$event]) || ($event === 'sold' && ! empty($movement['order_id']))) {
            return 'skipped';
        }

        $entity = $this->router->productEntity();
        $key = "{$movement['stock_type']}:{$movement['id']}:{$event}";
        $doc = $this->documents->find($entity, self::MOVEMENT_DOC, $key);
        $occurredOn = substr((string) $movement['occurred_at'], 0, 10);
        $quantity = max(1, (int) ($movement['quantity'] ?? 1));
        $unitCost = (float) ($movement['unit_cost'] ?? 0);
        $price = (float) ($movement['price'] ?? 0);
        $overcost = $price > 0 && $unitCost > $price;
        $cost = $overcost ? 0.0 : round($unitCost * $quantity, 2);
        $hash = OpticalDocuments::hash(['event' => $event, 'cost' => $cost, 'on' => $occurredOn, 'overcost' => $overcost]);

        if ($this->documents->isUnchanged($doc, $hash)) {
            return 'skipped';
        }

        $start = $this->router->startDate();
        if ($start !== null && $occurredOn < $start) {
            $this->documents->save($entity, self::MOVEMENT_DOC, $key, $hash, $movement, 'skipped', null, "Before go-live ({$start}).");

            return 'skipped';
        }

        if ($occurredOn > $this->today()) {
            return $this->hold($entity, self::MOVEMENT_DOC, $key, $doc, $hash, $movement, "Dated {$occurredOn}, a date still to come: fix the date in the optical POS. Nothing was booked.");
        }

        [$ruleEvent, $type, $sign, $link, $note] = self::EVENTS[$event];

        return DB::transaction(function () use ($movement, $entity, $doc, $key, $hash, $occurredOn, $quantity, $cost, $ruleEvent, $type, $sign, $link, $note, $event, $overcost, $unitCost, $price) {
            $this->reverse($doc, 'Stock item changed in the optical POS');

            $label = trim(implode(' — ', array_filter([$movement['brand'] ?? null, $movement['description'] ?? null, $movement['code'] ?? null])));
            $warning = match (true) {
                $overcost => $note.' Its cost (₱'.number_format($unitCost, 2).') is above its selling price (₱'.number_format($price, 2).') in the optical POS — check the cost code for a missing "." — so nothing was booked.',
                $cost > 0 => $note,
                default => $note.' No decodable cost; nothing was booked.',
            };

            $meta = $this->ledger->in($entity, function () use ($movement, $entity, $key, $occurredOn, $quantity, $cost, $ruleEvent, $type, $sign, $link, $label, $warning, $event) {
                $record = InventoryMovement::query()->create([
                    'entity_id' => $entity->id,
                    'movement_reference' => (string) (($movement['code'] ?? null) ?: $key),
                    'movement_type' => $type,
                    'quantity' => $sign * $quantity,
                    'unit_cost' => $cost > 0 ? round((float) ($movement['unit_cost'] ?? 0), 2) : 0,
                    'total_cost' => $cost,
                    'accounting_link_type' => $link,
                    'review_status' => 'needs_review',
                    'notes' => $warning,
                    'source_system' => 'optical',
                    'source_ref' => $key,
                    'stock_type' => $movement['stock_type'] ?? null,
                    'product_code' => $movement['code'] ?? null,
                    'description' => $label !== '' ? mb_substr($label, 0, 250) : null,
                    'counterparty' => ($movement['supplier'] ?? null) ? mb_substr((string) $movement['supplier'], 0, 250) : null,
                    'occurred_on' => $occurredOn,
                ]);

                $journalIds = [];
                if ($cost > 0) {
                    $rule = $this->ledger->rule($ruleEvent);
                    $entry = $this->ledger->journal('GJ', [
                        'entry_date' => $occurredOn,
                        'reference' => $movement['code'] ?? $key,
                        'memo' => ucfirst($event).' stock — '.($label !== '' ? $label : $key),
                        'source_type' => 'optical_stock',
                        'source_id' => $record->id,
                    ], [
                        ['account_id' => $rule->debit_account_id, 'debit' => $cost, 'credit' => 0, 'memo' => ucfirst($event).' stock'],
                        ['account_id' => $rule->credit_account_id, 'debit' => 0, 'credit' => $cost, 'memo' => 'Inventory'],
                    ]);
                    $record->update(['journal_entry_id' => $entry->id]);
                    $journalIds[] = $entry->id;
                }

                return ['journal_entry_ids' => $journalIds, 'movement_ids' => [$record->id]];
            });

            $this->documents->save($entity, self::MOVEMENT_DOC, $key, $hash, $movement, 'review', $meta, $warning);

            return 'review';
        });
    }

    /**
     * Book nothing and leave the document for review, taking back whatever an earlier version of it booked.
     *
     * @param  array<string, mixed>  $payload
     */
    protected function hold(Entity $entity, string $type, string $key, ?SyncDocument $doc, string $hash, array $payload, string $reason): string
    {
        return DB::transaction(function () use ($entity, $type, $key, $doc, $hash, $payload, $reason) {
            $this->reverse($doc, 'Stock document changed in the optical POS');
            $this->documents->save($entity, $type, $key, $hash, $payload, 'review', null, $reason);

            return 'review';
        });
    }

    protected function today(): string
    {
        return now('Asia/Manila')->toDateString();
    }

    protected function reverse(?SyncDocument $doc, string $reason): void
    {
        if (empty($doc?->meta)) {
            return;
        }

        $this->ledger->reverse($doc->meta['journal_entry_ids'] ?? [], 'Reversal: '.$reason);
        InventoryMovement::query()->withoutGlobalScope('entity')->whereIn('id', $doc->meta['movement_ids'] ?? [])->update(['review_status' => 'reversed']);
        $doc->update(['meta' => null, 'status' => 'reversed', 'journal_entry_id' => null]);
    }

    /**
     * @param  array<string, mixed>  $receipt
     */
    protected function receiptDescription(array $receipt): string
    {
        $parts = collect($receipt['by_type'] ?? [])
            ->map(fn (array $t, string $type) => ((int) $t['count']).' '.$type.((int) $t['count'] === 1 ? '' : 's'))
            ->values()
            ->all();

        return 'Delivery '.$receipt['delivery_receipt'].($parts !== [] ? ': '.implode(', ', $parts) : '');
    }
}
