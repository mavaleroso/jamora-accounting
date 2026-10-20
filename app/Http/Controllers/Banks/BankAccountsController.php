<?php

namespace App\Http\Controllers\Banks;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankReconciliation;
use App\Models\BankTransaction;
use App\Models\Employee;
use App\Models\Entity;
use App\Support\ChartOfAccounts;
use App\Support\EntityContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The bank accounts of every company (entity) the user can open, and their registers. Per the proposal, an account is
 * held by one company and may be shared with others (four shared between JAM Opticus and A. Jamora Optical, one
 * dedicated to AL Jamora Optical). Each company using an account posts to its own Cash in Bank ledger account for it,
 * and each register line is tagged with its company: a company's lines must agree with its ledger, and the whole
 * register with the bank statement.
 */
class BankAccountsController extends Controller
{
    public function index(Request $request): Response
    {
        $monthStart = Carbon::now('Asia/Manila')->startOfMonth()->toDateString();
        $companies = $this->companies($request);

        $accounts = $this->visible($request)
            ->with('entity:id,code,name')
            ->orderBy(Entity::query()->select('name')->whereColumn('entities.id', 'bank_accounts.entity_id'))
            ->orderBy('code')
            ->get()
            ->map(function (BankAccount $account) use ($monthStart) {
                $register = $this->register($account->id);
                $lastRec = BankReconciliation::query()->where('bank_account_id', $account->id)->where('status', 'reconciled')->latest('statement_date')->first();
                $shares = $this->shares($account);

                return [
                    ...$account->only(['id', 'entity_id', 'code', 'name', 'bank_name', 'account_number', 'is_active', 'gl_account_id']),
                    'company' => $account->entity?->only(['id', 'code', 'name']),
                    'companies' => $shares,
                    'is_shared' => $shares->count() > 1,
                    'gl_account' => $shares->firstWhere('is_holder', true)['ledger'] ?? null,
                    'book_balance' => $this->signedSum(clone $register),
                    'inflows_mtd' => round((float) (clone $register)->where('direction', 'in')->whereDate('txn_date', '>=', $monthStart)->sum('amount'), 2),
                    'outflows_mtd' => round((float) (clone $register)->where('direction', 'out')->whereDate('txn_date', '>=', $monthStart)->sum('amount'), 2),
                    'uncleared_count' => (clone $register)->where('is_cleared', false)->count(),
                    'last_reconciled_date' => $lastRec?->statement_date?->toDateString(),
                ];
            });

        return Inertia::render('banks/accounts/page', [
            'bankAccounts' => $accounts,
            'glAccounts' => $this->ledgerOptions($companies->pluck('id')->all()),
            'companies' => $companies,
            // Where a new account goes unless another company is picked.
            'currentCompanyId' => app(EntityContext::class)->id(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $company = $this->companyFor($request);
        $sharedWith = $this->sharedWith($request, $company->id);

        // Validation, the account and the holder's ledger belong to the holder; each company sharing it gets its own.
        $account = app(EntityContext::class)->runAs($company, fn () => DB::transaction(function () use ($request, $sharedWith) {
            $account = BankAccount::query()->create($this->validated($request));
            ChartOfAccounts::ensureBankLedger($account);
            foreach ($sharedWith as $entityId) {
                ChartOfAccounts::ensureBankLedger($account, $entityId);
            }

            return $account;
        }));

        $with = $sharedWith ? ', shared with '.Entity::query()->whereIn('id', $sharedWith)->orderBy('name')->pluck('name')->join(', ', ' and ') : '';

        return back()->with('status', "Bank account {$account->code} added to {$company->name}{$with}, each with its own ledger account.");
    }

    public function update(Request $request, int $bankAccount): RedirectResponse
    {
        $bankAccount = $this->find($request, $bankAccount);
        $sharedWith = $this->sharedWith($request, (int) $bankAccount->entity_id);

        app(EntityContext::class)->runAs($bankAccount->entity, fn () => DB::transaction(function () use ($request, $bankAccount, $sharedWith) {
            $bankAccount->update($this->validated($request, $bankAccount));
            ChartOfAccounts::ensureBankLedger($bankAccount->fresh());

            if ($request->has('shared_with')) {
                $this->syncSharing($request, $bankAccount, $sharedWith);
            }
        }));

        return back()->with('status', 'Bank account '.$bankAccount->code.' updated.');
    }

    public function show(Request $request, int $bankAccount): Response
    {
        $bankAccount = $this->find($request, $bankAccount);
        $from = $request->get('date_from') ?: Carbon::now('Asia/Manila')->startOfMonth()->toDateString();
        $to = $request->get('date_to') ?: Carbon::now('Asia/Manila')->toDateString();
        $shares = $this->shares($bankAccount, $to);
        // One company's lines of a shared account, or the whole register.
        $companyId = $request->integer('company') ?: null;
        if ($companyId && ! $shares->contains('id', $companyId)) {
            $companyId = null;
        }

        $base = $this->register($bankAccount->id)->when($companyId, fn (Builder $q) => $q->where('entity_id', $companyId));
        $opening = $this->signedSum((clone $base)->whereDate('txn_date', '<', $from));
        $names = $shares->pluck('name', 'id');

        $running = $opening;
        $lines = (clone $base)
            ->with('journalEntry:id,entry_no')
            ->whereDate('txn_date', '>=', $from)->whereDate('txn_date', '<=', $to)
            ->orderBy('txn_date')
            ->orderBy('id')
            ->get()
            ->map(function (BankTransaction $t) use (&$running, $names) {
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
                    'journal_entry' => $t->journalEntry?->only(['id', 'entry_no']),
                    'company' => $t->entity_id ? ['id' => (int) $t->entity_id, 'name' => $names[$t->entity_id] ?? null] : null,
                ];
            });

        return Inertia::render('banks/accounts/show/page', [
            'account' => [
                ...$bankAccount->only(['id', 'code', 'name', 'bank_name', 'account_number']),
                'entity' => $bankAccount->entity?->only(['id', 'code', 'name']),
                'gl_account' => $shares->firstWhere('is_holder', true)['ledger'] ?? null,
            ],
            'companies' => $shares,
            'lines' => $lines,
            'opening' => $opening,
            'closing' => $running,
            'filters' => ['date_from' => $from, 'date_to' => $to, 'company' => $companyId],
        ]);
    }

    protected function validated(Request $request, ?BankAccount $account = null): array
    {
        $entityId = app(EntityContext::class)->id();

        return $request->validate([
            'code' => ['required', 'string', 'max:30', Rule::unique('bank_accounts', 'code')->ignore($account?->id)],
            'name' => ['required', 'string', 'max:120'],
            'bank_name' => ['required', 'string', 'max:120'],
            'account_number' => ['nullable', 'string', 'max:60'],
            // The holder's ledger. Leave empty to have the account's own Cash in Bank sub-account created.
            'gl_account_id' => ['nullable', 'integer', Rule::exists('accounts', 'id')->where('entity_id', $entityId)],
            'is_active' => ['boolean'],
        ]);
    }

    /**
     * The other companies the account is shared with, from the form: companies the user can open, never the holder.
     *
     * @return list<int>
     */
    protected function sharedWith(Request $request, int $holderId): array
    {
        $ids = collect($request->validate([
            'shared_with' => ['nullable', 'array'],
            'shared_with.*' => ['integer'],
        ])['shared_with'] ?? [])->map(fn ($id) => (int) $id)->reject(fn (int $id) => $id === $holderId)->unique()->values();

        $allowed = $this->companies($request)->pluck('id');
        if ($ids->diff($allowed)->isNotEmpty()) {
            throw ValidationException::withMessages(['shared_with' => 'Share only with companies you have access to.']);
        }

        return $ids->all();
    }

    /**
     * Share the account with the companies picked, and stop sharing it with the others the user can open, unless one
     * has used it (register lines, postings to its ledger account, or employees paid from it). A company it stops
     * being shared with loses its unused ledger account for it, so sharing again starts clean.
     *
     * @param  list<int>  $sharedWith
     */
    protected function syncSharing(Request $request, BankAccount $account, array $sharedWith): void
    {
        foreach ($sharedWith as $entityId) {
            ChartOfAccounts::ensureBankLedger($account, $entityId);
        }

        $removed = $account->companies()
            ->whereIn('entities.id', $this->companies($request)->pluck('id'))
            ->where('entities.id', '!=', $account->entity_id)
            ->whereNotIn('entities.id', $sharedWith)
            ->get();

        foreach ($removed as $company) {
            $ledgerId = $company->pivot->gl_account_id;
            $used = $this->register($account->id)->where('entity_id', $company->id)->exists()
                || ($ledgerId && DB::table('journal_entry_lines')->where('account_id', $ledgerId)->exists())
                || Employee::query()->withoutGlobalScope('entity')->where('entity_id', $company->id)->where('charge_bank_account_id', $account->id)->exists();
            if ($used) {
                throw ValidationException::withMessages([
                    'shared_with' => "{$company->name} has already used this account, so it stays shared with it.",
                ]);
            }

            $account->companies()->detach($company->id);
            if ($ledgerId && ! DB::table('bank_account_entity')->where('gl_account_id', $ledgerId)->exists()) {
                Account::query()->withoutGlobalScope('entity')->whereKey($ledgerId)->first()?->forceDelete();
            }
        }
    }

    /**
     * Every company using the account, the holder first, each with its own ledger account and its share of the
     * register balance (as of $asOf when given).
     *
     * @return Collection<int, array{id: int, code: string, name: string, is_holder: bool, ledger: array{id: int, code: string, name: string}|null, balance: float}>
     */
    protected function shares(BankAccount $account, ?string $asOf = null): Collection
    {
        $companies = $account->companies()->orderBy('name')->get(['entities.id', 'entities.code', 'entities.name']);
        $ledgers = Account::query()->withoutGlobalScope('entity')->whereIn('id', $companies->pluck('pivot.gl_account_id')->filter())->get(['id', 'code', 'name'])->keyBy('id');
        $balances = $this->register($account->id)
            ->when($asOf, fn (Builder $q) => $q->whereDate('txn_date', '<=', $asOf))
            ->groupBy('entity_id')
            ->select('entity_id', DB::raw("sum(case when direction = 'in' then amount else -amount end) as balance"))
            ->pluck('balance', 'entity_id');

        return $companies
            ->map(fn (Entity $c) => [
                'id' => (int) $c->id,
                'code' => $c->code,
                'name' => $c->name,
                'is_holder' => (int) $c->id === (int) $account->entity_id,
                'ledger' => $ledgers->get($c->pivot->gl_account_id)?->only(['id', 'code', 'name']),
                'balance' => round((float) ($balances[$c->id] ?? 0), 2),
            ])
            ->sortByDesc('is_holder')
            ->values();
    }

    /**
     * Companies (entities) the user can open: the page lists the bank accounts they hold or share.
     *
     * @return Collection<int, array{id: int, code: string, name: string}>
     */
    protected function companies(Request $request): Collection
    {
        return $request->user()->accessibleEntities()->orderBy('entities.name')->get()
            ->map(fn (Entity $e) => ['id' => $e->id, 'code' => $e->code, 'name' => $e->name])
            ->values();
    }

    /**
     * @return Builder<BankAccount>
     */
    protected function visible(Request $request): Builder
    {
        $ids = $this->companies($request)->pluck('id');

        return BankAccount::query()->withoutGlobalScope('entity')->whereHas('companies', fn (Builder $q) => $q->whereIn('entities.id', $ids));
    }

    /**
     * The company a new account is added to: the one picked in the form, else the current one.
     */
    protected function companyFor(Request $request): Entity
    {
        $id = $request->filled('entity_id') ? (int) $request->input('entity_id') : app(EntityContext::class)->id();
        $company = $id ? $request->user()->accessibleEntities()->find($id) : null;

        if (! $company) {
            throw ValidationException::withMessages(['entity_id' => 'Choose a company you have access to.']);
        }

        return $company;
    }

    /**
     * Cash in Bank accounts a bank account may post to, of each company listed; the form offers the chosen company's.
     *
     * @param  list<int>  $companyIds
     */
    protected function ledgerOptions(array $companyIds)
    {
        return Account::query()
            ->withoutGlobalScope('entity')
            ->whereIn('entity_id', $companyIds)
            ->where('is_active', true)
            ->where(fn ($q) => $q->where('code', 'like', '101%')->orWhere('code', 'like', '1010-%'))
            ->orderBy('code')
            ->get(['id', 'entity_id', 'code', 'name']);
    }

    /**
     * An account any company the user can open holds or shares, whichever one is current (route model binding would
     * only find the current company's).
     */
    protected function find(Request $request, int $id): BankAccount
    {
        return $this->visible($request)->with('entity')->findOrFail($id);
    }

    /** The whole register of an account: every company's lines. */
    protected function register(int $bankAccountId): Builder
    {
        return BankTransaction::query()->withoutGlobalScope('entity')->where('bank_account_id', $bankAccountId);
    }

    protected function signedSum(Builder $query): float
    {
        return round((float) $query->sum(DB::raw("case when direction = 'in' then amount else -amount end")), 2);
    }
}
