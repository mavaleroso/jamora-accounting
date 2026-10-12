<?php

namespace App\Http\Controllers\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class CashBankTransactionsController extends Controller
{
    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $bankAccountId = $request->get('bank_account_id');
        $direction = $request->get('direction');
        $status = $request->get('status'); // cleared, uncleared
        $search = trim((string) $request->get('search', ''));
        $startDate = $request->get('start_date');
        $endDate = $request->get('end_date');

        // Bank accounts accessible by this entity
        $bankAccounts = BankAccount::query()
            ->where(function ($q) use ($entityId) {
                $q->where('is_shared', true)
                    ->orWhereHas('entities', fn ($sq) => $sq->where('entities.id', $entityId));
            })
            ->where('is_active', true)
            ->get(['id', 'code', 'name', 'bank_name', 'account_number', 'is_shared']);

        $query = BankTransaction::query()
            ->with(['bankAccount:id,code,name,bank_name', 'journalEntry:id,entry_no'])
            ->where('entity_id', $entityId)
            ->orderByDesc('txn_date')
            ->orderByDesc('id');

        if ($bankAccountId) {
            $query->where('bank_account_id', $bankAccountId);
        }

        if ($direction) {
            $query->where('direction', $direction);
        }

        if ($status === 'cleared') {
            $query->where('is_cleared', true);
        } elseif ($status === 'uncleared') {
            $query->where('is_cleared', false);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                    ->orWhere('reference', 'like', "%{$search}%");
            });
        }

        if ($startDate) {
            $query->whereDate('txn_date', '>=', $startDate);
        }
        if ($endDate) {
            $query->whereDate('txn_date', '<=', $endDate);
        }

        $allEntityTransactions = BankTransaction::query()->where('entity_id', $entityId);
        $totalInflows = (clone $allEntityTransactions)->where('direction', 'in')->sum('amount');
        $totalOutflows = (clone $allEntityTransactions)->where('direction', 'out')->sum('amount');
        $netCashFlow = $totalInflows - $totalOutflows;
        $unclearedCount = (clone $allEntityTransactions)->where('is_cleared', false)->count();

        $transactions = $query->paginate(20)->withQueryString();

        return Inertia::render('accounting/cash-bank/page', [
            'transactions' => $transactions,
            'bankAccounts' => $bankAccounts,
            'summary' => [
                'totalInflows' => (float) $totalInflows,
                'totalOutflows' => (float) $totalOutflows,
                'netCashFlow' => (float) $netCashFlow,
                'unclearedCount' => $unclearedCount,
            ],
            'filters' => [
                'bank_account_id' => $bankAccountId,
                'direction' => $direction,
                'status' => $status,
                'search' => $search,
                'start_date' => $startDate,
                'end_date' => $endDate,
            ],
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();

        $validated = $request->validate([
            'bank_account_id' => ['required', 'exists:bank_accounts,id'],
            'txn_date' => ['required', 'date'],
            'description' => ['required', 'string', 'max:255'],
            'direction' => ['required', 'in:in,out'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'reference' => ['nullable', 'string', 'max:100'],
            'source_type' => ['nullable', 'string', 'max:50'],
        ]);

        DB::transaction(function () use ($validated, $entityId) {
            BankTransaction::create([
                'entity_id' => $entityId,
                'bank_account_id' => $validated['bank_account_id'],
                'txn_date' => $validated['txn_date'],
                'description' => $validated['description'],
                'direction' => $validated['direction'],
                'amount' => $validated['amount'],
                'reference' => $validated['reference'] ?? ('MAN-'.strtoupper(uniqid())),
                'source_type' => $validated['source_type'] ?? 'direct_entry',
                'is_cleared' => false,
            ]);
        });

        return redirect()->back()->with('status', 'Cash/Bank transaction recorded successfully.');
    }
}

