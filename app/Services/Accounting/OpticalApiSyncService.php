<?php

namespace App\Services\Accounting;

use App\Models\Entity;
use App\Models\Journal;
use App\Models\Partner;
use App\Models\PartnerBalance;
use App\Models\PostingRule;
use App\Models\SyncDocument;
use App\Models\SyncRun;
use App\Models\User;
use App\Services\Optical\OpticalApiClient;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

class OpticalApiSyncService
{
    /** @var Collection<string, PostingRule> */
    protected Collection $postingRules;

    public function __construct(
        protected JournalPostingService $journalPostingService,
        protected OpticalApiClient $apiClient,
        protected EntityContext $entityContext,
    ) {}

    public function sync(?Carbon $from = null, ?Carbon $to = null, ?User $triggeredBy = null): SyncRun
    {
        $entity = $this->entityContext->current();
        $run = SyncRun::query()->create([
            'entity_id' => $entity?->id,
            'started_at' => now(),
            'status' => 'running',
            'from_date' => $from?->toDateString(),
            'to_date' => $to?->toDateString(),
            'triggered_by' => $triggeredBy?->id,
        ]);

        try {
            $this->loadPostingRules();
            $this->syncOrdersFromApi($run, $from, $to);
            $this->syncPaymentsFromApi($run, $from, $to);
            $this->syncCogsFromApi($run, $from, $to);

            $run->refresh();
            $run->update([
                'finished_at' => now(),
                'status' => $run->failed > 0 ? 'completed_with_errors' : 'completed',
                'message' => "Processed {$run->processed} documents via API.",
            ]);
        } catch (\Throwable $e) {
            Log::error('Optical API sync failed', ['error' => $e->getMessage()]);
            $run->update([
                'finished_at' => now(),
                'status' => 'failed',
                'message' => $e->getMessage(),
            ]);
        }

        return $run->fresh();
    }

    protected function syncOrdersFromApi(SyncRun $run, ?Carbon $from, ?Carbon $to): void
    {
        $entity = $this->entityContext->current();
        $page = 1;

        do {
            $response = $this->apiClient->orders(array_filter([
                'from' => $from?->toDateString(),
                'to' => $to?->toDateString(),
                'page' => $page,
                'page_size' => 100,
            ]));

            $orders = $response['data'] ?? $response;
            if (! is_array($orders)) {
                break;
            }

            foreach ($orders as $order) {
                if (($order['accounting_entity_code'] ?? null) !== $entity?->code) {
                    continue;
                }
                $this->processApiOrder($order, $run);
            }

            $lastPage = (int) ($response['meta']['last_page'] ?? $page);
            $page++;
        } while ($page <= $lastPage);
    }

    protected function syncPaymentsFromApi(SyncRun $run, ?Carbon $from, ?Carbon $to): void
    {
        $entity = $this->entityContext->current();
        $page = 1;

        do {
            $response = $this->apiClient->payments(array_filter([
                'from' => $from?->toDateString(),
                'to' => $to?->toDateString(),
                'page' => $page,
                'page_size' => 100,
            ]));

            $payments = $response['data'] ?? $response;
            if (! is_array($payments)) {
                break;
            }

            foreach ($payments as $payment) {
                if (($payment['accounting_entity_code'] ?? null) !== $entity?->code) {
                    continue;
                }
                $this->processApiPayment($payment, $run);
            }

            $lastPage = (int) ($response['meta']['last_page'] ?? $page);
            $page++;
        } while ($page <= $lastPage);
    }

