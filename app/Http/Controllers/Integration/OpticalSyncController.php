<?php

namespace App\Http\Controllers\Integration;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\PostingRule;
use App\Models\SyncDocument;
use App\Models\SyncRun;
use App\Services\Accounting\OpticalSyncService;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class OpticalSyncController extends Controller
{
    public function __construct(
        private readonly OpticalSyncService $syncService
    ) {}

    public function index(Request $request): Response
    {
        $runs = SyncRun::query()
            ->with('triggeredByUser:id,name')
            ->orderByDesc('started_at')
            ->limit(50)
            ->get()
            ->map(fn (SyncRun $run) => [
                'id' => $run->id,
                'started_at' => $run->started_at?->toIso8601String(),
                'finished_at' => $run->finished_at?->toIso8601String(),
                'status' => $run->status,
                'from_date' => $run->from_date?->toDateString(),
                'to_date' => $run->to_date?->toDateString(),
                'processed' => $run->processed,
                'created_entries' => $run->created_entries,
                'skipped' => $run->skipped,
                'failed' => $run->failed,
                'message' => $run->message,
                'triggered_by' => $run->triggeredByUser?->name,
            ]);

        $lastRun = $runs->first();
        $failedCount = SyncDocument::query()->where('status', 'failed')->count();

        return Inertia::render('integration/optical/page', [
            'runs' => $runs,
            'lastRun' => $lastRun,
            'failedCount' => $failedCount,
        ]);
    }

    public function run(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        $from = isset($validated['from']) ? Carbon::parse($validated['from'])->startOfDay() : null;
        $to = isset($validated['to']) ? Carbon::parse($validated['to'])->endOfDay() : null;

        $run = $this->syncService->sync($from, $to, $request->user());

        $message = "Sync finished: {$run->created_entries} entries created, {$run->skipped} skipped, {$run->failed} failed.";

        return redirect()->back()->with('status', $message);
    }

    public function exceptions(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->get('per_page', 15)));
        $page = max(1, (int) $request->get('page', 1));

        $paginator = SyncDocument::query()
            ->with('journalEntry:id,entry_no,status')
            ->where('status', 'failed')
            ->orderByDesc('updated_at')
            ->paginate($pageSize, ['*'], 'page', $page);

        $documents = collect($paginator->items())->map(fn (SyncDocument $doc) => [
            'id' => $doc->id,
            'source_type' => $doc->source_type,
            'source_id' => $doc->source_id,
            'payload_hash' => $doc->payload_hash,
            'status' => $doc->status,
            'error' => $doc->error,
            'synced_at' => $doc->synced_at?->toIso8601String(),
            'updated_at' => $doc->updated_at?->toIso8601String(),
            'journal_entry' => $doc->journalEntry ? [
                'id' => $doc->journalEntry->id,
                'entry_no' => $doc->journalEntry->entry_no,
                'status' => $doc->journalEntry->status,
            ] : null,
        ]);

        return Inertia::render('integration/optical/exceptions/page', [
            'documents' => $documents,
            'totalDocuments' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
        ]);
    }

    public function retry(SyncDocument $syncDocument): RedirectResponse
    {
        $this->syncService->retrySyncDocument($syncDocument, request()->user());

        return redirect()->back()->with('status', 'Retry completed.');
    }

    public function rules(): Response
    {
        $rules = PostingRule::query()
            ->with(['debitAccount:id,code,name', 'creditAccount:id,code,name'])
            ->orderBy('sort_order')
            ->get()
            ->map(fn (PostingRule $rule) => [
                'id' => $rule->id,
                'event' => $rule->event,
                'name' => $rule->name,
                'debit_account_id' => $rule->debit_account_id,
                'credit_account_id' => $rule->credit_account_id,
                'debit_account' => $rule->debitAccount ? [
                    'id' => $rule->debitAccount->id,
                    'code' => $rule->debitAccount->code,
                    'name' => $rule->debitAccount->name,
                ] : null,
                'credit_account' => $rule->creditAccount ? [
                    'id' => $rule->creditAccount->id,
                    'code' => $rule->creditAccount->code,
                    'name' => $rule->creditAccount->name,
                ] : null,
                'is_active' => $rule->is_active,
                'sort_order' => $rule->sort_order,
            ]);

        $accounts = Account::query()
            ->where('is_active', true)
            ->where('is_postable', true)
            ->orderBy('code')
            ->get(['id', 'code', 'name']);

        return Inertia::render('integration/optical/rules/page', [
            'rules' => $rules,
            'accounts' => $accounts,
        ]);
    }

    public function updateRule(Request $request, PostingRule $postingRule): RedirectResponse
    {
        $validated = $request->validate([
            'debit_account_id' => ['required', 'exists:accounts,id'],
            'credit_account_id' => ['required', 'exists:accounts,id'],
            'is_active' => ['required', 'boolean'],
        ]);

        $postingRule->update($validated);

        return redirect()->back()->with('status', 'Posting rule updated.');
    }
}
