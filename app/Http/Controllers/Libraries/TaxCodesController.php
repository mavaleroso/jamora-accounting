<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Http\Requests\Libraries\TaxCodeStoreRequest;
use App\Http\Requests\Libraries\TaxCodeUpdateRequest;
use App\Models\Account;
use App\Models\TaxCode;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class TaxCodesController extends Controller
{
    public function index(Request $request): Response
    {
        $pageSize = (int) $request->get('per_page', 10);
        $pageSize = max(1, min(100, $pageSize));
        $page = max(1, (int) $request->get('page', 1));
        $search = trim((string) $request->get('search', ''));

        $query = TaxCode::query()
            ->with(['account:id,code,name'])
            ->orderBy('code');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('type', 'like', "%{$search}%");
            });
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        $accounts = Account::query()
            ->where('is_active', true)
            ->orderBy('code')
            ->get(['id', 'code', 'name']);

        return Inertia::render('libraries/tax-codes/page', [
            'taxCodes' => $paginator->items(),
            'totalTaxCodes' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
            'accounts' => $accounts,
        ]);
    }

    public function store(TaxCodeStoreRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $data['is_active'] = (bool) ($data['is_active'] ?? true);
        $data['account_id'] = $data['account_id'] ?? null;

        TaxCode::query()->create($data);

        return redirect()->back()
            ->with('status', 'Tax code created successfully.');
    }

    public function update(TaxCodeUpdateRequest $request, TaxCode $taxCode): RedirectResponse
    {
        $data = $request->validated();
        $data['is_active'] = (bool) ($data['is_active'] ?? false);
        $data['account_id'] = $data['account_id'] ?? null;

        $taxCode->update($data);

        return redirect()->back()
            ->with('status', 'Tax code updated successfully.');
    }

    public function destroy(TaxCode $taxCode): RedirectResponse
    {
        $taxCode->delete();

        return redirect()->back()
            ->with('status', 'Tax code deleted successfully.');
    }
}