    protected function syncCogsFromApi(SyncRun $run, ?Carbon $from, ?Carbon $to): void
    {
        $entity = $this->entityContext->current();
        if ($entity?->code !== 'JAM_OPTICUS') {
            return;
        }

        $response = $this->apiClient->inventoryMovements(array_filter([
            'event_type' => 'sold',
            'from' => $from?->toDateString(),
            'to' => $to?->toDateString(),
            'page_size' => 200,
        ]));

        $movements = $response['data'] ?? [];
        $cogsRule = $this->postingRules->get('cogs');
        if (! $cogsRule || ! is_array($movements)) {
            return;
        }

        foreach ($movements as $movement) {
            $run->increment('processed');
            $sourceId = (string) ($movement['id'] ?? '');
            $hash = hash('sha256', json_encode($movement));

            $existing = SyncDocument::query()
                ->where('source_system', 'optical')
                ->where('source_type', 'inventory_cogs')
                ->where('source_id', $sourceId)
                ->first();

            if ($existing && $existing->payload_hash === $hash && in_array($existing->status, ['posted', 'pending'], true)) {
                $run->increment('skipped');
                continue;
            }

            try {
                $amount = round((float) ($movement['cost'] ?? $movement['item_cost'] ?? 0), 2);
                if ($amount <= 0) {
                    $run->increment('skipped');
                    continue;
                }

                $journal = Journal::query()->where('code', 'GJ')->firstOrFail();
                $entry = $this->journalPostingService->create([
                    'journal_id' => $journal->id,
                    'entry_date' => $movement['event_date'] ?? now()->toDateString(),
                    'reference' => $movement['delivery_receipt'] ?? $sourceId,
                    'memo' => 'COGS '.$sourceId,
                    'source_system' => 'optical',
                    'source_type' => 'inventory_cogs',
                    'source_id' => $sourceId,
                ], [
                    [
                        'account_id' => $cogsRule->debit_account_id,
                        'debit' => $amount,
                        'credit' => 0,
                        'memo' => 'COGS',
                    ],
                    [
                        'account_id' => $cogsRule->credit_account_id,
                        'debit' => 0,
                        'credit' => $amount,
                        'memo' => 'Inventory',
                    ],
                ]);

                SyncDocument::query()->updateOrCreate(
                    [
                        'entity_id' => $entity->id,
                        'source_system' => 'optical',
                        'source_type' => 'inventory_cogs',
                        'source_id' => $sourceId,
                    ],
                    [
                        'payload_hash' => $hash,
                        'journal_entry_id' => $entry->id,
                        'status' => 'posted',
                        'error' => null,
                        'synced_at' => now(),
                    ]
                );
                $run->increment('created_entries');
            } catch (\Throwable $e) {
                $run->increment('failed');
                SyncDocument::query()->updateOrCreate(
                    [
                        'entity_id' => $entity->id,
                        'source_system' => 'optical',
                        'source_type' => 'inventory_cogs',
                        'source_id' => $sourceId,
                    ],
                    [
                        'payload_hash' => $hash,
                        'status' => 'failed',
                        'error' => $e->getMessage(),
                        'synced_at' => now(),
                    ]
                );
            }
        }
    }

    protected function processApiOrder(array $order, SyncRun $run): void
    {
        $run->increment('processed');
        $sourceId = (string) ($order['id'] ?? '');
        $hash = hash('sha256', json_encode($order));

        $existing = SyncDocument::query()
            ->where('source_system', 'optical')
            ->where('source_type', 'order')
            ->where('source_id', $sourceId)
            ->first();

        if ($existing && $existing->payload_hash === $hash && in_array($existing->status, ['posted', 'pending'], true)) {
            $run->increment('skipped');

            return;
        }

        try {
            $gross = round((float) ($order['total_amount'] ?? $order['ordered_amount'] ?? 0), 2);
            if ($gross <= 0) {
                $run->increment('skipped');

                return;
            }

            $vatRate = (float) config('accounting.vat_rate', 0.12);
            $vat = round((float) ($order['vat'] ?? ($gross * $vatRate / (1 + $vatRate))), 2);
            $discount = round((float) ($order['doctors_discount_amount'] ?? 0), 2);
            $netSales = max(0, $gross - $vat - $discount);

            $partner = $this->upsertPartnerFromOrder($order);

            $lines = [];
            $ar = $this->postingRules->get('ar');
            $revenue = $this->postingRules->get('sales_revenue');
            $outputVat = $this->postingRules->get('output_vat');
            $salesDiscount = $this->postingRules->get('sales_discount');

            if ($ar) {
                $lines[] = [
                    'account_id' => $ar->debit_account_id,
                    'debit' => $gross - $discount,
                    'credit' => 0,
                    'memo' => 'AR',
                    'partner_type' => Partner::class,
                    'partner_id' => $partner?->id,
                ];
            }
            if ($revenue && $netSales > 0) {
                $lines[] = [
                    'account_id' => $revenue->credit_account_id,
                    'debit' => 0,
                    'credit' => $netSales,
                    'memo' => 'Sales',
                ];
            }
            if ($outputVat && $vat > 0) {
                $lines[] = [
                    'account_id' => $outputVat->credit_account_id,
                    'debit' => 0,
                    'credit' => $vat,
                    'memo' => 'Output VAT',
                ];
            }
            if ($salesDiscount && $discount > 0) {
                $lines[] = [
                    'account_id' => $salesDiscount->debit_account_id,
                    'debit' => $discount,
                    'credit' => 0,
                    'memo' => 'Discount',
                ];
            }

            $debit = collect($lines)->sum('debit');
            $credit = collect($lines)->sum('credit');
            if (abs($debit - $credit) > 0.01 && $lines !== []) {
                $lines[0]['debit'] = $credit;
            }

            $journal = Journal::query()->where('code', 'SJ')->firstOrFail();
            $entry = $this->journalPostingService->create([
                'journal_id' => $journal->id,
                'entry_date' => $order['completed'] ?? $order['completed_at'] ?? now()->toDateString(),
                'reference' => $order['si'] ?? $order['or'] ?? $order['ts_no'] ?? $sourceId,
                'memo' => 'Optical order '.$sourceId,
                'source_system' => 'optical',
                'source_type' => 'order',
                'source_id' => $sourceId,
            ], $lines);

            if ($partner) {
                PartnerBalance::query()->firstOrCreate(['partner_id' => $partner->id], ['balance' => 0]);
                PartnerBalance::query()->where('partner_id', $partner->id)->increment('balance', $gross - $discount);
            }

            SyncDocument::query()->updateOrCreate(
                [
                    'entity_id' => $this->entityContext->id(),
                    'source_system' => 'optical',
                    'source_type' => 'order',
                    'source_id' => $sourceId,
                ],
                [
                    'payload_hash' => $hash,
                    'journal_entry_id' => $entry->id,
                    'status' => 'posted',
                    'error' => null,
                    'synced_at' => now(),
                ]
            );
            $run->increment('created_entries');
        } catch (\Throwable $e) {
            $run->increment('failed');
            SyncDocument::query()->updateOrCreate(
                [
                    'entity_id' => $this->entityContext->id(),
                    'source_system' => 'optical',
                    'source_type' => 'order',
                    'source_id' => $sourceId,
                ],
                [
                    'payload_hash' => $hash,
                    'status' => 'failed',
                    'error' => $e->getMessage(),
                    'synced_at' => now(),
                ]
            );
        }
    }

