<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Models\Bill;
use App\Models\Vendor;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class VendorsController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = [
            'search' => trim((string) $request->get('search', '')),
            'status' => $request->get('status'),
        ];
        $open = fn ($q) => $q->whereIn('status', ['posted', 'partially_paid']);

        $vendors = Vendor::query()
            ->withSum(['bills as open_balance' => $open], 'balance_due')
            ->withCount(['bills as open_invoices' => $open])
            ->when($filters['search'] !== '', fn ($q) => $q->where(fn ($q) => $q
                ->where('code', 'like', "%{$filters['search']}%")
                ->orWhere('name', 'like', "%{$filters['search']}%")
                ->orWhere('tin', 'like', "%{$filters['search']}%")))
            ->when($filters['status'] === 'active', fn ($q) => $q->where('is_active', true))
            ->when($filters['status'] === 'inactive', fn ($q) => $q->where('is_active', false))
            ->orderBy('name')
            ->paginate($this->perPage($request))
            ->withQueryString();

        return Inertia::render('libraries/vendors/page', [
            'parties' => $vendors,
            'filters' => $filters,
            'summary' => [
                'total' => Vendor::query()->count(),
                'active' => Vendor::query()->where('is_active', true)->count(),
                'withBalance' => Vendor::query()->whereHas('bills', $open)->count(),
                'outstanding' => round((float) Bill::query()->whereIn('status', ['posted', 'partially_paid'])->sum('balance_due'), 2),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('vendors', 'code')->where('entity_id', $entityId)],
            'name' => ['required', 'string', 'max:255'],
            'tin' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        $data['is_active'] = (bool) ($data['is_active'] ?? true);

        Vendor::query()->create($data);

        return redirect()->back()->with('status', 'Vendor created successfully.');
    }

    public function update(Request $request, Vendor $vendor): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('vendors', 'code')->where('entity_id', $entityId)->ignore($vendor->id)],
            'name' => ['required', 'string', 'max:255'],
            'tin' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        $data['is_active'] = (bool) ($data['is_active'] ?? false);

        $vendor->update($data);

        return redirect()->back()->with('status', 'Vendor updated successfully.');
    }

    public function destroy(Vendor $vendor): RedirectResponse
    {
        if ($vendor->bills()->exists()) {
            return redirect()->back()->with('error', 'Cannot delete a vendor with bills.');
        }

        $vendor->delete();

        return redirect()->back()->with('status', 'Vendor deleted successfully.');
    }
}
