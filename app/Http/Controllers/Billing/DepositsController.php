<?php

namespace App\Http\Controllers\Billing;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BankAccount;
use App\Models\CustomerDeposit;
use App\Models\InvoicePayment;
use App\Models\Journal;
use App\Models\Partner;
use App\Services\Accounting\CashMovementService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Customer deposits / downpayments (e.g. custom lens and frame orders). A deposit is a liability until it is
 * applied to the completed order's invoice from the invoice screen.
 */
class DepositsController extends Controller
{
    public function __construct(protected CashMovementService $cash) {}

    public function index(Request $request): Response
    {
        $filters = [
            'search' => trim((string) $request->get('search', '')),
            'status' => $request->get('status'),
            'source' => $request->get('source'),
            'date_from' => $request->get('date_from'),
            'date_to' => $request->get('date_to'),
        ];

        $deposits = CustomerDeposit::query()
            ->with(['partner:id,code,name', 'invoice:id,invoice_no', 'bankAccount:id,code,name'])
            ->when($filters['search'] !== '', fn ($q) => $q->where(function ($q) use ($filters) {
                $term = "%{$filters['search']}%";
                $q->where('reference', 'like', $term)->orWhereHas('partner', fn ($p) => $p->where('name', 'like', $term));
            }))
            ->when(in_array($filters['status'], ['open', 'applied', 'refunded', 'void'], true), fn ($q) => $q->where('status', $filters['status']))
            ->when($filters['source'] === 'optical', fn ($q) => $q->where('source_system', 'optical'))
            ->when($filters['source'] === 'manual', fn ($q) => $q->whereNull('source_system'))
            ->when($filters['date_from'], fn ($q, $d) => $q->whereDate('deposit_date', '>=', $d))
            ->when($filters['date_to'], fn ($q, $d) => $q->whereDate('deposit_date', '<=', $d))
            ->orderByDesc('deposit_date')
            ->orderByDesc('id')
            ->paginate($this->perPage($request))
            ->withQueryString();

        $open = CustomerDeposit::query()->where('status', 'open');

        return Inertia::render('billing/deposits/page', [
            'deposits' => $deposits,
            'filters' => $filters,
            'summary' => [
                'liability' => round((float) (clone $open)->sum(DB::raw('amount - applied_amount')), 2),
                'openCount' => (clone $open)->count(),
                'appliedMtd' => round((float) InvoicePayment::query()
                    ->where('payment_method', 'deposit')
                    ->whereDate('paid_date', '>=', now('Asia/Manila')->startOfMonth()->toDateString())
                    ->sum('amount'), 2),
                'receivedMtd' => round((float) CustomerDeposit::query()
                    ->whereDate('deposit_date', '>=', now('Asia/Manila')->startOfMonth()->toDateString())
                    ->sum('amount'), 2),
            ],
            'partners' => Partner::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'bankAccounts' => $this->bankAccounts(),
            'paymentMethods' => CashMovementService::METHODS,
        ]);
    }

    /**
     * Receive a downpayment: Dr cash/bank, Cr Customer Deposits (2300).
     */
    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'partner_id' => ['required', 'integer', 'exists:partners,id'],
            'deposit_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'string', Rule::in(CashMovementService::METHODS)],
            'bank_account_id' => ['nullable', 'integer', 'exists:bank_accounts,id'],
            'reference' => [Rule::requiredIf($request->input('payment_method') !== 'cash'), 'nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], ['reference.required' => 'Enter the check, GCash, card or transfer reference number.']);

        $bank = $this->cash->bankAccountFor(isset($data['bank_account_id']) ? (int) $data['bank_account_id'] : null);
        if ($this->cash->requiresBank($data['payment_method']) && ! $bank) {
            throw ValidationException::withMessages(['bank_account_id' => 'Select the bank account the deposit went to.']);
        }

        DB::transaction(function () use ($data, $bank, $request) {
            $userId = (int) $request->user()->id;
            $liability = Account::query()->where('code', '2300')->first()
                ?? throw ValidationException::withMessages(['amount' => 'Account 2300 Customer Deposits is missing from this entity.']);
            $partner = Partner::query()->findOrFail($data['partner_id']);

            $deposit = CustomerDeposit::query()->create([
                ...$data,
                'bank_account_id' => $bank?->id,
                'status' => 'open',
                'applied_amount' => 0,
            ]);

            $entry = $this->cash->journal([
                'journal_id' => Journal::query()->where('code', 'CRJ')->firstOrFail()->id,
                'entry_date' => $data['deposit_date'],
                'reference' => $data['reference'] ?? 'DEP-'.$deposit->id,
                'memo' => 'Customer deposit — '.$partner->name,
                'source_system' => 'billing',
                'source_type' => 'customer_deposit',
                'source_id' => $deposit->id,
            ], [
                ['account_id' => $this->cash->cashAccountFor($data['payment_method'], $bank)->id, 'debit' => (float) $data['amount'], 'credit' => 0, 'memo' => 'Deposit received'],
                ['account_id' => $liability->id, 'debit' => 0, 'credit' => (float) $data['amount'], 'memo' => 'Customer deposit liability'],
            ], $userId);

            $deposit->update(['journal_entry_id' => $entry->id]);

            if ($bank) {
                $this->cash->recordBankLine($bank, [
                    'txn_date' => $data['deposit_date'],
                    'description' => 'Customer deposit — '.$partner->name,
                    'amount' => $data['amount'],
                    'direction' => 'in',
                    'reference' => $data['reference'] ?? null,
                    'source_type' => 'customer_deposit',
                    'source_id' => $deposit->id,
                    'journal_entry_id' => $entry->id,
                ]);
            }
        });

        return redirect()->back()->with('status', 'Deposit of '.number_format((float) $data['amount'], 2).' recorded as a liability.');
    }

    protected function bankAccounts()
    {
        return BankAccount::query()->active()->orderBy('code')->get(['id', 'code', 'name']);
    }
}
