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
        $pageSize = max(1, min(100, (int) $request->get('per_page', 10)));
        $page = max(1, (int) $request->get('page', 1));
        $search = trim((string) $request->get('search', ''));

        $query = Partner::query()->with('balance')->orderBy('code');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%");
            });
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('libraries/partners/page', [
            'partners' => $paginator->items(),
            'totalPartners' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
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
