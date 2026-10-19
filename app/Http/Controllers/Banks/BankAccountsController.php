<?php

namespace App\Http\Controllers\Banks;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankReconciliation;
use App\Models\BankTransaction;
use App\Support\ChartOfAccounts;
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
 * The current entity's bank accounts and their registers. Each account belongs to one entity and posts to its
 * own Cash in Bank ledger account, so the register balance and that ledger account must agree.
 */
class BankAccountsController extends Controller
{
    public function index(): Response
    {
        $monthStart = Carbon::now('Asia/Manila')->startOfMonth()->toDateString();

        $accounts = BankAccount::query()
            ->with('glAccount:id,code,name')
            ->orderBy('code')
            ->get()
            ->map(function (BankAccount $account) use ($monthStart) {
                $register = $this->register($account->id);
                $lastRec = BankReconciliation::query()->where('bank_account_id', $account->id)->where('status', 'reconciled')->latest('statement_date')->first();

                return [
                    ...$account->only(['id', 'code', 'name', 'bank_name', 'account_number', 'is_active', 'gl_account_id']),
                    'gl_account' => $account->glAccount?->only(['id', 'code', 'name']),
                    'book_balance' => $this->signedSum(clone $register),
                    'inflows_mtd' => round((float) (clone $register)->where('direction', 'in')->whereDate('txn_date', '>=', $monthStart)->sum('amount'), 2),
                    'outflows_mtd' => round((float) (clone $register)->where('direction', 'out')->whereDate('txn_date', '>=', $monthStart)->sum('amount'), 2),
                    'uncleared_count' => (clone $register)->where('is_cleared', false)->count(),
                    'last_reconciled_date' => $lastRec?->statement_date?->toDateString(),
                ];
            });

        return Inertia::render('banks/accounts/page', [
            'bankAccounts' => $accounts,
            'glAccounts' => $this->ledgerOptions(),
            'entityName' => app(EntityContext::class)->current()?->name,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $account = DB::transaction(function () use ($request) {
            $account = BankAccount::query()->create($this->validated($request));
            ChartOfAccounts::ensureBankLedger($account);

            return $account;
        });

        return back()->with('status', 'Bank account '.$account->code.' added with its own ledger account.');
    }

    public function update(Request $request, BankAccount $bankAccount): RedirectResponse
    {
        $this->authorizeAccount($bankAccount);
        $bankAccount->update($this->validated($request, $bankAccount));
        ChartOfAccounts::ensureBankLedger($bankAccount->fresh());

        return back()->with('status', 'Bank account '.$bankAccount->code.' updated.');
    }

    public function show(Request $request, BankAccount $bankAccount): Response
    {
        $this->authorizeAccount($bankAccount);
        $from = $request->get('date_from') ?: Carbon::now('Asia/Manila')->startOfMonth()->toDateString();
        $to = $request->get('date_to') ?: Carbon::now('Asia/Manila')->toDateString();

        $base = $this->register($bankAccount->id);
        $opening = $this->signedSum((clone $base)->whereDate('txn_date', '<', $from));

        $running = $opening;
        $lines = (clone $base)
            ->with('journalEntry:id,entry_no')
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
                    'journal_entry' => $t->journalEntry?->only(['id', 'entry_no']),
                ];
            });

        return Inertia::render('banks/accounts/show/page', [
            'account' => $bankAccount->load('glAccount:id,code,name'),
            'lines' => $lines,
            'opening' => $opening,
            'closing' => $running,
            'filters' => ['date_from' => $from, 'date_to' => $to],
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
            // Leave empty to have the account's own Cash in Bank sub-account created.
            'gl_account_id' => ['nullable', 'integer', Rule::exists('accounts', 'id')->where('entity_id', $entityId)],
            'is_active' => ['boolean'],
        ]);
    }

    /** Cash in Bank accounts of this entity that a bank account may post to. */
    protected function ledgerOptions()
    {
        return Account::query()
            ->where('is_active', true)
            ->where(fn ($q) => $q->where('code', 'like', '101%')->orWhere('code', 'like', '1010-%'))
            ->orderBy('code')
            ->get(['id', 'code', 'name']);
    }

    /** Route binding runs before the entity is set, so check ownership explicitly. */
    protected function authorizeAccount(BankAccount $bankAccount): void
    {
        $entityId = app(EntityContext::class)->id();

        abort_unless($entityId === null || (int) $bankAccount->entity_id === (int) $entityId, 404);
    }

    protected function register(int $bankAccountId): Builder
    {
        return BankTransaction::query()->withoutGlobalScope('entity')->where('bank_account_id', $bankAccountId);
    }

    protected function signedSum(Builder $query): float
    {
        return round((float) $query->sum(DB::raw("case when direction = 'in' then amount else -amount end")), 2);
    }
}