    protected function processApiPayment(array $payment, SyncRun $run): void
    {
        $run->increment('processed');
        $sourceId = (string) ($payment['id'] ?? '');
        $hash = hash('sha256', json_encode($payment));

        $existing = SyncDocument::query()
            ->where('source_system', 'optical')
            ->where('source_type', 'order_payment')
            ->where('source_id', $sourceId)
            ->first();

        if ($existing && $existing->payload_hash === $hash && in_array($existing->status, ['posted', 'pending'], true)) {
            $run->increment('skipped');

            return;
        }

        try {
            $amount = round((float) ($payment['amount'] ?? 0), 2);
            if ($amount <= 0) {
                $run->increment('skipped');

                return;
            }

            $method = strtolower((string) ($payment['payment_method'] ?? 'cash'));
            $ruleKey = str_contains($method, 'card') || str_contains($method, 'gcash') || str_contains($method, 'wallet')
                ? 'collection_card'
                : 'collection_cash';
            $rule = $this->postingRules->get($ruleKey) ?? $this->postingRules->get('collection_cash');
            if (! $rule) {
                throw new \RuntimeException('Missing collection posting rule.');
            }

            $journal = Journal::query()->where('code', 'CRJ')->firstOrFail();
            $entry = $this->journalPostingService->create([
                'journal_id' => $journal->id,
                'entry_date' => $payment['paid_date'] ?? now()->toDateString(),
                'reference' => $payment['reference_number'] ?? $sourceId,
                'memo' => 'Optical payment '.$sourceId,
                'source_system' => 'optical',
                'source_type' => 'order_payment',
                'source_id' => $sourceId,
            ], [
                [
                    'account_id' => $rule->debit_account_id,
                    'debit' => $amount,
                    'credit' => 0,
                    'memo' => 'Collection',
                ],
                [
                    'account_id' => $rule->credit_account_id,
                    'debit' => 0,
                    'credit' => $amount,
                    'memo' => 'AR clear',
                ],
            ]);

            SyncDocument::query()->updateOrCreate(
                [
                    'entity_id' => $this->entityContext->id(),
                    'source_system' => 'optical',
                    'source_type' => 'order_payment',
                    'source_id' => $sourceId,
                ],
                [
                    'payload_hash' => $hash,
                    'journal_entry_id' => $entry->id,
                    'status' => 'posted',
                    'error' => null,
                    'synced_at' => now(),
                ]
            );
            $run->increment('created_entries');
        } catch (\Throwable $e) {
            $run->increment('failed');
            SyncDocument::query()->updateOrCreate(
                [
                    'entity_id' => $this->entityContext->id(),
                    'source_system' => 'optical',
                    'source_type' => 'order_payment',
                    'source_id' => $sourceId,
                ],
                [
                    'payload_hash' => $hash,
                    'status' => 'failed',
                    'error' => $e->getMessage(),
                    'synced_at' => now(),
                ]
            );
        }
    }

    protected function upsertPartnerFromOrder(array $order): ?Partner
    {
        $name = $order['wholesale_client_name']
            ?? $order['patient_name']
            ?? $order['client_name']
            ?? 'Optical Customer '.$order['id'];

        $code = 'OPT-'.($order['client_id'] ?? $order['patient_id'] ?? $order['id']);

        return Partner::query()->updateOrCreate(
            [
                'entity_id' => $this->entityContext->id(),
                'code' => $code,
            ],
            [
                'name' => $name,
                'type' => ! empty($order['is_wholesale_order']) ? 'wholesale' : 'patient',
                'external_source' => 'optical',
                'external_id' => (string) ($order['client_id'] ?? $order['patient_id'] ?? $order['id']),
                'is_active' => true,
            ]
        );
    }

    protected function loadPostingRules(): void
    {
        $this->postingRules = PostingRule::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->keyBy('event');
    }
}
