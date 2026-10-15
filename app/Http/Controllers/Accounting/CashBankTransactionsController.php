<?php

namespace App\Http\Controllers\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\Journal;
use App\Models\JournalEntryLine;
use App\Services\Accounting\CashMovementService;
use App\Services\Accounting\LedgerService;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Cash book: every journal line that moves a cash or bank account, whatever produced it (collections,
 * deposits, bill payments, payroll, direct receipts and payments). Direct receipts and payments are
 * recorded here without a debit/credit form — the user picks what the money was for and the entry posts
 * itself. Collections against invoices and payments of bills belong on those documents instead.
 */
class CashBankTransactionsController extends Controller
{
    /** Accounts that must be settled through their own documents, never a direct cash entry. */
    protected const DOCUMENT_CONTROLLED = ['1100', '2000', '2300'];

    public function __construct(
        protected CashMovementService $cash,
        protected LedgerService $ledger,
    ) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $cashAccounts = $this->cashAccounts();
        $filters = [
            'search' => trim((string) $request->get('search', '')),
            'account_id' => $request->integer('account_id') ?: null,
            'direction' => $request->get('direction'),
            'status' => $request->get('status'),
            'date_from' => $request->get('date_from') ?: Carbon::now('Asia/Manila')->startOfMonth()->toDateString(),
            'date_to' => $request->get('date_to') ?: Carbon::now('Asia/Manila')->toDateString(),
        ];

        $accountIds = $filters['account_id'] ? [$filters['account_id']] : $cashAccounts->pluck('id')->all();

        $base = JournalEntryLine::query()
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->where('journal_entries.entity_id', $entityId)
            ->whereNull('journal_entries.deleted_at')
            ->where('journal_entries.status', '!=', 'void')
            ->whereIn('journal_entry_lines.account_id', $accountIds)
            ->whereDate('journal_entries.entry_date', '>=', $filters['date_from'])
            ->whereDate('journal_entries.entry_date', '<=', $filters['date_to']);

        $filtered = (clone $base)
            ->when($filters['direction'] === 'in', fn ($q) => $q->where('journal_entry_lines.debit', '>', 0))
            ->when($filters['direction'] === 'out', fn ($q) => $q->where('journal_entry_lines.credit', '>', 0))
            ->when(in_array($filters['status'], ['draft', 'posted'], true), fn ($q) => $q->where('journal_entries.status', $filters['status']))
            ->when($filters['search'] !== '', fn ($q) => $q->where(function ($q) use ($filters) {
                $term = "%{$filters['search']}%";
                $q->where('journal_entries.memo', 'like', $term)
                    ->orWhere('journal_entries.reference', 'like', $term)
                    ->orWhere('journal_entries.entry_no', 'like', $term)
                    ->orWhere('journal_entry_lines.memo', 'like', $term);
            }));

        $page = $filtered
            ->orderByDesc('journal_entries.entry_date')
            ->orderByDesc('journal_entries.id')
            ->select([
                'journal_entry_lines.id',
                'journal_entry_lines.account_id',
                'journal_entry_lines.debit',
                'journal_entry_lines.credit',
                'journal_entries.id as journal_entry_id',
                'journal_entries.entry_no',
                'journal_entries.entry_date',
                'journal_entries.reference',
                'journal_entries.memo',
                'journal_entries.status',
                'journal_entries.source_type',
                'journal_entries.source_id',
            ])
            ->paginate(20)
            ->withQueryString();

        $accountNames = $cashAccounts->keyBy('id');
        $cleared = BankTransaction::query()
            ->whereIn('journal_entry_id', collect($page->items())->pluck('journal_entry_id'))
            ->get(['journal_entry_id', 'is_cleared', 'bank_account_id'])
            ->keyBy('journal_entry_id');

        $page->through(fn ($row) => [
            'id' => $row->id,
            'journal_entry_id' => $row->journal_entry_id,
            'entry_no' => $row->entry_no,
            'entry_date' => substr((string) $row->entry_date, 0, 10),
            'reference' => $row->reference,
            'memo' => $row->memo,
            'status' => $row->status,
            'direction' => (float) $row->debit > 0 ? 'in' : 'out',
            'amount' => (float) $row->debit > 0 ? (float) $row->debit : (float) $row->credit,
            'account' => $accountNames->get($row->account_id),
            'source_type' => $row->source_type ?: 'manual',
            'source_url' => $this->ledger->sourceUrl($row->source_type, $row->source_id),
            'is_cleared' => $cleared->get($row->journal_entry_id)?->is_cleared,
        ]);

        $sum = fn (string $column) => round((float) (clone $base)->sum("journal_entry_lines.{$column}"), 2);
        $inflows = $sum('debit');
        $outflows = $sum('credit');

