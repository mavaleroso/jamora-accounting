<?php

namespace App\Services\Accounting;

use App\Models\CostCenter;
use App\Models\Journal;
use App\Models\Optical\Order;
use App\Models\Optical\OrderPayment;
use App\Models\Partner;
use App\Models\PartnerBalance;
use App\Models\PostingRule;
use App\Models\SyncDocument;
use App\Models\SyncRun;
use App\Models\User;
use App\Support\EntityContext;
use App\Support\OpticalEntityMapper;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class OpticalSyncService
{
    /** @var Collection<string, PostingRule> */
    protected Collection $postingRules;

    /** @var Collection<string, CostCenter> */
    protected Collection $costCenters;

    public function __construct(
        protected JournalPostingService $journalPostingService,
        protected EntityContext $entityContext,
    ) {}

    public function sync(?Carbon $from = null, ?Carbon $to = null, ?User $triggeredBy = null): SyncRun
    {
        $run = SyncRun::create([
            'entity_id' => $this->entityContext->id(),
            'started_at' => now(),
            'status' => 'running',
            'from_date' => $from?->toDateString(),
            'to_date' => $to?->toDateString(),
            'triggered_by' => $triggeredBy?->id,
        ]);

        $this->loadPostingRules();
        $this->loadCostCenters();

        try {
            $this->syncOrders($run, $from, $to);
            $this->syncPayments($run, $from, $to);
            $this->syncCogsFromInventory($run, $from, $to);

            $run->refresh();

            $run->update([
                'finished_at' => now(),
                'status' => $run->failed > 0 ? 'completed_with_errors' : 'completed',
                'message' => "Processed {$run->processed} documents from optical database.",
            ]);
        } catch (\Throwable $e) {
            Log::error('Optical sync failed', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);

            $run->update([
                'finished_at' => now(),
                'status' => 'failed',
                'message' => $e->getMessage(),
            ]);
        }

        return $run->fresh();
    }

    public function retrySyncDocument(SyncDocument $document, ?User $triggeredBy = null): SyncDocument
    {
        $this->loadPostingRules();
        $this->loadCostCenters();

        $run = SyncRun::create([
            'entity_id' => $this->entityContext->id(),
            'started_at' => now(),
            'status' => 'running',
            'triggered_by' => $triggeredBy?->id,
        ]);

        try {
            if ($document->source_type === 'order') {
                $order = Order::query()->find($document->source_id);
                if (! $order) {
                    throw new \RuntimeException("Optical order {$document->source_id} not found.");
                }
                $this->processOrder($order, $run, force: true);
            } elseif ($document->source_type === 'order_payment') {
                $payment = OrderPayment::query()->find($document->source_id);
                if (! $payment) {
                    throw new \RuntimeException("Optical payment {$document->source_id} not found.");
                }
                $this->processPayment($payment, $run, force: true);
            } else {
                throw new \RuntimeException("Unknown source type: {$document->source_type}");
            }

            $run->update([
                'finished_at' => now(),
                'status' => 'completed',
                'message' => 'Retry completed.',
            ]);
        } catch (\Throwable $e) {
            $run->update([
                'finished_at' => now(),
                'status' => 'failed',
                'failed' => 1,
                'message' => $e->getMessage(),
            ]);

            $document->update([
                'status' => 'failed',
                'error' => $e->getMessage(),
            ]);
        }

        return $document->fresh(['journalEntry']);
    }

    protected function syncOrders(SyncRun $run, ?Carbon $from, ?Carbon $to): void
    {
        $query = Order::query()->whereNotNull('completed');
        $this->applyEntityOrderFilter($query);

        if ($from) {
            $query->where(function ($q) use ($from) {
                $q->whereDate('completed', '>=', $from)
                    ->orWhereDate('created_at', '>=', $from);
            });
        }

        if ($to) {
            $query->where(function ($q) use ($to) {
                $q->whereDate('completed', '<=', $to)
                    ->orWhereDate('created_at', '<=', $to);
            });
        }

        $query->orderBy('id')->chunk(100, function ($orders) use ($run) {
            foreach ($orders as $order) {
                if (! OpticalEntityMapper::matchesCurrentEntity($order)) {
                    continue;
                }
                $this->processOrder($order, $run);
            }
        });
    }

    protected function syncPayments(SyncRun $run, ?Carbon $from, ?Carbon $to): void
    {
        $query = OrderPayment::query()
            ->with('order')
            ->where('status', 'paid')
            ->whereHas('order', function ($q) {
                $q->whereNotNull('completed');
                $this->applyEntityOrderFilter($q);
            });

        if ($from) {
            $query->where(function ($q) use ($from) {
                $q->whereDate('paid_date', '>=', $from)
                    ->orWhereDate('created_at', '>=', $from);
            });
        }

        if ($to) {
            $query->where(function ($q) use ($to) {
                $q->whereDate('paid_date', '<=', $to)
                    ->orWhereDate('created_at', '<=', $to);
            });
        }

        $query->orderBy('id')->chunk(100, function ($payments) use ($run) {
            foreach ($payments as $payment) {
                $order = $payment->order;
                if (! $order || ! OpticalEntityMapper::matchesCurrentEntity($order)) {
                    continue;
                }
                $this->processPayment($payment, $run);
            }
        });
    }

    protected function syncCogsFromInventory(SyncRun $run, ?Carbon $from, ?Carbon $to): void
    {
        $entity = $this->entityContext->current();
        if (! $entity || $entity->code !== OpticalEntityMapper::JAM_OPTICUS) {
            return;
        }

        $cogsRule = $this->postingRules->get('cogs');
        if (! $cogsRule) {
            return;
        }

        foreach (['frames', 'lens', 'accessories', 'solutions'] as $table) {
            if (! Schema::connection('optical')->hasTable($table)) {
                continue;
            }

            $query = DB::connection('optical')->table($table)->whereNotNull('is_sold');

            if ($from) {
                $query->whereDate('is_sold', '>=', $from);
            }
            if ($to) {
                $query->whereDate('is_sold', '<=', $to);
            }

            $query->orderBy('id')->chunkById(100, function ($items) use ($run, $table, $cogsRule) {
                foreach ($items as $item) {
                    $this->processSoldInventoryRow($item, $table, $cogsRule, $run);
                }
            });
        }
    }

    protected function processSoldInventoryRow(object $item, string $table, PostingRule $cogsRule, SyncRun $run): void
    {
        $run->increment('processed');
        $sourceId = "{$table}:{$item->id}";
        $cost = $this->resolveInventoryCostFromRow($item);
        $soldAt = $item->is_sold ?? null;
        $payloadHash = hash('sha256', json_encode([
            'table' => $table,
            'id' => $item->id,
            'cost' => $cost,
            'is_sold' => $soldAt,
            'item_cost_code' => $item->item_cost_code ?? null,
        ]));

        $existing = SyncDocument::query()
            ->where('source_system', 'optical')
            ->where('source_type', 'inventory_cogs')
            ->where('source_id', $sourceId)
            ->first();

        if ($existing && $existing->payload_hash === $payloadHash && in_array($existing->status, ['posted', 'pending'], true)) {
            $run->increment('skipped');

            return;
        }

        if ($cost <= 0) {
            $run->increment('skipped');
            $this->upsertSyncDocument([
                'source_type' => 'inventory_cogs',
                'source_id' => $sourceId,
                'payload_hash' => $payloadHash,
                'journal_entry_id' => null,
                'status' => 'skipped',
                'error' => 'No resolvable inventory cost.',
            ]);

            return;
        }

        try {
            $journal = Journal::query()->where('code', 'GJ')->firstOrFail();
            $entryDate = $soldAt ? Carbon::parse($soldAt)->toDateString() : now()->toDateString();
            $entry = $this->journalPostingService->create([
                'journal_id' => $journal->id,
                'entry_date' => $entryDate,
                'reference' => $item->delivery_receipt ?? $sourceId,
                'memo' => "COGS {$table} #{$item->id}",
                'source_system' => 'optical',
                'source_type' => 'inventory_cogs',
                'source_id' => $sourceId,
            ], [
                [
                    'account_id' => $cogsRule->debit_account_id,
                    'debit' => $cost,
                    'credit' => 0,
                    'memo' => 'COGS',
                ],
                [
                    'account_id' => $cogsRule->credit_account_id,
                    'debit' => 0,
                    'credit' => $cost,
                    'memo' => 'Inventory',
                ],
            ]);

            $this->upsertSyncDocument([
                'source_type' => 'inventory_cogs',
                'source_id' => $sourceId,
                'payload_hash' => $payloadHash,
                'journal_entry_id' => $entry->id,
                'status' => 'posted',
                'error' => null,
            ]);
            $run->increment('created_entries');
        } catch (\Throwable $e) {
            $run->increment('failed');
            $this->upsertSyncDocument([
                'source_type' => 'inventory_cogs',
                'source_id' => $sourceId,
                'payload_hash' => $payloadHash,
                'journal_entry_id' => null,
                'status' => 'failed',
                'error' => $e->getMessage(),
            ]);
        }
    }

    protected function resolveInventoryCostFromRow(object $item): float
    {
        foreach (['wholesale', 'item_cost_code', 'price'] as $field) {
            $raw = $item->{$field} ?? null;
            if ($raw === null || $raw === '') {
                continue;
            }
            if (is_numeric($raw)) {
                return round((float) $raw, 2);
            }
        }

        return 0.0;
    }

    protected function applyEntityOrderFilter($query): void
    {
        $entity = $this->entityContext->current();
        if (! $entity) {
            return;
        }

        match ($entity->code) {
            OpticalEntityMapper::JAM_OPTICUS => $query->where('is_wholesale_order', true),
            OpticalEntityMapper::AL_JAMORA => $query
                ->where(function ($q) {
                    $q->where('is_wholesale_order', false)->orWhereNull('is_wholesale_order');
                })
                ->where(function ($q) {
                    $q->whereRaw('LOWER(TRIM(branch)) = ?', ['a.l. jamora'])
                        ->orWhereRaw('LOWER(TRIM(branch)) = ?', ['al jamora']);
                }),
            default => $query
                ->where(function ($q) {
                    $q->where('is_wholesale_order', false)->orWhereNull('is_wholesale_order');
                })
                ->where(function ($q) {
                    $q->whereNull('branch')
                        ->orWhereRaw('LOWER(TRIM(branch)) = ?', ['a.jamora'])
                        ->orWhereRaw('LOWER(TRIM(branch)) NOT IN (?, ?)', ['a.l. jamora', 'al jamora']);
                }),
        };
    }

    protected function processOrder(Order $order, SyncRun $run, bool $force = false): void
    {
        $run->increment('processed');

        $payloadHash = $this->hashOrderPayload($order);
        $existing = SyncDocument::query()
            ->where('source_system', 'optical')
            ->where('source_type', 'order')
            ->where('source_id', (string) $order->id)
            ->first();

        if (! $force && $existing && $existing->payload_hash === $payloadHash && in_array($existing->status, ['posted', 'pending'], true)) {
            $run->increment('skipped');

            return;
        }

        try {
            $partner = $this->upsertPartnerFromOrder($order);
            $lines = $this->buildOrderJournalLines($order, $partner);
            if ($lines === []) {
                $run->increment('skipped');
                $this->upsertSyncDocument([
                    'source_type' => 'order',
                    'source_id' => (string) $order->id,
                    'payload_hash' => $payloadHash,
                    'journal_entry_id' => null,
                    'status' => 'skipped',
                    'error' => 'Zero gross amount.',
                ]);

                return;
            }

            $journal = Journal::query()->where('code', 'SJ')->firstOrFail();
            $entryDate = $order->completed?->toDateString() ?? $order->created_at?->toDateString() ?? now()->toDateString();
            $costCenterId = $this->resolveCostCenterId($order->branch);

            if ($costCenterId) {
                $lines = array_map(function (array $line) use ($costCenterId) {
                    $line['cost_center_id'] = $costCenterId;

                    return $line;
                }, $lines);
            }

            $entry = $this->journalPostingService->create([
                'journal_id' => $journal->id,
                'entry_date' => $entryDate,
                'reference' => $this->buildReference($order),
                'memo' => $this->buildOrderMemo($order),
                'source_system' => 'optical',
                'source_type' => 'order',
                'source_id' => (string) $order->id,
            ], $lines, null);

            if ($partner) {
                $gross = max(0, round((float) $order->total_amount - (float) $order->doctors_discount_amount, 2));
                PartnerBalance::query()->firstOrCreate(['partner_id' => $partner->id], ['balance' => 0]);
                PartnerBalance::query()->where('partner_id', $partner->id)->increment('balance', $gross);
            }

            $this->upsertSyncDocument([
                'source_type' => 'order',
                'source_id' => (string) $order->id,
                'payload_hash' => $payloadHash,
                'journal_entry_id' => $entry->id,
                'status' => 'posted',
                'error' => null,
            ]);

            $run->increment('created_entries');
        } catch (\Throwable $e) {
            $run->increment('failed');

            $this->upsertSyncDocument([
                'source_type' => 'order',
                'source_id' => (string) $order->id,
                'payload_hash' => $payloadHash,
                'journal_entry_id' => null,
                'status' => 'failed',
                'error' => $e->getMessage(),
            ]);
        }
    }

    protected function processPayment(OrderPayment $payment, SyncRun $run, bool $force = false): void
    {
        $run->increment('processed');

        $payloadHash = $this->hashPaymentPayload($payment);
        $existing = SyncDocument::query()
            ->where('source_system', 'optical')
            ->where('source_type', 'order_payment')
            ->where('source_id', (string) $payment->id)
            ->first();

        if (! $force && $existing && $existing->payload_hash === $payloadHash && in_array($existing->status, ['posted', 'pending'], true)) {
            $run->increment('skipped');

            return;
        }

        try {
            $amount = round((float) $payment->amount, 2);
            if ($amount <= 0) {
                $run->increment('skipped');
                $this->upsertSyncDocument([
                    'source_type' => 'order_payment',
                    'source_id' => (string) $payment->id,
                    'payload_hash' => $payloadHash,
                    'journal_entry_id' => null,
                    'status' => 'skipped',
                    'error' => 'Zero or negative payment amount.',
                ]);

                return;
            }

            $event = strtolower((string) $payment->payment_method) === 'cash'
                ? 'collection_cash'
                : 'collection_card';

            $rule = $this->getPostingRule($event);
            $journal = Journal::query()->where('code', 'CRJ')->firstOrFail();
            $entryDate = $payment->paid_date?->toDateString()
                ?? $payment->created_at?->toDateString()
                ?? now()->toDateString();

            $order = $payment->order;
            $costCenterId = $order ? $this->resolveCostCenterId($order->branch) : null;

            $lines = [
                [
                    'account_id' => $rule->debit_account_id,
                    'debit' => $amount,
                    'credit' => 0,
                    'memo' => 'Collection - '.ucfirst($payment->payment_method ?? 'payment'),
                    'cost_center_id' => $costCenterId,
                ],
                [
                    'account_id' => $rule->credit_account_id,
                    'debit' => 0,
                    'credit' => $amount,
                    'memo' => 'AR clearance',
                    'cost_center_id' => $costCenterId,
                ],
            ];

            $entry = $this->journalPostingService->create([
                'journal_id' => $journal->id,
                'entry_date' => $entryDate,
                'reference' => $order ? $this->buildReference($order) : "PAY-{$payment->id}",
                'memo' => "Optical payment #{$payment->id} for order #{$payment->order_id}",
                'source_system' => 'optical',
                'source_type' => 'order_payment',
                'source_id' => (string) $payment->id,
            ], $lines, null);

            $this->upsertSyncDocument([
                'source_type' => 'order_payment',
                'source_id' => (string) $payment->id,
                'payload_hash' => $payloadHash,
                'journal_entry_id' => $entry->id,
                'status' => 'posted',
                'error' => null,
            ]);

            $run->increment('created_entries');
        } catch (\Throwable $e) {
            $run->increment('failed');

            $this->upsertSyncDocument([
                'source_type' => 'order_payment',
                'source_id' => (string) $payment->id,
                'payload_hash' => $payloadHash,
                'journal_entry_id' => null,
                'status' => 'failed',
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    protected function buildOrderJournalLines(Order $order, ?Partner $partner = null): array
    {
        $vatRate = (float) config('accounting.vat_rate', 0.12);
        $totalAmount = (float) $order->total_amount;
        $doctorsDiscount = (float) $order->doctors_discount_amount;
        $orderedAmount = (float) $order->ordered_amount;

        $gross = max(0, round($totalAmount - $doctorsDiscount, 2));
        if ($gross <= 0 && $orderedAmount <= 0) {
            return [];
        }

        $discountAmount = round(max(0, $orderedAmount - $totalAmount) + $doctorsDiscount, 2);
        $salesExclusive = round($gross / (1 + $vatRate), 2);
        $vatAmount = round($gross - $salesExclusive, 2);
        $totalDebit = round($gross + $discountAmount, 2);
        $totalCredit = round($salesExclusive + $vatAmount, 2);
        $roundingDiff = round($totalDebit - $totalCredit, 2);
        $salesExclusive = round($salesExclusive + $roundingDiff, 2);

        $arRule = $this->getPostingRule('ar');
        $salesRule = $this->getPostingRule('sales_revenue');
        $discountRule = $this->getPostingRule('sales_discount');
        $vatRule = $this->getPostingRule('output_vat');

        $lines = [
            [
                'account_id' => $arRule->debit_account_id,
                'debit' => $gross,
                'credit' => 0,
                'memo' => 'Accounts receivable',
                'partner_type' => $partner ? Partner::class : null,
                'partner_id' => $partner?->id,
            ],
            [
                'account_id' => $salesRule->credit_account_id,
                'debit' => 0,
                'credit' => $salesExclusive,
                'memo' => 'Sales revenue',
            ],
            [
                'account_id' => $vatRule->credit_account_id,
                'debit' => 0,
                'credit' => $vatAmount,
                'memo' => 'Output VAT',
            ],
        ];

        if ($discountAmount > 0) {
            array_splice($lines, 1, 0, [[
                'account_id' => $discountRule->debit_account_id,
                'debit' => $discountAmount,
                'credit' => 0,
                'memo' => 'Sales discounts',
            ]]);
        }

        return $lines;
    }

    protected function upsertPartnerFromOrder(Order $order): ?Partner
    {
        $name = $order->wholesale_client_name
            ?: ($order->wholesaleClient?->name)
            ?: ('Optical Customer '.$order->id);

        $code = 'OPT-'.($order->wholesale_client_id ?: $order->id);

        return Partner::query()->updateOrCreate(
            [
                'entity_id' => $this->entityContext->id(),
                'code' => $code,
            ],
            [
                'name' => $name,
                'type' => $order->is_wholesale_order ? 'wholesale' : 'patient',
                'external_source' => 'optical',
                'external_id' => (string) ($order->wholesale_client_id ?: $order->id),
                'is_active' => true,
            ]
        );
    }

    protected function getPostingRule(string $event): PostingRule
    {
        $rule = $this->postingRules->get($event);

        if (! $rule || ! $rule->is_active) {
            throw new \RuntimeException("Posting rule for event [{$event}] is not configured or inactive.");
        }

        return $rule;
    }

    protected function loadPostingRules(): void
    {
        $this->postingRules = PostingRule::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->keyBy('event');
    }

    protected function loadCostCenters(): void
    {
        $this->costCenters = CostCenter::query()
            ->where('is_active', true)
            ->get();
    }

    protected function resolveCostCenterId(?string $branch): ?int
    {
        if (! $branch) {
            return null;
        }

        $normalized = trim($branch);
        $upper = strtoupper($normalized);

        $byCode = $this->costCenters->first(fn (CostCenter $cc) => strtoupper($cc->code) === $upper);
        if ($byCode) {
            return $byCode->id;
        }

        $byName = $this->costCenters->first(fn (CostCenter $cc) => strcasecmp($cc->name, $normalized) === 0);
        if ($byName) {
            return $byName->id;
        }

        $byPartial = $this->costCenters->first(fn (CostCenter $cc) => str_contains(strtoupper($cc->name), $upper)
            || str_contains($upper, strtoupper($cc->code)));

        return $byPartial?->id;
    }

    protected function hashOrderPayload(Order $order): string
    {
        return hash('sha256', json_encode([
            'id' => $order->id,
            'ts_no' => $order->ts_no,
            'total_amount' => (string) $order->total_amount,
            'doctors_discount_amount' => (string) $order->doctors_discount_amount,
            'ordered_amount' => (string) $order->ordered_amount,
            'vat' => (string) $order->vat,
            'completed' => $order->completed?->toIso8601String(),
            'payment_status' => $order->payment_status,
            'amount_paid' => (string) $order->amount_paid,
            'is_wholesale_order' => $order->is_wholesale_order,
            'wholesale_client_id' => $order->wholesale_client_id,
            'wholesale_client_name' => $order->wholesale_client_name,
            'branch' => $order->branch,
            'or' => $order->or,
            'si' => $order->si,
            'category' => $order->category,
        ]));
    }

    protected function hashPaymentPayload(OrderPayment $payment): string
    {
        return hash('sha256', json_encode([
            'id' => $payment->id,
            'order_id' => $payment->order_id,
            'amount' => (string) $payment->amount,
            'payment_type' => $payment->payment_type,
            'payment_method' => $payment->payment_method,
            'paid_date' => $payment->paid_date?->toDateString(),
            'status' => $payment->status,
            'notes' => $payment->notes,
        ]));
    }

    protected function buildReference(Order $order): string
    {
        $parts = array_filter([
            $order->ts_no,
            $order->or ? "OR:{$order->or}" : null,
            $order->si ? "SI:{$order->si}" : null,
        ]);

        return implode(' / ', $parts) ?: "ORDER-{$order->id}";
    }

    protected function buildOrderMemo(Order $order): string
    {
        $type = $order->is_wholesale_order ? 'Wholesale' : 'Retail';
        $client = $order->wholesale_client_name ?: ($order->wholesaleClient?->name);
        $branch = $order->branch ?: 'Unknown branch';

        $memo = "Optical {$type} sale — {$branch}";
        if ($client) {
            $memo .= " ({$client})";
        }

        return $memo;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function upsertSyncDocument(array $data): SyncDocument
    {
        return SyncDocument::updateOrCreate(
            [
                'entity_id' => $this->entityContext->id(),
                'source_system' => 'optical',
                'source_type' => $data['source_type'],
                'source_id' => $data['source_id'],
            ],
            [
                'payload_hash' => $data['payload_hash'],
                'journal_entry_id' => $data['journal_entry_id'],
                'status' => $data['status'],
                'error' => $data['error'],
                'synced_at' => in_array($data['status'], ['posted', 'pending'], true) ? now() : null,
            ]
        );
    }
}
