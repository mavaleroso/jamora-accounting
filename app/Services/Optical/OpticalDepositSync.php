<?php

namespace App\Services\Optical;

use App\Models\CustomerDeposit;
use App\Models\Entity;
use App\Models\SyncDocument;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Optical order payments → customer deposits of the collecting entity: Dr Cash on Hand / Card Clearing / E-Wallet
 * Clearing, Cr Customer Deposits. The deposit is applied when the order is completed (OpticalSaleSync).
 *
 * Payments made before go-live on orders still open at go-live are carried in at go-live against Opening Balance
 * Equity (the cash itself is part of the opening cash balance). A changed or removed payment reverses its deposit;
 * if the completed sale already used it, the sale is reversed and booked again.
 */
class OpticalDepositSync
{
    public const DOC = 'payment';

    /** optical payment_type => posting rule */
    public const RULES = [
        'cash' => 'deposit_cash',
        'card' => 'deposit_card',
        'e_wallet' => 'deposit_ewallet',
    ];

    public function __construct(
        protected OpticalRouter $router,
        protected OpticalLedger $ledger,
        protected OpticalDocuments $documents,
        protected OpticalSaleSync $sales,
    ) {}

    /**
     * @param  array<string, mixed>  $payment
     * @return array{0: 'posted'|'review'|'skipped'|'reversed', 1: int|null} outcome, and an order id whose sale must be re-read
     */
    public function process(array $payment): array
    {
        $order = $payment['order'] ?? throw new RuntimeException("Payment {$payment['id']} has no order.");
        $collector = $this->router->collectorFor($order);
        $doc = $this->documents->find($collector, self::DOC, $payment['id']);
        $active = empty($payment['deleted_at']) && ($payment['status'] ?? 'paid') === 'paid' && (float) $payment['amount'] > 0;

        if (! $active) {
            if (! empty($doc?->meta)) {
                $resync = DB::transaction(fn () => $this->reverse($doc, $collector, 'Payment removed in the optical POS'));

                return ['reversed', $resync];
            }

            return ['skipped', null];
        }

        $start = $this->router->startDate();
        $paidOn = (string) $payment['paid_date'];
        $completedOn = $this->router->businessDate($order['completed_at'] ?? null);
        $opening = $start !== null && $paidOn < $start;
        $hash = OpticalDocuments::hash([
            'amount' => round((float) $payment['amount'], 2),
            'type' => $payment['payment_type'] ?? null,
            'paid_on' => $paidOn,
            'reference' => $payment['reference_number'] ?? null,
            'order' => $payment['order_id'],
            'collector' => $collector->code,
            'opening' => $opening,
        ]);

        if ($this->documents->isUnchanged($doc, $hash)) {
            return ['skipped', null];
        }

        if ($opening && $completedOn !== null && $completedOn < $start) {
            $this->documents->save($collector, self::DOC, $payment['id'], $hash, $payment, 'skipped', null, "Order completed before go-live ({$start}); part of the opening balances.");

            return ['skipped', null];
        }

        return DB::transaction(function () use ($payment, $order, $collector, $doc, $hash, $opening, $start, $paidOn) {
            $resync = ! empty($doc?->meta) ? $this->reverse($doc, $collector, 'Payment changed in the optical POS') : null;

            [$deposit, $entryId] = $this->ledger->in($collector, fn () => $this->record($payment, $order, $collector, $opening ? $start : $paidOn, $opening));

            $warning = ! empty($order['deleted_at'])
                ? 'The order was deleted in the optical POS; refund or re-apply this deposit.'
                : null;
            $doc = $this->documents->save($collector, self::DOC, $payment['id'], $hash, $payment, $warning ? 'review' : 'posted', [
                'deposit_id' => $deposit->id,
                'journal_entry_ids' => [$entryId],
            ], $warning);

            // A deposit for a sale that is already booked settles it now.
            if ($resync === null && ($sale = $this->documents->find($collector, OpticalSaleSync::DOC, $order['id'])) && ! empty($sale->meta)) {
                $this->sales->settle($sale);
            }

            return [$doc->status === 'review' ? 'review' : 'posted', $resync];
        });
    }

    /**
     * @param  array<string, mixed>  $payment
     * @param  array<string, mixed>  $order
     * @return array{0: CustomerDeposit, 1: int}
     */
    protected function record(array $payment, array $order, Entity $collector, string $date, bool $opening): array
    {
        $type = (string) ($payment['payment_type'] ?? 'cash');
        $rule = $this->ledger->rule($opening ? 'deposit_opening' : (self::RULES[$type] ?? 'deposit_cash'));
        $partner = $this->router->partnerFor($order, $collector);
        $amount = round((float) $payment['amount'], 2);
        $label = (string) (($payment['payment_method'] ?? null) ?: $type);
        $customer = trim((string) ($order['customer_name'] ?? ''));

        $deposit = CustomerDeposit::query()->create([
            'entity_id' => $collector->id,
            'partner_id' => $partner->id,
            'deposit_date' => $date,
            'amount' => $amount,
            'applied_amount' => 0,
            'status' => 'open',
            'payment_method' => $type,
            'reference' => ($payment['reference_number'] ?? null) ?: (string) $order['ts_no'],
            'notes' => trim("Optical POS payment #{$payment['id']} on order {$order['ts_no']} ({$label})".($opening ? ", received {$payment['paid_date']} before go-live" : '')),
            'source_system' => 'optical',
            'source_id' => (string) $payment['id'],
            'external_order_id' => (string) $payment['order_id'],
        ]);

        $entry = $this->ledger->journal('CRJ', [
            'entry_date' => $date,
            'reference' => $deposit->reference,
            'memo' => 'Optical payment — order '.$order['ts_no'].($customer !== '' ? ' — '.$customer : '')." ({$label})",
            'source_type' => 'optical_deposit',
            'source_id' => $deposit->id,
        ], [
            ['account_id' => $rule->debit_account_id, 'debit' => $amount, 'credit' => 0, 'memo' => $opening ? 'Deposit carried in at go-live' : 'Payment received — '.$label],
            ['account_id' => $rule->credit_account_id, 'debit' => 0, 'credit' => $amount, 'memo' => 'Customer deposit'],
        ]);

        $deposit->update(['journal_entry_id' => $entry->id]);

        return [$deposit, $entry->id];
    }

    /**
     * Reverse a payment's deposit. A sale that already used it is reversed too; the order id is returned so the
     * caller re-reads the order and books the sale again with the corrected deposits.
     */
    protected function reverse(SyncDocument $doc, Entity $collector, string $reason): ?int
    {
        $deposit = CustomerDeposit::query()->withoutGlobalScope('entity')->find($doc->meta['deposit_id'] ?? 0);
        $resync = null;

        if ($deposit && (float) $deposit->applied_amount > 0) {
            $sale = $this->documents->find($collector, OpticalSaleSync::DOC, $deposit->external_order_id);
            if ($sale && ! empty($sale->meta)) {
                $this->sales->reverse($sale, $reason);
                $resync = (int) $deposit->external_order_id;
            }
        }

        $this->ledger->reverse($doc->meta['journal_entry_ids'] ?? [], 'Reversal: '.$reason);
        $deposit?->refresh()->update(['status' => 'void', 'notes' => trim(($deposit->notes ?? '')."\nVoided: {$reason}")]);

        $doc->update(['meta' => null, 'status' => 'reversed', 'journal_entry_id' => null, 'error' => $reason]);

        return $resync;
    }
}
