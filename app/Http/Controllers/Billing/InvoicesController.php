<?php

namespace App\Http\Controllers\Billing;

use App\Http\Controllers\Controller;
use App\Models\BankAccount;
use App\Models\CustomerDeposit;
use App\Models\InventoryItem;
use App\Models\Invoice;
use App\Models\InvoicePayment;
use App\Models\Partner;
use App\Services\Accounting\CashMovementService;
use App\Services\Billing\InvoiceService;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class InvoicesController extends Controller
{
    public const STATUSES = ['draft', 'confirmed', 'partially_paid', 'paid', 'void'];

    public function __construct(protected InvoiceService $invoiceService) {}

    public function index(Request $request): Response
    {
        $filters = [
            'search' => trim((string) $request->get('search', '')),
            'status' => $request->get('status'),
            'pricing_type' => $request->get('pricing_type'),
            'date_from' => $request->get('date_from'),
            'date_to' => $request->get('date_to'),
            'overdue' => $request->boolean('overdue'),
        ];
        $pageSize = $this->perPage($request);
        $today = Carbon::now('Asia/Manila')->toDateString();

        $query = Invoice::query()
            ->with('partner:id,code,name,type')
            ->when($filters['search'] !== '', fn ($q) => $q->where(function ($q) use ($filters) {
                $term = "%{$filters['search']}%";
                $q->where('invoice_no', 'like', $term)
                    ->orWhere('bir_si_or_no', 'like', $term)
                    ->orWhereHas('partner', fn ($p) => $p->where('name', 'like', $term)->orWhere('code', 'like', $term));
            }))
            ->when(in_array($filters['status'], self::STATUSES, true), fn ($q) => $q->where('status', $filters['status']))
            ->when(in_array($filters['pricing_type'], ['retail', 'wholesale'], true), fn ($q) => $q->where('pricing_type', $filters['pricing_type']))
            ->when($filters['date_from'], fn ($q, $d) => $q->whereDate('invoice_date', '>=', $d))
            ->when($filters['date_to'], fn ($q, $d) => $q->whereDate('invoice_date', '<=', $d))
            ->when($filters['overdue'], fn ($q) => $q->whereIn('status', ['confirmed', 'partially_paid'])->whereDate('due_date', '<', $today));

        $open = Invoice::query()->whereIn('status', ['confirmed', 'partially_paid']);
        $monthStart = Carbon::now('Asia/Manila')->startOfMonth()->toDateString();

        return Inertia::render('billing/invoices/page', [
            'invoices' => $query->orderByDesc('invoice_date')->orderByDesc('id')->paginate($pageSize)->withQueryString(),
            'filters' => $filters,
            'summary' => [
                'outstanding' => round((float) (clone $open)->sum('balance_due'), 2),
                'overdue' => round((float) (clone $open)->whereDate('due_date', '<', $today)->sum('balance_due'), 2),
                'overdueCount' => (clone $open)->whereDate('due_date', '<', $today)->count(),
                'draftCount' => Invoice::query()->where('status', 'draft')->count(),
                'billedMtd' => round((float) Invoice::query()->where('status', '!=', 'draft')->whereDate('invoice_date', '>=', $monthStart)->sum('total_amount'), 2),
                'collectedMtd' => round((float) InvoicePayment::query()
                    ->whereDate('paid_date', '>=', $monthStart)
                    ->where('payment_method', '!=', 'deposit')
                    ->sum('amount'), 2),
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('billing/invoices/form/page', [
            'partners' => Partner::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name', 'type']),
            'items' => InventoryItem::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'sku', 'name', 'category', 'selling_price', 'wholesale_price', 'qty_on_hand']),
            'vatRate' => (float) config('accounting.vat_rate', 0.12),
            'seniorDiscountRate' => InvoiceService::SENIOR_PWD_DISCOUNT_RATE,
            'nextInvoiceNo' => $this->nextInvoiceNo(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'partner_id' => ['required', 'integer', 'exists:partners,id'],
            'invoice_no' => ['required', 'string', 'max:100', Rule::unique('invoices', 'invoice_no')->where('entity_id', $entityId)],
            'bir_si_or_no' => ['nullable', 'string', 'max:100'],
            'invoice_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date', 'after_or_equal:invoice_date'],
            'pricing_type' => ['required', 'string', 'in:retail,wholesale'],
            'is_senior_pwd' => ['boolean'],
            'is_vat_exempt' => ['boolean'],
            'notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.line_type' => ['required', 'string', 'in:product,service,edging,repair,eye_exam'],
            'lines.*.inventory_item_id' => ['nullable', 'integer', 'exists:inventory_items,id'],
            'lines.*.quantity' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.discount_amount' => ['nullable', 'numeric', 'min:0'],
            'lines.*.tax_code_id' => ['nullable', 'integer', 'exists:tax_codes,id'],
            'lines.*.notes' => ['nullable', 'string', 'max:500'],
        ], [], ['lines.*.description' => 'line description', 'lines.*.quantity' => 'quantity', 'lines.*.unit_price' => 'unit price']);

        $lines = $data['lines'];
        unset($data['lines']);

        $data['is_senior_pwd'] = (bool) ($data['is_senior_pwd'] ?? false);
        // Senior/PWD sales are VAT-exempt by law.
        $data['is_vat_exempt'] = $data['is_senior_pwd'] || (bool) ($data['is_vat_exempt'] ?? false);
        $data['due_date'] ??= $data['invoice_date'];

        $invoice = $this->invoiceService->create($data, $lines, (int) $request->user()->id);

        return redirect()->route('billing.invoices.show', $invoice)->with('status', 'Invoice '.$invoice->invoice_no.' saved as draft.');
    }

    public function show(Invoice $invoice): Response
    {
        $invoice->load([
            'partner',
            'lines',
            'payments' => fn ($q) => $q->orderBy('paid_date')->orderBy('id'),
            'payments.bankAccount:id,code,name',
            'journalEntry:id,entry_no,status',
        ]);

        return Inertia::render('billing/invoices/show/page', [
            'invoice' => $invoice,
            'openDeposits' => CustomerDeposit::query()
                ->where('partner_id', $invoice->partner_id)
                ->where('status', 'open')
                ->orderBy('deposit_date')
                ->get(['id', 'deposit_date', 'amount', 'applied_amount', 'reference', 'payment_method']),
            'bankAccounts' => $this->bankAccounts(),
            'paymentMethods' => CashMovementService::METHODS,
        ]);
    }

    public function confirm(Request $request, Invoice $invoice): RedirectResponse
    {
        $this->invoiceService->confirm($invoice, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Invoice '.$invoice->invoice_no.' confirmed and posted to receivables.');
    }

    public function collect(Request $request, Invoice $invoice): RedirectResponse
    {
        $payment = $request->validate([
            'paid_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'string', Rule::in(CashMovementService::METHODS)],
            'reference' => [Rule::requiredIf(in_array($request->input('payment_method'), ['check', 'gcash', 'card', 'bank_transfer'], true)), 'nullable', 'string', 'max:100'],
            'bank_account_id' => ['nullable', 'integer', 'exists:bank_accounts,id'],
        ], [
            'reference.required' => 'Enter the check, GCash, card approval or transfer reference number.',
        ]);

        $this->invoiceService->collect($invoice, $payment, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Payment of '.number_format((float) $payment['amount'], 2).' recorded.');
    }

    public function applyDeposit(Request $request, Invoice $invoice): RedirectResponse
    {
        $data = $request->validate([
            'customer_deposit_id' => ['required', 'integer', 'exists:customer_deposits,id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'applied_date' => ['required', 'date'],
        ]);

        $deposit = CustomerDeposit::query()->findOrFail($data['customer_deposit_id']);
        $this->invoiceService->applyDeposit($invoice, $deposit, (float) $data['amount'], $data['applied_date'], (int) $request->user()->id);

        return redirect()->back()->with('status', 'Deposit applied to '.$invoice->invoice_no.'.');
    }

    public function destroy(Invoice $invoice): RedirectResponse
    {
        abort_unless($invoice->status === 'draft', 422, 'Only draft invoices can be deleted.');

        $invoice->lines()->delete();
        $invoice->delete();

        return redirect()->route('billing.invoices.index')->with('status', 'Draft invoice deleted.');
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

    protected function nextInvoiceNo(): string
    {
        $prefix = 'INV-'.Carbon::now('Asia/Manila')->format('Ym').'-';
        $last = Invoice::query()->withTrashed()->where('invoice_no', 'like', $prefix.'%')->orderByDesc('invoice_no')->value('invoice_no');
        $next = $last ? ((int) substr($last, strlen($prefix))) + 1 : 1;

        return $prefix.str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }
}
