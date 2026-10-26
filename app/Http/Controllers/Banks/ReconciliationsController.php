<?php

namespace App\Http\Controllers\Banks;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\BankReconciliation;
use App\Models\BankTransaction;
use App\Support\EntityContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Manual bank reconciliation, one statement at a time per bank account (five accounts, per the proposal).
 *
 * A statement reconciles the whole account: for an account shared between companies, every company's register
 * lines, each tagged with its company. Any company using the account can open its reconciliations.
 *
 *   cleared balance = beginning balance (previous statement's ending balance) + cleared receipts − cleared payments
 *   difference      = statement ending balance − cleared balance   → must be 0.00 to complete
 */
class ReconciliationsController extends Controller
{
    public function index(Request $request): Response|RedirectResponse
    {
        // Bank Accounts lists every company's accounts: reconciling one of another company opens that company.
        if ($switched = $this->openAccountCompany($request)) {
            return $switched;
        }

        $accounts = $this->accessibleAccounts()->get(['id', 'code', 'name', 'bank_name', 'account_number']);
        $accountIds = $accounts->pluck('id');
        $accountFilter = $request->integer('bank_account_id') ?: null;

        $reconciliations = BankReconciliation::query()
            ->with(['bankAccount:id,code,name,bank_name', 'reconciledBy:id,firstname,middlename,lastname,username'])
            ->whereIn('bank_account_id', $accountFilter ? [$accountFilter] : $accountIds)
            ->orderByRaw("case when status = 'open' then 0 else 1 end")
            ->orderByDesc('statement_date')
            ->paginate($this->perPage($request))
            ->withQueryString();

        // Status board: where each account stands today.
        $board = $accounts->map(function (BankAccount $account) {
            $last = BankReconciliation::query()->where('bank_account_id', $account->id)->where('status', 'reconciled')->latest('statement_date')->first();
            $open = BankReconciliation::query()->where('bank_account_id', $account->id)->where('status', 'open')->first();

            return [
                'id' => $account->id,
                'code' => $account->code,
                'name' => $account->name,
                'bank_name' => $account->bank_name,
                'last_reconciled_date' => $last?->statement_date?->toDateString(),
                'last_reconciled_balance' => $last ? (float) $last->statement_ending_balance : null,
                'open_reconciliation_id' => $open?->id,
                'uncleared_count' => $this->registerQuery($account->id)->where('is_cleared', false)->count(),
            ];
        });

        return Inertia::render('banks/reconciliations/page', [
            'reconciliations' => $reconciliations,
            'accounts' => $board,
            'filters' => ['bank_account_id' => $accountFilter],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'bank_account_id' => ['required', 'integer', 'exists:bank_accounts,id'],
            'statement_date' => ['required', 'date'],
            'statement_ending_balance' => ['required', 'numeric'],
        ]);

        $account = $this->accessibleAccounts()->findOrFail($data['bank_account_id']);

        if (BankReconciliation::query()->where('bank_account_id', $account->id)->where('status', 'open')->exists()) {
            throw ValidationException::withMessages(['bank_account_id' => 'Finish or discard the open reconciliation for this account first.']);
        }

        $previous = BankReconciliation::query()->where('bank_account_id', $account->id)->where('status', 'reconciled')->latest('statement_date')->first();
        if ($previous && $data['statement_date'] <= $previous->statement_date->toDateString()) {
            throw ValidationException::withMessages([
                'statement_date' => 'Statement date must be after the last reconciled statement ('.$previous->statement_date->format('M j, Y').').',
            ]);
        }

        $beginning = $previous ? (float) $previous->statement_ending_balance : 0.0;

        $reconciliation = BankReconciliation::query()->create([
            'bank_account_id' => $account->id,
            'entity_id' => app(EntityContext::class)->id(),
            'statement_date' => $data['statement_date'],
            'beginning_balance' => $beginning,
            'statement_ending_balance' => $data['statement_ending_balance'],
            'cleared_balance' => $beginning,
            'difference' => round((float) $data['statement_ending_balance'] - $beginning, 2),
            'status' => 'open',
        ]);

        return redirect()->route('banks.reconciliations.show', $reconciliation)->with('status', 'Reconciliation started. Tick the items that appear on the statement.');
    }

    public function show(BankReconciliation $bankReconciliation): Response
    {
        $this->authorizeAccount($bankReconciliation->bank_account_id);
        $bankReconciliation->load(['bankAccount:id,code,name,bank_name,account_number', 'reconciledBy:id,firstname,middlename,lastname,username']);

        $items = $this->registerQuery($bankReconciliation->bank_account_id)
            ->where(function (Builder $q) use ($bankReconciliation) {
                $q->where('bank_reconciliation_id', $bankReconciliation->id);
                // An open statement also offers every still-uncleared item dated on or before its statement date.
                if ($bankReconciliation->status === 'open') {
                    $q->orWhere(fn ($q) => $q->where('is_cleared', false)->whereDate('txn_date', '<=', $bankReconciliation->statement_date));
                }
            })
            ->orderBy('txn_date')
            ->orderBy('id')
            ->get(['id', 'entity_id', 'txn_date', 'description', 'reference', 'direction', 'amount', 'is_cleared', 'bank_reconciliation_id', 'source_type']);

        // The companies sharing the account: each item is tagged with the one whose books it is in.
        $companies = $bankReconciliation->bankAccount?->companies()->orderBy('name')->pluck('entities.name', 'entities.id') ?? collect();

        return Inertia::render('banks/reconciliations/show/page', [
            'reconciliation' => $bankReconciliation,
            'isShared' => $companies->count() > 1,
            'items' => $items->map(fn (BankTransaction $t) => [
                ...$t->toArray(),
                'company' => $t->entity_id ? ['id' => (int) $t->entity_id, 'name' => $companies[$t->entity_id] ?? null] : null,
            ]),
            'laterUnclearedCount' => $this->registerQuery($bankReconciliation->bank_account_id)
                ->where('is_cleared', false)
                ->whereDate('txn_date', '>', $bankReconciliation->statement_date)
                ->count(),
        ]);
    }

    /**
     * Tick or untick statement items. Accepts many ids so "clear all deposits" is a single request.
     */
    public function toggleItems(Request $request, BankReconciliation $bankReconciliation): RedirectResponse
    {
        $this->authorizeAccount($bankReconciliation->bank_account_id);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
            'cleared' => ['required', 'boolean'],
        ]);

        if ($bankReconciliation->status !== 'open') {
            throw ValidationException::withMessages(['ids' => 'This reconciliation is already completed.']);
        }

        DB::transaction(function () use ($data, $bankReconciliation) {
            $query = $this->registerQuery($bankReconciliation->bank_account_id)->whereIn('id', $data['ids']);

            if ($data['cleared']) {
                $query->where('is_cleared', false)
                    ->whereDate('txn_date', '<=', $bankReconciliation->statement_date)
                    ->update(['is_cleared' => true, 'cleared_at' => now(), 'bank_reconciliation_id' => $bankReconciliation->id]);
            } else {
                $query->where('bank_reconciliation_id', $bankReconciliation->id)
                    ->update(['is_cleared' => false, 'cleared_at' => null, 'bank_reconciliation_id' => null]);
            }

            $this->recalculate($bankReconciliation);
        });

        return back();
    }

    public function complete(Request $request, BankReconciliation $bankReconciliation): RedirectResponse
    {
        $this->authorizeAccount($bankReconciliation->bank_account_id);

        if ($bankReconciliation->status !== 'open') {
            return back();
        }

        $this->recalculate($bankReconciliation);
        $bankReconciliation->refresh();

        if (abs((float) $bankReconciliation->difference) >= 0.005) {
            throw ValidationException::withMessages([
                'difference' => 'The difference must be 0.00 before the reconciliation can be completed (currently '.number_format((float) $bankReconciliation->difference, 2).').',
            ]);
        }

        $bankReconciliation->update([
            'status' => 'reconciled',
            'reconciled_by' => $request->user()->id,
            'reconciled_at' => now(),
        ]);

        return redirect()->route('banks.reconciliations.index')->with('status', $bankReconciliation->bankAccount?->name.' reconciled to '.$bankReconciliation->statement_date->format('M j, Y').'.');
    }

    /** Discard an unfinished reconciliation and release its ticked items. */
    public function destroy(BankReconciliation $bankReconciliation): RedirectResponse
    {
        $this->authorizeAccount($bankReconciliation->bank_account_id);
        abort_unless($bankReconciliation->status === 'open', 422, 'Completed reconciliations cannot be discarded.');

        DB::transaction(function () use ($bankReconciliation) {
            $this->registerQuery($bankReconciliation->bank_account_id)
                ->where('bank_reconciliation_id', $bankReconciliation->id)
                ->update(['is_cleared' => false, 'cleared_at' => null, 'bank_reconciliation_id' => null]);
            $bankReconciliation->delete();
        });

        return redirect()->route('banks.reconciliations.index')->with('status', 'Reconciliation discarded.');
    }

    protected function recalculate(BankReconciliation $reconciliation): void
    {
        $net = (float) $this->registerQuery($reconciliation->bank_account_id)
            ->where('bank_reconciliation_id', $reconciliation->id)
            ->where('is_cleared', true)
            ->sum(DB::raw("case when direction = 'in' then amount else -amount end"));

        $cleared = round((float) $reconciliation->beginning_balance + $net, 2);

        $reconciliation->update([
            'cleared_balance' => $cleared,
            'difference' => round((float) $reconciliation->statement_ending_balance - $cleared, 2),
        ]);
    }

    /** Register lines for an account: every company's, for a shared account. */
    protected function registerQuery(int $bankAccountId): Builder
    {
        return BankTransaction::query()->withoutGlobalScope('entity')->where('bank_account_id', $bankAccountId);
    }

    /**
     * Switch to the holder of the requested bank account when the current company does not use it but the user can
     * open the holder, and reload.
     */
    protected function openAccountCompany(Request $request): ?RedirectResponse
    {
        $context = app(EntityContext::class);
        $account = $request->integer('bank_account_id')
            ? BankAccount::query()->withoutGlobalScope('entity')->with('entity')->find($request->integer('bank_account_id'))
            : null;

        if (! $account?->entity || ($context->id() && $account->allowsEntity((int) $context->id()))
            || ! $request->user()->canOpenEntity((int) $account->entity_id)) {
            return null;
        }

        $context->set($account->entity);

        return redirect()->to($request->fullUrl());
    }

    protected function accessibleAccounts(): Builder
    {
        return BankAccount::query()->active()->orderBy('code');
    }

    protected function authorizeAccount(int $bankAccountId): void
    {
        abort_unless($this->accessibleAccounts()->whereKey($bankAccountId)->exists(), 404);
    }
}
