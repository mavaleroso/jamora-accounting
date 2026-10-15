<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class PartnersController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = [
            'search' => trim((string) $request->get('search', '')),
            'type' => $request->get('type'),
            'status' => $request->get('status'),
        ];
        $open = fn ($q) => $q->whereIn('status', ['confirmed', 'partially_paid']);

        $partners = Partner::query()
            // Receivable straight from open invoices, so it always agrees with AR aging.
            ->withSum(['invoices as open_balance' => $open], 'balance_due')
            ->withCount(['invoices as open_invoices' => $open])
            ->when($filters['search'] !== '', fn ($q) => $q->where(fn ($q) => $q
                ->where('code', 'like', "%{$filters['search']}%")
                ->orWhere('name', 'like', "%{$filters['search']}%")
                ->orWhere('tin', 'like', "%{$filters['search']}%")))
            ->when(in_array($filters['type'], ['customer', 'patient', 'wholesale'], true), fn ($q) => $q->where('type', $filters['type']))
            ->when($filters['status'] === 'active', fn ($q) => $q->where('is_active', true))
            ->when($filters['status'] === 'inactive', fn ($q) => $q->where('is_active', false))
            ->orderBy('name')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('libraries/partners/page', [
            'parties' => $partners,
            'filters' => $filters,
            'summary' => [
                'total' => Partner::query()->count(),
                'active' => Partner::query()->where('is_active', true)->count(),
                'withBalance' => Partner::query()->whereHas('invoices', $open)->count(),
                'outstanding' => round((float) \App\Models\Invoice::query()->whereIn('status', ['confirmed', 'partially_paid'])->sum('balance_due'), 2),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('partners', 'code')->where('entity_id', $entityId)],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:customer,patient,wholesale'],
            'tin' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        $data['is_active'] = (bool) ($data['is_active'] ?? true);

        Partner::query()->create($data);

        return redirect()->back()->with('status', 'Partner created successfully.');
    }

    public function update(Request $request, Partner $partner): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('partners', 'code')->where('entity_id', $entityId)->ignore($partner->id)],
            'name' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:customer,patient,wholesale'],
            'tin' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        $data['is_active'] = (bool) ($data['is_active'] ?? false);

        $partner->update($data);

        return redirect()->back()->with('status', 'Partner updated successfully.');
    }

    public function destroy(Partner $partner): RedirectResponse
    {
        if ($partner->invoices()->exists()) {
            return redirect()->back()->with('error', 'Cannot delete a partner with invoices.');
        }

        $partner->delete();

        return redirect()->back()->with('status', 'Partner deleted successfully.');
    }
}
