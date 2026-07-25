<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Http\Requests\Libraries\AccountTypeStoreRequest;
use App\Http\Requests\Libraries\AccountTypeUpdateRequest;
use App\Models\AccountType;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AccountTypesController extends Controller
{
    public function index(Request $request): Response
    {
        $pageSize = (int) $request->get('per_page', 10);
        $pageSize = max(1, min(100, $pageSize));
        $page = max(1, (int) $request->get('page', 1));
        $search = trim((string) $request->get('search', ''));

        $query = AccountType::query()->orderBy('name');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('classification', 'like', "%{$search}%")
                    ->orWhere('statement', 'like', "%{$search}%");
            });
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('libraries/account-types/page', [
            'accountTypes' => $paginator->items(),
            'totalAccountTypes' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
        ]);
    }

    public function store(AccountTypeStoreRequest $request): RedirectResponse
    {
        AccountType::query()->create($request->validated());

        return redirect()->back()
            ->with('status', 'Account type created successfully.');
    }

    public function update(AccountTypeUpdateRequest $request, AccountType $accountType): RedirectResponse
    {
        $accountType->update($request->validated());

        return redirect()->back()
            ->with('status', 'Account type updated successfully.');
    }

    public function destroy(AccountType $accountType): RedirectResponse
    {
        if ($accountType->accounts()->exists()) {
            return redirect()->back()
                ->with('error', 'Cannot delete an account type that is assigned to accounts.');
        }

        $accountType->delete();

        return redirect()->back()
            ->with('status', 'Account type deleted successfully.');
    }
}
