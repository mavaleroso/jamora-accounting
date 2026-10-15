<?php

namespace App\Http\Controllers\Banks;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankReconciliation;
use App\Models\BankTransaction;
use App\Models\Entity;
use App\Support\EntityContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Bank accounts and their registers. Shared accounts (used by JAM Opticus and A. Jamora Optical) carry
 * entity-tagged lines; the cash position is the whole account, with each entity's share shown alongside.
 */
class BankAccountsController extends Controller
{
    public function index(): Response
    {
        $entityId = app(EntityContext::class)->id();
        $monthStart = Carbon::now('Asia/Manila')->startOfMonth()->toDateString();

        $accounts = $this->accessibleAccounts()
            ->with(['glAccount:id,code,name', 'entities:id,code,name'])
            ->get()
            ->map(function (BankAccount $account) use ($entityId, $monthStart) {
                $register = $this->register($account->id);
                $lastRec = BankReconciliation::query()->where('bank_account_id', $account->id)->where('status', 'reconciled')->latest('statement_date')->first();

                return [
                    ...$account->only(['id', 'code', 'name', 'bank_name', 'account_number', 'is_shared', 'is_active', 'gl_account_id']),
                    'gl_account' => $account->glAccount?->only(['id', 'code', 'name']),
                    'entities' => $account->entities->map->only(['id', 'code', 'name'])->values(),
                    'book_balance' => $this->signedSum(clone $register),
                    'entity_balance' => $this->signedSum((clone $register)->where('entity_id', $entityId)),
                    'inflows_mtd' => round((float) (clone $register)->where('direction', 'in')->whereDate('txn_date', '>=', $monthStart)->sum('amount'), 2),
                    'outflows_mtd' => round((float) (clone $register)->where('direction', 'out')->whereDate('txn_date', '>=', $monthStart)->sum('amount'), 2),
                    'uncleared_count' => (clone $register)->where('is_cleared', false)->count(),
                    'last_reconciled_date' => $lastRec?->statement_date?->toDateString(),
                ];
            });

        return Inertia::render('banks/accounts/page', [
            'bankAccounts' => $accounts,
            'entities' => Entity::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'glAccounts' => Account::query()->where('is_active', true)->where('code', 'like', '10%')->orderBy('code')->get(['id', 'code', 'name']),
            'currentEntityId' => $entityId,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);
        $account = BankAccount::query()->create(collect($data)->except('entity_ids')->all());
        $account->entities()->sync($data['entity_ids']);

        return back()->with('status', 'Bank account '.$account->code.' added.');
    }

    public function update(Request $request, BankAccount $bankAccount): RedirectResponse
    {
        $data = $this->validated($request, $bankAccount);
        $bankAccount->update(collect($data)->except('entity_ids')->all());
        $bankAccount->entities()->sync($data['entity_ids']);

        return back()->with('status', 'Bank account '.$bankAccount->code.' updated.');
    }

    public function show(Request $request, BankAccount $bankAccount): Response
    {
        abort_unless($this->accessibleAccounts()->whereKey($bankAccount->id)->exists(), 404);

        $from = $request->get('date_from') ?: Carbon::now('Asia/Manila')->startOfMonth()->toDateString();
        $to = $request->get('date_to') ?: Carbon::now('Asia/Manila')->toDateString();
        $entityFilter = $request->integer('entity_id') ?: null;

        $base = $this->register($bankAccount->id)->when($entityFilter, fn ($q) => $q->where('entity_id', $entityFilter));
        $opening = $this->signedSum((clone $base)->whereDate('txn_date', '<', $from));

        $running = $opening;
        $lines = (clone $base)
            ->with(['entity:id,code,name', 'journalEntry:id,entry_no'])
            ->whereDate('txn_date', '>=', $from)->whereDate('txn_date', '<=', $to)
            ->orderBy('txn_date')
            ->orderBy('id')
            ->get()
            ->map(function (BankTransaction $t) use (&$running) {
                $running = round($running + ($t->direction === 'in' ? 1 : -1) * (float) $t->amount, 2);

                return [
                    'id' => $t->id,
                    'txn_date' => $t->txn_date->toDateString(),
                    'description' => $t->description,
                    'reference' => $t->reference,
                    'source_type' => $t->source_type,
                    'direction' => $t->direction,
                    'amount' => (float) $t->amount,
                    'balance' => $running,
                    'is_cleared' => $t->is_cleared,
                    'entity' => $t->entity?->only(['id', 'code', 'name']),
                    'journal_entry' => $t->journalEntry?->only(['id', 'entry_no']),
                ];
            });

        // Disbursements by entity: what each entity drew from this (possibly shared) account in the period.
        $byEntity = (clone $base)
            ->whereDate('txn_date', '>=', $from)->whereDate('txn_date', '<=', $to)
            ->select('entity_id', DB::raw("sum(case when direction = 'in' then amount else 0 end) as inflows"), DB::raw("sum(case when direction = 'out' then amount else 0 end) as outflows"))
            ->groupBy('entity_id')
            ->get()
            ->map(fn ($row) => [
                'entity' => Entity::query()->find($row->entity_id)?->only(['id', 'code', 'name']),
                'inflows' => round((float) $row->inflows, 2),
                'outflows' => round((float) $row->outflows, 2),
            ]);

        return Inertia::render('banks/accounts/show/page', [
            'account' => $bankAccount->load(['entities:id,code,name', 'glAccount:id,code,name']),
            'lines' => $lines,
            'opening' => $opening,
            'closing' => $running,
            'byEntity' => $byEntity,
            'filters' => ['date_from' => $from, 'date_to' => $to, 'entity_id' => $entityFilter],
        ]);
    }

    protected function validated(Request $request, ?BankAccount $account = null): array
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:30', Rule::unique('bank_accounts', 'code')->ignore($account?->id)],
            'name' => ['required', 'string', 'max:120'],
            'bank_name' => ['required', 'string', 'max:120'],
            'account_number' => ['nullable', 'string', 'max:60'],
            'gl_account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'is_shared' => ['boolean'],
            'is_active' => ['boolean'],
            'entity_ids' => ['required', 'array', 'min:1'],
            'entity_ids.*' => ['integer', 'exists:entities,id'],
        ], ['entity_ids.required' => 'Select at least one entity that uses this account.']);

        // A dedicated account belongs to exactly one entity; shared accounts need two or more.
        $data['is_shared'] = count($data['entity_ids']) > 1;

        return $data;
    }

    protected function register(int $bankAccountId): Builder
    {
        return BankTransaction::query()->withoutGlobalScope('entity')->where('bank_account_id', $bankAccountId);
    }

    protected function signedSum(Builder $query): float
    {
        return round((float) $query->sum(DB::raw("case when direction = 'in' then amount else -amount end")), 2);
    }

    protected function accessibleAccounts(): Builder
    {
        $entityId = app(EntityContext::class)->id();

        return BankAccount::query()
            ->when($entityId, fn ($q) => $q->whereHas('entities', fn ($e) => $e->where('entities.id', $entityId)))
            ->orderBy('code');
    }
}
