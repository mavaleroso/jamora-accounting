<?php

namespace App\Http\Controllers\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Requests\Accounting\AccountStoreRequest;
use App\Http\Requests\Accounting\AccountUpdateRequest;
use App\Models\Account;
use App\Models\AccountType;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AccountsController extends Controller
{
    public function index(Request $request): Response
    {
        $pageSize = (int) $request->get('per_page', 10);
        $pageSize = max(1, min(100, $pageSize));
        $page = max(1, (int) $request->get('page', 1));
        $search = trim((string) $request->get('search', ''));

        $query = Account::query()
            ->with(['accountType:id,name', 'parent:id,code,name'])
            ->orderBy('code');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        $accountTypes = AccountType::query()
            ->orderBy('name')
            ->get(['id', 'name', 'classification', 'normal_balance', 'statement']);

        $parentAccounts = Account::query()
            ->orderBy('code')
            ->get(['id', 'code', 'name']);

        return Inertia::render('accounting/chart-of-accounts/page', [
            'accounts' => $paginator->items(),
            'totalAccounts' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
            'accountTypes' => $accountTypes,
            'parentAccounts' => $parentAccounts,
        ]);
    }

    public function store(AccountStoreRequest $request): RedirectResponse
    {
        Account::query()->create($this->normalizeAccountData($request->validated()));

        return redirect()->back()
            ->with('status', 'Account created successfully.');
    }

    public function update(AccountUpdateRequest $request, Account $account): RedirectResponse
    {
        $account->update($this->normalizeAccountData($request->validated()));

        return redirect()->back()
            ->with('status', 'Account updated successfully.');
    }

    public function destroy(Account $account): RedirectResponse
    {
        if ($account->children()->exists()) {
            return redirect()->back()
                ->with('error', 'Cannot delete an account that has child accounts.');
        }

        if ($account->journalEntryLines()->exists()) {
            return redirect()->back()
                ->with('error', 'Cannot delete an account that has journal entries.');
        }

        $account->delete();

        return redirect()->back()
            ->with('status', 'Account deleted successfully.');
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalizeAccountData(array $data): array
    {
        $data['is_postable'] = (bool) ($data['is_postable'] ?? false);
        $data['is_active'] = (bool) ($data['is_active'] ?? true);
        $data['parent_id'] = $data['parent_id'] ?? null;
        $data['cash_flow_section'] = $data['cash_flow_section'] ?? null;
        $data['description'] = $data['description'] ?? null;

        return $data;
    }
}
