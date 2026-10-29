<?php

namespace App\Http\Controllers\Integration;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\PostingRule;
use App\Models\SyncCursor;
use App\Models\SyncDocument;
use App\Models\SyncRun;
use App\Services\Optical\OpticalApiClient;
use App\Services\Optical\OpticalSyncService;
use App\Support\EntityContext;
use App\Support\SystemSettings;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The optical POS sync: run it, see what each run did, and review the documents that failed or were flagged.
 */
class OpticalSyncController extends Controller
{
    public function __construct(
        private readonly OpticalSyncService $syncService
    ) {}

    public function index(OpticalApiClient $api): Response
    {
        $this->syncService->active(); // closes runs that stopped without finishing

        $runs = SyncRun::query()
            ->with('triggeredByUser:id,firstname,lastname,username')
            ->orderByDesc('started_at')
            ->limit(50)
            ->get()
            ->map(fn (SyncRun $run) => [
                'id' => $run->id,
                'started_at' => $run->started_at?->toIso8601String(),
                'finished_at' => $run->finished_at?->toIso8601String(),
                'status' => $run->status,
                'processed' => $run->processed,
                'created_entries' => $run->created_entries,
                'skipped' => $run->skipped,
                'failed' => $run->failed,
                'message' => $run->message,
                'triggered_by' => $run->triggeredByUser?->name,
            ]);

        $documents = SyncDocument::query()->where('source_system', 'optical');

        return Inertia::render('integration/optical/page', [
            'runs' => $runs,
            'lastRun' => $runs->first(),
            'failedCount' => (clone $documents)->where('status', 'failed')->count(),
            'reviewCount' => (clone $documents)->where('status', 'review')->count(),
            'cursors' => SyncCursor::query()
                ->where('source_system', 'optical')
                ->get()
                ->keyBy('stream')
                ->map(fn (SyncCursor $c) => $c->cursor_at?->toIso8601String()),
            'streams' => OpticalSyncService::STREAMS,
            'settings' => [
                'configured' => $api->isConfigured(),
                'base_url' => config('optical.api.base_url'),
                'start_date' => config('optical.start_date'),
                'product_entity' => config('optical.product_entity'),
                'workshop_entity' => config('optical.workshop_entity'),
                'auto_post' => (bool) config('accounting.auto_post_source_documents', true),
                'approval' => app(SystemSettings::class)->approveSourceDocuments(),
            ],
        ]);
    }

