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
 * Manual bank reconciliation, one statement at a time per bank account.
 *
 * Reconciliation is per account, not per entity: a shared account's statement covers every entity that uses
 * it, so the workspace lists all of that account's register lines (tagged with their entity).
 *
 *   cleared balance = beginning balance (previous statement's ending balance) + cleared receipts − cleared payments
 *   difference      = statement ending balance − cleared balance   → must be 0.00 to complete
 */
class ReconciliationsController extends Controller
{
    public function index(Request $request): Response
    {
        $accounts = $this->accessibleAccounts()->get(['id', 'code', 'name', 'bank_name', 'account_number', 'is_shared']);
        $accountIds = $accounts->pluck('id');
        $accountFilter = $request->integer('bank_account_id') ?: null;

        $reconciliations = BankReconciliation::query()
            ->with(['bankAccount:id,code,name,bank_name', 'reconciledBy:id,name'])
            ->whereIn('bank_account_id', $accountFilter ? [$accountFilter] : $accountIds)
            ->orderByRaw("case when status = 'open' then 0 else 1 end")
            ->orderByDesc('statement_date')
            ->paginate(15)
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
                'is_shared' => $account->is_shared,
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
        $bankReconciliation->load(['bankAccount:id,code,name,bank_name,account_number,is_shared', 'reconciledBy:id,name']);

        $items = $this->registerQuery($bankReconciliation->bank_account_id)
            ->with('entity:id,code,name')
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

        return Inertia::render('banks/reconciliations/show/page', [
            'reconciliation' => $bankReconciliation,
            'items' => $items,
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

    /** Register lines for an account across every entity that shares it. */
    protected function registerQuery(int $bankAccountId): Builder
    {
        return BankTransaction::query()->withoutGlobalScope('entity')->where('bank_account_id', $bankAccountId);
    }

    protected function accessibleAccounts(): Builder
    {
        $entityId = app(EntityContext::class)->id();

        return BankAccount::query()
            ->where('is_active', true)
            ->when($entityId, fn ($q) => $q->whereHas('entities', fn ($e) => $e->where('entities.id', $entityId)))
            ->orderBy('code');
    }

    protected function authorizeAccount(int $bankAccountId): void
    {
        abort_unless($this->accessibleAccounts()->whereKey($bankAccountId)->exists(), 404);
    }
}
