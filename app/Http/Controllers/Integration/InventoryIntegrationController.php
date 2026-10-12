<?php

namespace App\Http\Controllers\Integration;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

    public function recordMovement(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();

        $validated = $request->validate([
            'inventory_item_id' => ['required', 'exists:inventory_items,id'],
            'movement_type' => ['required', 'in:supplier_receipt,sales_issue,edging_loss,adjustment,transfer'],
            'quantity' => ['required', 'integer', 'not_in:0'],
            'unit_cost' => ['required', 'numeric', 'min:0'],
            'accounting_link_type' => ['required', 'in:cogs,ap_receipt,inventory_loss,adjustment'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $item = InventoryItem::findOrFail($validated['inventory_item_id']);
        $totalCost = abs($validated['quantity']) * $validated['unit_cost'];

        DB::transaction(function () use ($validated, $item, $totalCost, $entityId) {
            InventoryMovement::create([
                'entity_id' => $entityId,
                'inventory_item_id' => $item->id,
                'movement_reference' => 'MOV-'.strtoupper(uniqid()),
                'movement_type' => $validated['movement_type'],
                'quantity' => $validated['quantity'],
                'unit_cost' => $validated['unit_cost'],
                'total_cost' => $totalCost,
                'accounting_link_type' => $validated['accounting_link_type'],
                'review_status' => $validated['movement_type'] === 'edging_loss' ? 'needs_review' : 'matched',
                'notes' => $validated['notes'],
            ]);

            // Adjust on-hand quantity
            if (in_array($validated['movement_type'], ['supplier_receipt', 'adjustment'])) {
                $item->increment('qty_on_hand', $validated['quantity']);
            } else {
                $item->decrement('qty_on_hand', abs($validated['quantity']));
            }
        });

        return redirect()->back()->with('status', 'Stock movement recorded successfully.');
    }

    public function markReviewed(InventoryMovement $movement): RedirectResponse
    {
        $movement->update([
            'review_status' => 'matched',
            'notes' => trim(($movement->notes ?? '').' [Verified & Matched to GL]'),
        ]);

        return redirect()->back()->with('status', 'Movement verified and matched to GL.');
    }
}

