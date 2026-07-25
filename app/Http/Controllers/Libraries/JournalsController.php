<?php

namespace App\Http\Controllers\Libraries;

use App\Http\Controllers\Controller;
use App\Http\Requests\Libraries\JournalStoreRequest;
use App\Http\Requests\Libraries\JournalUpdateRequest;
use App\Models\Account;
use App\Models\Journal;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class JournalsController extends Controller
{
    public function index(Request $request): Response
    {
        $pageSize = (int) $request->get('per_page', 10);
        $pageSize = max(1, min(100, $pageSize));
        $page = max(1, (int) $request->get('page', 1));
        $search = trim((string) $request->get('search', ''));

        $query = Journal::query()
            ->with(['defaultAccount:id,code,name'])
            ->orderBy('code');

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('type', 'like', "%{$search}%")
                    ->orWhere('sequence_prefix', 'like', "%{$search}%");
            });
        }

        $paginator = $query->paginate($pageSize, ['*'], 'page', $page);

        $accounts = Account::query()
            ->where('is_active', true)
            ->orderBy('code')
            ->get(['id', 'code', 'name']);

        return Inertia::render('libraries/journal-types/page', [
            'journals' => $paginator->items(),
            'totalJournals' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'search' => $search,
            'accounts' => $accounts,
        ]);
    }

    public function store(JournalStoreRequest $request): RedirectResponse
    {
        $data = $request->validated();
        $data['next_sequence'] = $data['next_sequence'] ?? 1;
        $data['default_account_id'] = $data['default_account_id'] ?? null;

        Journal::query()->create($data);

        return redirect()->back()
            ->with('status', 'Journal type created successfully.');
    }

    public function update(JournalUpdateRequest $request, Journal $journal): RedirectResponse
    {
        $data = $request->validated();
        $data['default_account_id'] = $data['default_account_id'] ?? null;

        $journal->update($data);

        return redirect()->back()
            ->with('status', 'Journal type updated successfully.');
    }

    public function destroy(Journal $journal): RedirectResponse
    {
        if ($journal->journalEntries()->exists()) {
            return redirect()->back()
                ->with('error', 'Cannot delete a journal type that has journal entries.');
        }

        $journal->delete();

        return redirect()->back()
            ->with('status', 'Journal type deleted successfully.');
    }
}
