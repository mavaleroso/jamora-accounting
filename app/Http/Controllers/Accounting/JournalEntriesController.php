<?php

namespace App\Http\Controllers\Accounting;

use App\Exceptions\AccountingException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Accounting\JournalEntryStoreRequest;
use App\Http\Requests\Accounting\JournalEntryUpdateRequest;
use App\Http\Resources\JournalEntryResource;
use App\Models\Account;
use App\Models\AccountingPeriod;
use App\Models\CostCenter;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Services\Accounting\CashMovementService;
use App\Services\Accounting\JournalPostingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class JournalEntriesController extends Controller
{
    /** Most entries one "approve all" click posts. */
    private const APPROVE_BATCH = 500;

    private const SOURCE_ENTRY_LOCKED = 'This entry comes from a source document. Correct the document (or void it) instead of editing the entry.';

    public function __construct(
        private readonly JournalPostingService $journalPostingService
    ) {}

    public function index(Request $request): Response
    {
        $pageSize = (int) $request->get('per_page', 20);
        $pageSize = max(1, min(100, $pageSize));

        // ?status=pending opens the approval queue (linked from the dashboard).
        $status = in_array($request->query('status'), ['draft', 'pending', 'posted', 'void'], true) ? $request->query('status') : '';

        $query = $this->baseQuery();
        $this->applyListFilters($query, ['status' => $status]);
        $paginator = $query->paginate($pageSize);
        $resource = JournalEntryResource::collection(collect($paginator->items()))->toArray($request);

        return Inertia::render('accounting/journal-entries/page', [
            'journalEntries' => $resource,
            'total' => $paginator->total(),
            'pageSize' => $pageSize,
            'journals' => $this->journalOptions(),
            'initialStatus' => $status,
        ]);
    }

    public function list(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['required', 'integer', 'min:1'],
            'per_page' => ['required', 'integer', 'min:1', 'max:100'],
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', 'string', 'in:draft,pending,posted,void'],
            'journal_id' => ['nullable', 'integer', 'exists:journals,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        $query = $this->baseQuery();
        $this->applyListFilters($query, $validated);

        $paginator = $query->paginate(
            (int) $validated['per_page'],
            ['*'],
            'page',
            (int) $validated['page']
        );
        $resource = JournalEntryResource::collection(collect($paginator->items()))->toArray($request);

        return response()->json([
            'journal_entries' => $resource,
            'total' => $paginator->total(),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('accounting/journal-entries/form/page', $this->formPageProps());
    }

    public function store(JournalEntryStoreRequest $request): RedirectResponse
    {
        try {
            $validated = $request->validated();
            $lines = $validated['lines'];
            $status = $validated['status'] ?? 'draft';

            $entry = $this->journalPostingService->create(
                collect($validated)->except(['lines', 'status'])->all(),
                $lines,
                $request->user()
            );

            if ($status === 'pending') {
                $entry->update(['status' => 'pending']);
            }

            return redirect()
                ->route('journal-entries.index')
                ->with('status', 'Journal entry created successfully.');
        } catch (AccountingException $e) {
            return redirect()
                ->back()
                ->withInput()
                ->with('error', $e->getMessage());
        }
    }

    public function show(Request $request, JournalEntry $journalEntry): JsonResponse
    {
        $journalEntry->load([
            'journal',
            'lines.account',
            'lines.costCenter',
            'preparedByUser',
            'approvedByUser',
            'postedByUser',
            'voidedByUser',
        ]);

        return response()->json([
            'journal_entry' => (new JournalEntryResource($journalEntry))->toArray($request),
        ]);
    }

    public function edit(JournalEntry $journalEntry): Response|RedirectResponse
    {
        if (! in_array($journalEntry->status, ['draft', 'pending'], true)) {
            return redirect()
                ->route('journal-entries.index')
                ->with('error', 'Only draft or pending journal entries can be edited.');
        }
        if ($journalEntry->source_system !== 'manual') {
            return redirect()
                ->route('journal-entries.index')
                ->with('error', self::SOURCE_ENTRY_LOCKED);
        }

        $journalEntry->load(['lines.account', 'lines.costCenter']);

        return Inertia::render('accounting/journal-entries/form/page', array_merge(
            $this->formPageProps(),
            [
                'journalEntry' => (new JournalEntryResource($journalEntry))->toArray(request()),
            ]
        ));
    }

    public function update(JournalEntryUpdateRequest $request, JournalEntry $journalEntry): RedirectResponse
    {
        if ($journalEntry->source_system !== 'manual') {
            return redirect()->back()->with('error', self::SOURCE_ENTRY_LOCKED);
        }

        try {
            $validated = $request->validated();
            $lines = $validated['lines'];
            $status = $validated['status'] ?? $journalEntry->status;

            $entry = $this->journalPostingService->update(
                $journalEntry,
                collect($validated)->except(['lines', 'status'])->all(),
                $lines
            );

            if (in_array($status, ['draft', 'pending'], true)) {
                $entry->update(['status' => $status]);
            }

            return redirect()
                ->route('journal-entries.index')
                ->with('status', 'Journal entry updated successfully.');
        } catch (AccountingException $e) {
            return redirect()
                ->back()
                ->withInput()
                ->with('error', $e->getMessage());
        }
    }

    public function destroy(JournalEntry $journalEntry): RedirectResponse
    {
        try {
            $this->journalPostingService->delete($journalEntry);

            return redirect()
                ->back()
                ->with('status', 'Journal entry deleted successfully.');
        } catch (AccountingException $e) {
            return redirect()
                ->back()
                ->with('error', $e->getMessage());
        }
    }

    /**
     * Manual entries (the Accountant's or the Retainer's adjustments) and entries from source documents waiting for
     * approval reach the ledger only when someone with journals.approve — the owner, unless granted to others —
     * approves them. System drafts (source documents left as drafts) are posted with journals.post.
     */
    public function post(Request $request, JournalEntry $journalEntry): RedirectResponse|JsonResponse
    {
        $user = $request->user();
        $manual = $journalEntry->source_system === 'manual';
        $needsApproval = $manual || $journalEntry->status === 'pending';

        try {
            if ($needsApproval && ! $user->can('journals.approve')) {
                throw new AccountingException($manual
                    ? 'Manual entries are posted when the Executive approves them. Submit the entry for approval.'
                    : 'Entries from source documents are posted when the Executive approves them.');
            }
            if (! $needsApproval && ! $user->can('journals.post')) {
                throw new AccountingException('You are not allowed to post this entry.');
            }

            $needsApproval
                ? $this->journalPostingService->approveAndPost($journalEntry, $user)
                : $this->journalPostingService->post($journalEntry, $user);

            $message = $needsApproval ? 'Journal entry approved and posted.' : 'Journal entry posted successfully.';

            if ($request->expectsJson()) {
                return response()->json(['message' => $message]);
            }

            return redirect()
                ->back()
                ->with('status', $message);
        } catch (AccountingException $e) {
            if ($request->expectsJson()) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return redirect()
                ->back()
                ->with('error', $e->getMessage());
        }
    }

    /**
     * Approve every entry waiting for approval that matches the list's filters, oldest first, up to
     * self::APPROVE_BATCH per click. Entries that cannot post (e.g. their period is closed) are left waiting.
     */
    public function approvePending(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'journal_id' => ['nullable', 'integer', 'exists:journals,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        $query = JournalEntry::query()->where('status', 'pending');
        $this->applyListFilters($query, $validated);
        $waiting = (clone $query)->count();
        $entries = $query->orderBy('entry_date')->orderBy('id')->limit(self::APPROVE_BATCH)->get();

        $approved = 0;
        $errors = [];
        foreach ($entries as $entry) {
            try {
                $this->journalPostingService->approveAndPost($entry, $request->user());
                $approved++;
            } catch (AccountingException $e) {
                $errors[$e->getMessage()] = ($errors[$e->getMessage()] ?? 0) + 1;
            }
        }

        $left = $waiting - $approved;
        $message = $approved.' '.str('entry')->plural($approved).' approved and posted.'
            .($left > 0 ? " {$left} still waiting." : '')
            .collect($errors)->map(fn (int $n, string $why) => " {$n} not posted: {$why}")->implode('');

        return response()->json(['message' => $message, 'approved' => $approved, 'remaining' => $left], $approved === 0 && $entries->isNotEmpty() ? 422 : 200);
    }

    public function void(Request $request, JournalEntry $journalEntry): RedirectResponse|JsonResponse
    {
        $validated = $request->validate([
            'memo' => ['nullable', 'string', 'max:2000'],
        ]);

        try {
            $this->journalPostingService->void(
                $journalEntry,
                $request->user(),
                $validated['memo'] ?? null
            );

            if ($request->expectsJson()) {
                return response()->json(['message' => 'Journal entry voided successfully.']);
            }

            return redirect()
                ->back()
                ->with('status', 'Journal entry voided successfully.');
        } catch (AccountingException $e) {
            if ($request->expectsJson()) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return redirect()
                ->back()
                ->with('error', $e->getMessage());
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function formPageProps(): array
    {
        return [
            'journals' => $this->journalOptions(),
            // Non-cash journals only: cash and bank accounts are recorded through Cash & Bank Records.
            'accounts' => Account::query()
                ->where('is_postable', true)
                ->where('is_active', true)
                ->whereNotIn('id', app(CashMovementService::class)->cashAccountIds())
                ->orderBy('code')
                ->get(['id', 'code', 'name'])
                ->map(fn (Account $account) => [
                    'id' => $account->id,
                    'code' => $account->code,
                    'name' => $account->name,
                ])
                ->values()
                ->all(),
            'costCenters' => CostCenter::query()
                ->where('is_active', true)
                ->orderBy('code')
                ->get(['id', 'code', 'name'])
                ->map(fn (CostCenter $costCenter) => [
                    'id' => $costCenter->id,
                    'code' => $costCenter->code,
                    'name' => $costCenter->name,
                ])
                ->values()
                ->all(),
            'periods' => AccountingPeriod::query()
                ->orderByDesc('start_date')
                ->get(['id', 'period_no', 'start_date', 'end_date', 'status'])
                ->map(fn (AccountingPeriod $period) => [
                    'id' => $period->id,
                    'period_no' => $period->period_no,
                    'start_date' => $period->start_date->toDateString(),
                    'end_date' => $period->end_date->toDateString(),
                    'status' => $period->status,
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * @return list<array{id: int, code: string, name: string, type: string|null}>
     */
    private function journalOptions(): array
    {
        return Journal::query()
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'type'])
            ->map(fn (Journal $journal) => [
                'id' => $journal->id,
                'code' => $journal->code,
                'name' => $journal->name,
                'type' => $journal->type,
            ])
            ->values()
            ->all();
    }

    private function baseQuery()
    {
        return JournalEntry::query()
            ->with(['journal'])
            ->orderByDesc('entry_date')
            ->orderByDesc('id');
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function applyListFilters($query, array $filters): void
    {
        $search = isset($filters['search']) ? trim((string) $filters['search']) : '';
        if ($search !== '') {
            $term = '%'.$search.'%';
            $query->where(function ($q) use ($term) {
                $q->where('entry_no', 'like', $term)
                    ->orWhere('reference', 'like', $term)
                    ->orWhere('memo', 'like', $term)
                    ->orWhereHas('journal', function ($jq) use ($term) {
                        $jq->where('code', 'like', $term)
                            ->orWhere('name', 'like', $term);
                    });
            });
        }

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['journal_id'])) {
            $query->where('journal_id', $filters['journal_id']);
        }

        if (! empty($filters['date_from'])) {
            $query->where('entry_date', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->where('entry_date', '<=', $filters['date_to']);
        }
    }
}
