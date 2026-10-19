<?php

namespace App\Http\Controllers\Integration;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\InventoryMovement;
use App\Models\JournalEntryLine;
use App\Services\Optical\OpticalApiClient;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Inventory as seen from accounting. Stock lives in the optical POS (the single source of truth); this screen shows
 * the stock events the optical sync booked, low-stock alerts read from the optical API, and whether the optical
 * stock value agrees with the Inventory ledger account.
 */
class InventoryIntegrationController extends Controller
{
    public const MOVEMENT_TYPES = [
        'receipt' => 'Supplier delivery',
        'sales_issue' => 'Sold',
        'write_off' => 'Write-off',
        'return' => 'Returned to supplier',
    ];

    public function index(Request $request, EntityContext $entityContext, OpticalApiClient $api): Response
    {
        $entity = $entityContext->current();
        $filters = [
            'search' => trim((string) $request->get('search', '')),
            'review_status' => $request->get('review_status'),
            'movement_type' => $request->get('movement_type'),
            'date_from' => $request->get('date_from'),
            'date_to' => $request->get('date_to'),
        ];

        $movements = InventoryMovement::query()
            ->with('journalEntry:id,entry_no,status')
            ->when($filters['search'] !== '', fn ($q) => $q->where(function ($q) use ($filters) {
                $term = "%{$filters['search']}%";
                $q->where('movement_reference', 'like', $term)
                    ->orWhere('description', 'like', $term)
                    ->orWhere('product_code', 'like', $term)
                    ->orWhere('counterparty', 'like', $term);
            }))
            ->when(in_array($filters['review_status'], ['matched', 'needs_review', 'resolved', 'reversed'], true), fn ($q) => $q->where('review_status', $filters['review_status']))
            ->when(array_key_exists((string) $filters['movement_type'], self::MOVEMENT_TYPES), fn ($q) => $q->where('movement_type', $filters['movement_type']))
            ->when($filters['date_from'], fn ($q, $d) => $q->whereDate('occurred_on', '>=', $d))
            ->when($filters['date_to'], fn ($q, $d) => $q->whereDate('occurred_on', '<=', $d))
            ->orderByDesc('occurred_on')
            ->orderByDesc('id')
            ->paginate($this->perPage($request))
            ->withQueryString()
            ->through(fn (InventoryMovement $m) => [
                'id' => $m->id,
                'occurred_on' => $m->occurred_on?->toDateString() ?? $m->created_at?->toDateString(),
                'movement_reference' => $m->movement_reference,
                'movement_type' => $m->movement_type,
                'stock_type' => $m->stock_type,
                'product_code' => $m->product_code,
                'description' => $m->description,
                'counterparty' => $m->counterparty,
                'quantity' => $m->quantity,
                'unit_cost' => (float) $m->unit_cost,
                'total_cost' => (float) $m->total_cost,
                'accounting_link_type' => $m->accounting_link_type,
                'review_status' => $m->review_status,
                'notes' => $m->notes,
                'journal_entry' => $m->journalEntry?->only(['id', 'entry_no', 'status']),
            ]);

        $isStockEntity = $entity?->code === config('optical.product_entity');
        [$stock, $stockError] = $isStockEntity ? $this->stockSummary($api, $request->boolean('refresh')) : [null, null];
        $ledgerValue = $this->inventoryLedgerBalance();

        return Inertia::render('integration/inventory/page', [
            'movements' => $movements,
            'filters' => $filters,
            'movementTypes' => self::MOVEMENT_TYPES,
            'isStockEntity' => $isStockEntity,
            'stockEntityCode' => config('optical.product_entity'),
            'stock' => $stock ? [
                'on_hand_total' => (int) ($stock['on_hand_total'] ?? 0),
                'on_hand_by_type' => $stock['on_hand_by_type'] ?? [],
                'value_total' => round((float) ($stock['on_hand_value_total'] ?? 0), 2),
                'value_by_type' => $stock['on_hand_value_by_type'] ?? [],
                'low_stock_threshold' => (int) ($stock['low_stock_threshold'] ?? 0),
                'low_stock' => collect($stock['groups'] ?? [])
                    ->filter(fn (array $g) => ! empty($g['is_low_stock']))
                    ->sortBy('on_hand_count')
                    ->take(200)
                    ->values(),
                'low_stock_count' => collect($stock['groups'] ?? [])->where('is_low_stock', true)->count(),
                'read_at' => $stock['read_at'] ?? null,
            ] : null,
            'stockError' => $stockError,
            'kpis' => [
                'ledgerValue' => $ledgerValue,
                'needsReview' => InventoryMovement::query()->where('review_status', 'needs_review')->count(),
                'matched' => InventoryMovement::query()->where('review_status', 'matched')->count(),
            ],
        ]);
    }

    public function markReviewed(Request $request, InventoryMovement $movement): RedirectResponse
    {
        abort_unless((int) $movement->entity_id === (int) app(EntityContext::class)->id(), 404);
        $note = trim((string) $request->input('resolution', ''));

        $movement->update([
            'review_status' => 'resolved',
            'notes' => trim(($movement->notes ?? '').' [Reviewed by '.$request->user()->name.($note !== '' ? ': '.$note : '').']'),
        ]);

        return redirect()->back()->with('status', 'Movement '.$movement->movement_reference.' marked reviewed.');
    }

    /**
     * Stock on hand and its value from the optical API, cached for ten minutes.
     *
     * @return array{0: array<string, mixed>|null, 1: string|null}
     */
    protected function stockSummary(OpticalApiClient $api, bool $refresh): array
    {
        if (! $api->isConfigured()) {
            return [null, 'The optical API is not configured.'];
        }

        if ($refresh) {
            Cache::forget('optical.stock-summary');
        }

        try {
            return [Cache::remember('optical.stock-summary', 600, fn () => [...$api->stockSummary(), 'read_at' => now()->toIso8601String()]), null];
        } catch (\Throwable $e) {
            report($e);

            return [null, 'Could not read stock from the optical POS: '.$e->getMessage()];
        }
    }

    /** Posted balance of the Inventory account (1200) of the current entity. */
    protected function inventoryLedgerBalance(): float
    {
        $account = Account::query()->where('code', '1200')->first();
        if (! $account) {
            return 0.0;
        }

        return round((float) JournalEntryLine::query()
            ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
            ->where('journal_entry_lines.account_id', $account->id)
            ->whereIn('journal_entries.status', ['posted', 'void'])
            ->whereNull('journal_entries.deleted_at')
            ->sum(DB::raw('journal_entry_lines.debit - journal_entry_lines.credit')), 2);
    }
}