        return Inertia::render('accounting/cash-bank/page', [
            'transactions' => $page,
            'filters' => $filters,
            'summary' => [
                'inflows' => $inflows,
                'outflows' => $outflows,
                'net' => round($inflows - $outflows, 2),
                'draftCount' => (clone $base)->where('journal_entries.status', 'draft')->count(),
            ],
            'cashAccounts' => $cashAccounts->values(),
            'bankAccounts' => $this->bankAccounts(),
            'counterAccounts' => $this->counterAccounts(),
            'paymentMethods' => CashMovementService::METHODS,
            'entityName' => $entityContext->current()?->name,
        ]);
    }

    /**
     * Record a direct receipt or payment. The cash side comes from the chosen bank (or cash on hand / the
     * method's clearing account); the other side is the account the user says the money was for.
     */
    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $data = $request->validate([
            'kind' => ['required', 'in:receipt,payment'],
            'txn_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', Rule::in(CashMovementService::METHODS)],
            'bank_account_id' => ['nullable', 'integer', 'exists:bank_accounts,id'],
            'counter_account_id' => ['required', 'integer', 'exists:accounts,id'],
            'party' => ['nullable', 'string', 'max:120'],
            'reference' => [Rule::requiredIf($request->input('payment_method') !== 'cash'), 'nullable', 'string', 'max:100'],
            'description' => ['required', 'string', 'max:255'],
        ], [
            'counter_account_id.required' => 'Choose what this money was for.',
            'reference.required' => 'Enter the check, GCash, card or transfer reference number.',
        ]);

        $counter = Account::query()->findOrFail($data['counter_account_id']);
        if (in_array($counter->id, $this->cash->cashAccountIds(), true)) {
            throw ValidationException::withMessages(['counter_account_id' => 'Transfers between cash accounts need a journal pair; pick an income, expense, asset, liability or equity account.']);
        }
        if (in_array($counter->code, self::DOCUMENT_CONTROLLED, true)) {
            throw ValidationException::withMessages([
                'counter_account_id' => $counter->code === '2000'
                    ? 'Pay supplier bills from Bills & Payables so the bill balance updates.'
                    : 'Record customer collections and deposits from Invoices or Customer Deposits so balances update.',
            ]);
        }

        $bank = $this->cash->bankAccountFor(isset($data['bank_account_id']) ? (int) $data['bank_account_id'] : null);
        if ($this->cash->requiresBank($data['payment_method']) && ! $bank) {
            throw ValidationException::withMessages(['bank_account_id' => 'Select the bank account.']);
        }

        $receipt = $data['kind'] === 'receipt';
        $amount = round((float) $data['amount'], 2);
        $memo = trim($data['description'].(! empty($data['party']) ? ' — '.$data['party'] : ''));

        DB::transaction(function () use ($data, $bank, $receipt, $amount, $memo, $counter, $request) {
            $cashAccount = $this->cash->cashAccountFor($data['payment_method'], $bank);

            $entry = $this->cash->journal([
                'journal_id' => Journal::query()->where('code', $receipt ? 'CRJ' : 'CDJ')->firstOrFail()->id,
                'entry_date' => $data['txn_date'],
                'reference' => $data['reference'] ?? null,
                'memo' => $memo,
                'source_system' => 'cash_bank',
                'source_type' => $receipt ? 'cash_receipt' : 'cash_payment',
            ], [
                ['account_id' => $receipt ? $cashAccount->id : $counter->id, 'debit' => $amount, 'credit' => 0, 'memo' => $memo],
                ['account_id' => $receipt ? $counter->id : $cashAccount->id, 'debit' => 0, 'credit' => $amount, 'memo' => $memo],
            ], (int) $request->user()->id);

            if ($bank) {
                $line = $this->cash->recordBankLine($bank, [
                    'txn_date' => $data['txn_date'],
                    'description' => $memo,
                    'amount' => $amount,
                    'direction' => $receipt ? 'in' : 'out',
                    'reference' => $data['reference'] ?? null,
                    'source_type' => $receipt ? 'cash_receipt' : 'cash_payment',
                    'journal_entry_id' => $entry->id,
                ]);
                $entry->update(['source_id' => $line->id]);
            }
        });

        return back()->with('status', ($receipt ? 'Receipt' : 'Payment').' of '.number_format($amount, 2).' recorded and journalized.');
    }

    protected function cashAccounts()
    {
        return Account::query()
            ->whereIn('id', $this->cash->cashAccountIds())
            ->orderBy('code')
            ->get(['id', 'code', 'name'])
            ->map(fn (Account $a) => ['id' => $a->id, 'code' => $a->code, 'name' => $a->name]);
    }

    protected function bankAccounts()
    {
        $entityId = app(EntityContext::class)->id();

        return BankAccount::query()
            ->where('is_active', true)
            ->when($entityId, fn ($q) => $q->whereHas('entities', fn ($e) => $e->where('entities.id', $entityId)))
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'bank_name', 'is_shared']);
    }

    /** Accounts a direct receipt/payment may be charged to, grouped by classification for the picker. */
    protected function counterAccounts()
    {
        $exclude = [...$this->cash->cashAccountIds()];

        return Account::query()
            ->with('accountType:id,classification')
            ->where('is_postable', true)
            ->where('is_active', true)
            ->whereNotIn('id', $exclude)
            ->whereNotIn('code', self::DOCUMENT_CONTROLLED)
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'account_type_id'])
            ->map(fn (Account $a) => ['id' => $a->id, 'code' => $a->code, 'name' => $a->name, 'classification' => $a->accountType?->classification])
            ->values();
    }
}
