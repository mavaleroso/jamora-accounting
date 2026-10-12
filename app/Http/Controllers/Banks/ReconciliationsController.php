<?php

namespace App\Http\Controllers\Banks;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\BankReconciliation;
use App\Models\BankTransaction;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ReconciliationsController extends Controller
{
    public function index(Request $request): Response
    {
        $entityId = app(EntityContext::class)->id();

        $reconciliations = BankReconciliation::query()
            ->with('bankAccount:id,code,name,bank_name')
            ->when($entityId, fn ($q) => $q->where('entity_id', $entityId))
            ->orderByDesc('statement_date')
            ->limit(50)
            ->get();

        $bankAccounts = BankAccount::query()
            ->where('is_active', true)
            ->when($entityId, fn ($q) => $q->whereHas('entities', fn ($e) => $e->where('entities.id', $entityId)))
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'bank_name']);

        return Inertia::render('banks/reconciliations/page', [
            'reconciliations' => $reconciliations,
            'bankAccounts' => $bankAccounts,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'bank_account_id' => ['required', 'integer', 'exists:bank_accounts,id'],
            'statement_date' => ['required', 'date'],
            'statement_ending_balance' => ['required', 'numeric'],
        ]);

        BankReconciliation::query()->create([
            ...$data,
            'entity_id' => $entityId,
            'cleared_balance' => 0,
            'difference' => $data['statement_ending_balance'],
            'status' => 'open',
        ]);

        return redirect()->back()->with('status', 'Reconciliation started.');
    }

    public function clearTransaction(Request $request, BankTransaction $bankTransaction): RedirectResponse
    {
        $data = $request->validate([
            'bank_reconciliation_id' => ['nullable', 'integer', 'exists:bank_reconciliations,id'],
            'is_cleared' => ['required', 'boolean'],
        ]);

        $bankTransaction->update([
            'is_cleared' => $data['is_cleared'],
            'cleared_at' => $data['is_cleared'] ? now() : null,
            'bank_reconciliation_id' => $data['bank_reconciliation_id'] ?? $bankTransaction->bank_reconciliation_id,
        ]);

        if ($data['bank_reconciliation_id'] ?? null) {
            $this->recalculateClearedBalance((int) $data['bank_reconciliation_id']);
        }

        return redirect()->back()->with('status', 'Transaction updated.');
    }

    public function complete(Request $request, BankReconciliation $bankReconciliation): RedirectResponse
    {
        $this->recalculateClearedBalance($bankReconciliation->id);

        $bankReconciliation->refresh();

        $bankReconciliation->update([
            'status' => 'reconciled',
            'reconciled_by' => $request->user()->id,
            'reconciled_at' => now(),
            'difference' => (float) $bankReconciliation->statement_ending_balance - (float) $bankReconciliation->cleared_balance,
        ]);

        return redirect()->back()->with('status', 'Reconciliation completed.');
    }

    protected function recalculateClearedBalance(int $reconciliationId): void
    {
        $reconciliation = BankReconciliation::query()->findOrFail($reconciliationId);

        $cleared = (float) BankTransaction::query()
            ->where('bank_reconciliation_id', $reconciliationId)
            ->where('is_cleared', true)
            ->get()
            ->sum(fn (BankTransaction $txn) => $txn->direction === 'in'
                ? (float) $txn->amount
                : -(float) $txn->amount);

        $reconciliation->update([
            'cleared_balance' => round($cleared, 2),
            'difference' => round((float) $reconciliation->statement_ending_balance - $cleared, 2),
        ]);
    }
}
