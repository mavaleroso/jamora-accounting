<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Http\Requests\Libraries\CostCenterStoreRequest;
use App\Http\Requests\Libraries\CostCenterUpdateRequest;
use App\Models\CostCenter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CostCentersController extends Controller
{
    public function index(Request $request): Response
    {
        $pageSize = (int) $request->get('per_page', 10);
        $pageSize = max(1, min(100, $pageSize));
        $page = max(1, (int) $request->get('page', 1));
        $search = trim((string) $request->get('search', ''));

        $query = CostCenter::query()->orderBy('code');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%");
            });
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('libraries/cost-centers/page', [
            'costCenters' => $paginator->items(),
            'totalCostCenters' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
        ]);
    }

    public function store(CostCenterStoreRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $data['is_active'] = (bool) ($data['is_active'] ?? true);

        CostCenter::query()->create($data);

        return redirect()->back()
            ->with('status', 'Cost center created successfully.');
    }

    public function update(CostCenterUpdateRequest $request, CostCenter $costCenter): RedirectResponse
    {
        $data = $request->validated();
        $data['is_active'] = (bool) ($data['is_active'] ?? false);

        $costCenter->update($data);

        return redirect()->back()
            ->with('status', 'Cost center updated successfully.');
    }

    public function destroy(CostCenter $costCenter): RedirectResponse
    {
        if ($costCenter->journalEntryLines()->exists()) {
            return redirect()->back()
                ->with('error', 'Cannot delete a cost center that is used in journal entries.');
        }

        $costCenter->delete();

        return redirect()->back()
            ->with('status', 'Cost center deleted successfully.');
    }
}
