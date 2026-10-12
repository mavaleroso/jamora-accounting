<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
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
        $pageSize = max(1, min(100, (int) $request->get('per_page', 10)));
        $page = max(1, (int) $request->get('page', 1));
        $search = trim((string) $request->get('search', ''));

        $query = Vendor::query()->orderBy('code');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%");
            });
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('libraries/vendors/page', [
            'vendors' => $paginator->items(),
            'totalVendors' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
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
