<?php

namespace App\Http\Controllers\Ap;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BankAccount;
use App\Models\Bill;
use App\Models\BillPayment;
use App\Models\Vendor;
use App\Services\Ap\BillService;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class BillsController extends Controller
{
    public function __construct(protected BillService $billService) {}

    public function index(Request $request): Response
    {
        $filters = [
            'search' => trim((string) $request->get('search', '')),
            'status' => $request->get('status'),
            'due' => $request->get('due'),
            'date_from' => $request->get('date_from'),
            'date_to' => $request->get('date_to'),
        ];
        $today = Carbon::now('Asia/Manila')->startOfDay();

        $bills = Bill::query()
            ->with('vendor:id,code,name')
            ->when($filters['search'] !== '', fn ($q) => $q->where(function ($q) use ($filters) {
                $term = "%{$filters['search']}%";
                $q->where('bill_no', 'like', $term)
                    ->orWhere('vendor_invoice_no', 'like', $term)
                    ->orWhereHas('vendor', fn ($v) => $v->where('name', 'like', $term));
            }))
            ->when(in_array($filters['status'], ['draft', 'posted', 'partially_paid', 'paid', 'void'], true), fn ($q) => $q->where('status', $filters['status']))
            ->when($filters['due'] === 'overdue', fn ($q) => $q->whereIn('status', ['posted', 'partially_paid'])->whereDate('due_date', '<', $today))
            ->when($filters['due'] === 'week', fn ($q) => $q->whereIn('status', ['posted', 'partially_paid'])->whereDate('due_date', '>=', $today->toDateString())->whereDate('due_date', '<=', $today->copy()->addDays(7)->toDateString()))
            ->when($filters['date_from'], fn ($q, $d) => $q->whereDate('bill_date', '>=', $d))
            ->when($filters['date_to'], fn ($q, $d) => $q->whereDate('bill_date', '<=', $d))
            // Unpaid bills first, soonest due at the top — the order a payables clerk works in.
            ->orderByRaw("case when status in ('posted','partially_paid') then 0 when status = 'draft' then 1 else 2 end")
            ->orderBy('due_date')
            ->orderByDesc('id')
            ->paginate(15)
            ->withQueryString();

        $open = Bill::query()->whereIn('status', ['posted', 'partially_paid']);

        return Inertia::render('ap/bills/page', [
            'bills' => $bills,
            'filters' => $filters,
            'summary' => [
                'outstanding' => round((float) (clone $open)->sum('balance_due'), 2),
                'overdue' => round((float) (clone $open)->whereDate('due_date', '<', $today)->sum('balance_due'), 2),
                'overdueCount' => (clone $open)->whereDate('due_date', '<', $today)->count(),
                'dueWeek' => round((float) (clone $open)->whereDate('due_date', '>=', $today->toDateString())->whereDate('due_date', '<=', $today->copy()->addDays(7)->toDateString())->sum('balance_due'), 2),
                'dueWeekCount' => (clone $open)->whereDate('due_date', '>=', $today->toDateString())->whereDate('due_date', '<=', $today->copy()->addDays(7)->toDateString())->count(),
                'paidMtd' => round((float) BillPayment::query()->whereHas('bill')->whereDate('paid_date', '>=', $today->copy()->startOfMonth()->toDateString())->sum('amount'), 2),
                'draftCount' => Bill::query()->where('status', 'draft')->count(),
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('ap/bills/form/page', [
            'vendors' => Vendor::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'accounts' => Account::query()
                ->with('accountType:id,classification')
                ->where('is_postable', true)
                ->where('is_active', true)
                ->orderBy('code')
                ->get(['id', 'code', 'name', 'account_type_id'])
                // Bills debit expenses, inventory or fixed assets — never cash, AR or revenue. 2200 is offered so a
                // bill for stock already received into inventory clears the goods-received-not-billed accrual.
                ->filter(fn (Account $a) => (in_array($a->accountType?->classification, ['expense', 'asset'], true) && ! in_array($a->code, ['1000', '1010', '1020', '1030', '1100', '1300'], true)) || $a->code === '2200')
                ->values()
                ->map(fn (Account $a) => ['id' => $a->id, 'code' => $a->code, 'name' => $a->name, 'classification' => $a->accountType?->classification]),
            'vatRate' => (float) config('accounting.vat_rate', 0.12),
            'nextBillNo' => $this->nextBillNo(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'vendor_id' => ['required', 'integer', 'exists:vendors,id'],
            'bill_no' => ['required', 'string', 'max:100', Rule::unique('bills', 'bill_no')->where('entity_id', $entityId)],
            'vendor_invoice_no' => ['nullable', 'string', 'max:100'],
            'bill_date' => ['required', 'date'],
            'due_date' => ['required', 'date', 'after_or_equal:bill_date'],
            'vat_treatment' => ['required', Rule::in(BillService::VAT_TREATMENTS)],
            'notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.account_id' => ['required', 'integer', 'exists:accounts,id'],
            'lines.*.amount' => ['required', 'numeric', 'gt:0'],
            'lines.*.tax_code_id' => ['nullable', 'integer', 'exists:tax_codes,id'],
        ], [], ['lines.*.account_id' => 'expense account', 'lines.*.description' => 'description', 'lines.*.amount' => 'amount']);

        // Same supplier invoice entered twice is the most common AP error.
        if (! empty($data['vendor_invoice_no']) && Bill::query()->where('vendor_id', $data['vendor_id'])->where('vendor_invoice_no', $data['vendor_invoice_no'])->exists()) {
            return back()->withErrors(['vendor_invoice_no' => 'A bill with this supplier invoice number already exists for this supplier.'])->withInput();
        }

        $lines = $data['lines'];
        unset($data['lines']);

        $bill = $this->billService->create($data, $lines, (int) $request->user()->id);

        return redirect()->route('ap.bills.show', $bill)->with('status', 'Bill '.$bill->bill_no.' saved as draft.');
    }

    public function show(Bill $bill): Response
    {
        $bill->load([
            'vendor',
            'lines.account:id,code,name',
            'payments' => fn ($q) => $q->orderBy('paid_date')->orderBy('id'),
            'payments.bankAccount:id,code,name',
            'journalEntry:id,entry_no,status',
        ]);
        $entityId = app(EntityContext::class)->id();

        return Inertia::render('ap/bills/show/page', [
            'bill' => $bill,
            'bankAccounts' => BankAccount::query()
                ->where('is_active', true)
                ->when($entityId, fn ($q) => $q->whereHas('entities', fn ($e) => $e->where('entities.id', $entityId)))
                ->orderBy('code')
                ->get(['id', 'code', 'name', 'bank_name', 'is_shared']),
            'paymentMethods' => BillService::PAYMENT_METHODS,
            'entityName' => app(EntityContext::class)->current()?->name,
        ]);
    }

    public function post(Request $request, Bill $bill): RedirectResponse
    {
        $this->billService->post($bill, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Bill '.$bill->bill_no.' posted to accounts payable.');
    }

    public function pay(Request $request, Bill $bill): RedirectResponse
    {
        $payment = $request->validate([
            'paid_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', Rule::in(BillService::PAYMENT_METHODS)],
            'reference' => [Rule::requiredIf(in_array($request->input('payment_method'), ['check', 'bank_transfer', 'gcash'], true)), 'nullable', 'string', 'max:100'],
            'bank_account_id' => ['nullable', 'integer', 'exists:bank_accounts,id'],
        ], ['reference.required' => 'Enter the check number or transfer reference.']);

        $this->billService->pay($bill, $payment, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Payment of '.number_format((float) $payment['amount'], 2).' recorded.');
    }

    public function destroy(Bill $bill): RedirectResponse
    {
        abort_unless($bill->status === 'draft', 422, 'Only draft bills can be deleted.');

        $bill->lines()->delete();
        $bill->delete();

        return redirect()->route('ap.bills.index')->with('status', 'Draft bill deleted.');
    }

    protected function nextBillNo(): string
    {
        $prefix = 'BILL-'.Carbon::now('Asia/Manila')->format('Ym').'-';
        $last = Bill::query()->withTrashed()->where('bill_no', 'like', $prefix.'%')->orderByDesc('bill_no')->value('bill_no');
        $next = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix.str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }
}