    public function run(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'full' => ['nullable', 'boolean'],
        ]);

        try {
            $this->syncService->queue($request->user(), ['full' => (bool) ($validated['full'] ?? false)]);
        } catch (\RuntimeException $e) {
            return redirect()->back()->with('error', $e->getMessage());
        }

        return redirect()->back()->with('status', 'Sync started. It runs in the background; this page updates as it goes.');
    }

    public function exceptions(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->get('per_page', 15)));
        $status = in_array($request->get('status'), ['failed', 'review'], true) ? $request->get('status') : null;

        $paginator = SyncDocument::query()
            ->with('journalEntry:id,entry_no,status')
            ->where('source_system', 'optical')
            ->when($status, fn ($q) => $q->where('status', $status), fn ($q) => $q->whereIn('status', ['failed', 'review']))
            ->orderByRaw("case when status = 'failed' then 0 else 1 end")
            ->orderByDesc('updated_at')
            ->paginate($pageSize)
            ->withQueryString();

        $documents = collect($paginator->items())->map(fn (SyncDocument $doc) => [
            'id' => $doc->id,
            'source_type' => $doc->source_type,
            'source_id' => $doc->source_id,
            'reference' => $this->reference($doc),
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
            'status' => $status,
        ]);
    }

    public function retry(Request $request, SyncDocument $syncDocument): RedirectResponse
    {
        // Route binding runs before the entity is set, so check it here.
        $entityId = app(EntityContext::class)->id();
        abort_unless($syncDocument->source_system === 'optical' && ($entityId === null || (int) $syncDocument->entity_id === (int) $entityId), 404);

        try {
            $run = $this->syncService->retry($syncDocument, $request->user());
        } catch (\RuntimeException $e) {
            return redirect()->back()->with('error', $e->getMessage());
        }

        $doc = $syncDocument->fresh();

        return redirect()->back()->with(
            $doc?->status === 'failed' ? 'error' : 'status',
            $doc?->status === 'failed' ? 'Still failing: '.$doc->error : "Retried ({$run->created_entries} booked)."
        );
    }

    public function rules(OpticalApiClient $api): Response
    {
        $all = PostingRule::query()
            ->with(['debitAccount:id,code,name', 'creditAccount:id,code,name'])
            ->orderBy('sort_order')
            ->get();
        [$serviceRules, $rules] = $all->partition(fn (PostingRule $rule) => $rule->isServiceRevenueRule());

        $rules = $rules->values()
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
            'services' => $this->serviceRevenueRows($api, $serviceRules->values()),
            'revenueAccounts' => Account::query()
                ->where('is_active', true)
                ->where('is_postable', true)
                ->whereHas('accountType', fn ($q) => $q->where('classification', 'revenue'))
                ->orderBy('code')
                ->get(['id', 'code', 'name']),
        ]);
    }

    public function updateRule(Request $request, int $postingRule): RedirectResponse
    {
        // Route binding runs before the entity is set, so look the rule up in the current entity's books here.
        $rule = PostingRule::query()->findOrFail($postingRule);
        $accountIds = Account::query()->pluck('id')->all();

        $validated = $request->validate([
            'debit_account_id' => ['required', 'integer', Rule::in($accountIds)],
            'credit_account_id' => ['required', 'integer', Rule::in($accountIds)],
            'is_active' => ['required', 'boolean'],
        ], [
            'debit_account_id.in' => 'Choose an account from this company\'s chart of accounts.',
            'credit_account_id.in' => 'Choose an account from this company\'s chart of accounts.',
        ]);

        $rule->update($validated);

        return redirect()->back()->with('status', 'Posting rule updated.');
    }

    /**
     * Give one optical service its own revenue account (e.g. eye exams apart from certifications). Its sales post
     * Dr Accounts Receivable, Cr that account instead of the general service-sale rule.
     */
    public function saveServiceRule(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'optical_service_id' => ['required', 'integer', 'min:1'],
            'service_name' => ['required', 'string', 'max:200'],
            'credit_account_id' => ['required', 'integer', Rule::in(
                Account::query()->whereHas('accountType', fn ($q) => $q->where('classification', 'revenue'))->pluck('id')->all()
            )],
        ], [
            'credit_account_id.in' => 'Choose a revenue account from this company\'s chart of accounts.',
        ]);

        $general = PostingRule::query()->where('event', 'sale_service')->first();
        if (! $general) {
            return redirect()->back()->with('error', 'Set up the service sale rule first: the service\'s rule debits the same receivable account.');
        }

        $event = PostingRule::serviceEvent($validated['optical_service_id']);
        PostingRule::query()->updateOrCreate(
            ['entity_id' => $general->entity_id, 'event' => $event],
            [
                'name' => 'Service revenue — '.$validated['service_name'],
                'debit_account_id' => $general->debit_account_id,
                'credit_account_id' => (int) $validated['credit_account_id'],
                'condition' => ['optical_service_id' => (int) $validated['optical_service_id'], 'service_name' => $validated['service_name']],
                'is_active' => true,
                'sort_order' => $general->sort_order + 1,
            ]
        );

        return redirect()->back()->with('status', "{$validated['service_name']} now posts to its own revenue account. Sales already booked are not changed.");
    }

    public function destroyServiceRule(int $postingRule): RedirectResponse
    {
        $rule = PostingRule::query()->findOrFail($postingRule);
        abort_unless($rule->isServiceRevenueRule(), 404);

        $name = $rule->condition['service_name'] ?? $rule->name;
        $rule->delete();

        return redirect()->back()->with('status', "{$name} posts to the general service revenue account again.");
    }

    /**
     * Each optical service (from the optical POS, else the ones that have a rule) with the revenue account it posts to.
     *
     * @param  Collection<int, PostingRule>  $serviceRules
     * @return list<array<string, mixed>>
     */
    protected function serviceRevenueRows(OpticalApiClient $api, Collection $serviceRules): array
    {
        $byService = $serviceRules->keyBy(fn (PostingRule $rule) => (int) ($rule->condition['optical_service_id'] ?? substr($rule->event, strlen(PostingRule::SERVICE_EVENT_PREFIX))));

        $services = [];
        try {
            if ($api->isConfigured()) {
                foreach ($api->get('services')['data'] ?? [] as $service) {
                    $services[(int) $service['id']] = ['name' => (string) $service['name'], 'billed_by' => $service['billed_by'] ?? null, 'is_active' => (bool) ($service['is_active'] ?? true)];
                }
            }
        } catch (\Throwable) {
            // The optical POS is unreachable: list the services that already have a rule.
        }
        foreach ($byService as $id => $rule) {
            $services[$id] ??= ['name' => (string) ($rule->condition['service_name'] ?? $rule->name), 'billed_by' => null, 'is_active' => true];
        }

        return collect($services)
            ->map(fn (array $service, int $id) => [
                'optical_service_id' => $id,
                ...$service,
                'rule' => ($rule = $byService->get($id)) ? [
                    'id' => $rule->id,
                    'credit_account_id' => $rule->credit_account_id,
                    'credit_account' => $rule->creditAccount ? ['id' => $rule->creditAccount->id, 'code' => $rule->creditAccount->code, 'name' => $rule->creditAccount->name] : null,
                ] : null,
            ])
            ->sortBy([['is_active', 'desc'], ['name', 'asc']])
            ->values()
            ->all();
    }

    /** A readable reference for the document (order TS no., delivery receipt, stock code). */
    protected function reference(SyncDocument $doc): string
    {
        $p = $doc->payload ?? [];

        return match ($doc->source_type) {
            'sale' => 'Order '.($p['ts_no'] ?? $doc->source_id),
            'payment' => 'Payment #'.$doc->source_id.(isset($p['order']['ts_no']) ? ' · order '.$p['order']['ts_no'] : ''),
            'stock_receipt' => 'Delivery '.($p['delivery_receipt'] ?? '—').(isset($p['supplier']) ? ' · '.$p['supplier'] : ''),
            'stock_movement' => ucfirst((string) ($p['event_type'] ?? 'movement')).' · '.($p['code'] ?? $doc->source_id),
            default => $doc->source_type.' '.$doc->source_id,
        };
    }
}
