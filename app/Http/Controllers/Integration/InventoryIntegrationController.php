<?php

namespace App\Http\Controllers\Integration;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Services\Accounting\CashMovementService;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class InventoryIntegrationController extends Controller
{
    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $tab = $request->get('tab', 'movements'); // movements, alerts, valuation
        $search = trim((string) $request->get('search', ''));
        $reviewFilter = $request->get('review_status');

        $itemsQuery = InventoryItem::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true);

        if ($search !== '') {
            $itemsQuery->where(function ($q) use ($search) {
                $q->where('sku', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('brand', 'like', "%{$search}%");
            });
        }

        $items = $itemsQuery->orderBy('name')->get()->map(function ($item) {
            $isOutOfStock = $item->qty_on_hand <= 0;
            $isLowStock = ! $isOutOfStock && $item->qty_on_hand <= $item->reorder_level;
            $status = $isOutOfStock ? 'out_of_stock' : ($isLowStock ? 'low_stock' : 'healthy');
            $valuation = round($item->qty_on_hand * $item->unit_cost, 2);

            return [
                'id' => $item->id,
                'sku' => $item->sku,
                'name' => $item->name,
                'category' => $item->category,
                'brand' => $item->brand,
                'unit_cost' => (float) $item->unit_cost,
                'selling_price' => (float) $item->selling_price,
                'qty_on_hand' => $item->qty_on_hand,
                'reorder_level' => $item->reorder_level,
                'status' => $status,
                'valuation' => $valuation,
            ];
        });

        $movementsQuery = InventoryMovement::query()
            ->with(['inventoryItem:id,sku,name,category', 'journalEntry:id,entry_no,status'])
            ->where('entity_id', $entityId)
            ->orderByDesc('created_at');

        if ($reviewFilter) {
            $movementsQuery->where('review_status', $reviewFilter);
        }

        $movements = $movementsQuery->paginate(15)->withQueryString();

        $totalValuation = $items->sum('valuation');
        $lowStockCount = $items->whereIn('status', ['low_stock', 'out_of_stock'])->count();
        $pendingReviewCount = InventoryMovement::where('entity_id', $entityId)->where('review_status', 'needs_review')->count();
        $matchedCount = InventoryMovement::where('entity_id', $entityId)->where('review_status', 'matched')->count();

        $glAccounts = Account::query()
            ->where('is_active', true)
            ->where('is_postable', true)
            ->orderBy('code')
            ->get(['id', 'code', 'name']);

        return Inertia::render('integration/inventory/page', [
            'items' => $items,
            'movements' => $movements,
            'glAccounts' => $glAccounts,
            'kpis' => [
                'totalValuation' => $totalValuation,
                'lowStockCount' => $lowStockCount,
                'pendingReviewCount' => $pendingReviewCount,
                'matchedCount' => $matchedCount,
            ],
            'filters' => [
                'tab' => $tab,
                'search' => $search,
                'review_status' => $reviewFilter,
            ],
        ]);
    }

    /**
     * Movement type → GL posting. The link is derived, not chosen, so stock and the books cannot disagree:
     *  receipt      Dr Inventory          Cr Goods received not billed (2200), cleared when the supplier bill is entered
     *  return       Dr GRNI (2200)        Cr Inventory
     *  sales_issue  Dr Cost of goods sold Cr Inventory
     *  edging_loss  Dr Cost of goods sold Cr Inventory   (flagged for review)
     *  adjustment   ± Inventory against COGS             (flagged for review)
     */
    public const MOVEMENTS = [
        'receipt' => ['sign' => 1, 'link' => 'ap_receipt', 'review' => false],
        'supplier_receipt' => ['sign' => 1, 'link' => 'ap_receipt', 'review' => false],
        'return' => ['sign' => -1, 'link' => 'ap_receipt', 'review' => false],
        'sales_issue' => ['sign' => -1, 'link' => 'cogs', 'review' => false],
        'edging_loss' => ['sign' => -1, 'link' => 'inventory_loss', 'review' => true],
        'adjustment' => ['sign' => 0, 'link' => 'adjustment', 'review' => true],
        'transfer' => ['sign' => -1, 'link' => 'adjustment', 'review' => true],
    ];

    public function recordMovement(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();

        $validated = $request->validate([
            'inventory_item_id' => ['required', 'exists:inventory_items,id'],
            'movement_type' => ['required', Rule::in(array_keys(self::MOVEMENTS))],
            'quantity' => ['required', 'integer', 'not_in:0'],
            'unit_cost' => ['required', 'numeric', 'min:0'],
            'movement_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $item = InventoryItem::findOrFail($validated['inventory_item_id']);
        $rule = self::MOVEMENTS[$validated['movement_type']];
        // Receipts/issues use the quantity's magnitude; adjustments keep the sign the user entered.
        $qty = $rule['sign'] === 0 ? (int) $validated['quantity'] : $rule['sign'] * abs((int) $validated['quantity']);

        if ($qty < 0 && $item->qty_on_hand + $qty < 0) {
            throw ValidationException::withMessages(['quantity' => "Only {$item->qty_on_hand} on hand for {$item->name}."]);
        }

        $totalCost = round(abs($qty) * (float) $validated['unit_cost'], 2);
        $date = $validated['movement_date'] ?? now('Asia/Manila')->toDateString();

        DB::transaction(function () use ($validated, $item, $totalCost, $entityId, $rule, $qty, $date, $request) {
            $movement = InventoryMovement::create([
                'entity_id' => $entityId,
                'inventory_item_id' => $item->id,
                'movement_reference' => 'MOV-'.now()->format('ymd').'-'.strtoupper(substr(uniqid(), -5)),
                'movement_type' => $validated['movement_type'],
                'quantity' => $qty,
                'unit_cost' => $validated['unit_cost'],
                'total_cost' => $totalCost,
                'accounting_link_type' => $rule['link'],
                'review_status' => $rule['review'] ? 'needs_review' : 'matched',
                'notes' => $validated['notes'] ?? null,
            ]);

            $item->increment('qty_on_hand', $qty);

            $entry = $totalCost > 0 ? $this->journalize($movement, $item, $qty, $totalCost, $date, (int) $request->user()->id) : null;

            if ($entry) {
                $movement->update(['journal_entry_id' => $entry->id]);
            } elseif ($totalCost > 0) {
                $movement->update([
                    'review_status' => 'needs_review',
                    'notes' => trim(($movement->notes ?? '').' [Account mapping missing — not posted to GL]'),
                ]);
            }
        });

        return redirect()->back()->with('status', 'Stock movement recorded.');
    }

    /** Post the movement's accounting entry, or null when this entity lacks the mapped accounts/journal. */
    protected function journalize(InventoryMovement $movement, InventoryItem $item, int $qty, float $amount, string $date, int $userId): ?JournalEntry
    {
        $inventory = $item->gl_account_id ? Account::query()->find($item->gl_account_id) : null;
        $inventory ??= Account::query()->where('code', '1200')->first();
        $other = Account::query()->where('code', $movement->accounting_link_type === 'ap_receipt' ? '2200' : '5000')->first();
        $journal = Journal::query()->where('code', 'GJ')->first();

        if (! $inventory || ! $other || ! $journal) {
            return null;
        }

        $memo = ucfirst(str_replace('_', ' ', $movement->movement_type)).' — '.$item->name.' ×'.abs($qty);
        $increase = $qty > 0;

        return app(CashMovementService::class)->journal([
            'journal_id' => $journal->id,
            'entry_date' => $date,
            'reference' => $movement->movement_reference,
            'memo' => $memo,
            'source_system' => 'inventory',
            'source_type' => 'inventory_movement',
            'source_id' => $movement->id,
        ], [
            ['account_id' => $increase ? $inventory->id : $other->id, 'debit' => $amount, 'credit' => 0, 'memo' => $memo],
            ['account_id' => $increase ? $other->id : $inventory->id, 'debit' => 0, 'credit' => $amount, 'memo' => $memo],
        ], $userId);
    }

    public function markReviewed(Request $request, InventoryMovement $movement): RedirectResponse
    {
        $note = trim((string) $request->input('resolution', ''));

        $movement->update([
            'review_status' => 'matched',
            'notes' => trim(($movement->notes ?? '').' [Reviewed by '.$request->user()->name.($note !== '' ? ': '.$note : '').']'),
        ]);

        return redirect()->back()->with('status', 'Movement '.$movement->movement_reference.' reviewed.');
    }
}
