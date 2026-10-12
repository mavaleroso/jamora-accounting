<?php

namespace App\Http\Controllers\Billing;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use App\Models\Partner;
use App\Services\Billing\InvoiceService;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class InvoicesController extends Controller
{
    public function __construct(protected InvoiceService $invoiceService) {}

    public function index(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->get('per_page', 10)));
        $page = max(1, (int) $request->get('page', 1));

        $paginator = Invoice::query()
            ->with('partner:id,code,name')
            ->orderByDesc('invoice_date')
            ->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('billing/invoices/page', [
            'invoices' => $paginator->items(),
            'totalInvoices' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('billing/invoices/form/page', [
            'partners' => Partner::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
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
            'due_date' => ['nullable', 'date'],
            'pricing_type' => ['required', 'string', 'in:retail,wholesale'],
            'is_senior_pwd' => ['boolean'],
            'is_vat_exempt' => ['boolean'],
            'notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.line_type' => ['nullable', 'string', 'max:50'],
            'lines.*.quantity' => ['nullable', 'numeric', 'min:0'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'lines.*.discount_amount' => ['nullable', 'numeric', 'min:0'],
            'lines.*.tax_code_id' => ['nullable', 'integer', 'exists:tax_codes,id'],
            'lines.*.notes' => ['nullable', 'string'],
        ]);

        $lines = $data['lines'];
        unset($data['lines']);

        $data['is_senior_pwd'] = (bool) ($data['is_senior_pwd'] ?? false);
        $data['is_vat_exempt'] = (bool) ($data['is_vat_exempt'] ?? false);

        $invoice = $this->invoiceService->create($data, $lines, (int) $request->user()->id);

        return redirect()->route('billing.invoices.show', $invoice)
            ->with('status', 'Invoice created successfully.');
    }

    public function show(Invoice $invoice): Response
    {
        $invoice->load(['partner', 'lines', 'payments']);

        return Inertia::render('billing/invoices/page', [
            'invoice' => $invoice,
            'invoices' => [],
            'totalInvoices' => 0,
            'pageSize' => 10,
            'currentPage' => 1,
            'viewMode' => 'show',
        ]);
    }

    public function confirm(Request $request, Invoice $invoice): RedirectResponse
    {
        $this->invoiceService->confirm($invoice, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Invoice confirmed.');
    }

    public function collect(Request $request, Invoice $invoice): RedirectResponse
    {
        $payment = $request->validate([
            'paid_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'string', 'in:cash,gcash,card,check,bank'],
            'reference' => ['nullable', 'string', 'max:100'],
            'bank_account_id' => ['nullable', 'integer', 'exists:bank_accounts,id'],
            'customer_deposit_id' => ['nullable', 'integer', 'exists:customer_deposits,id'],
        ]);

        $this->invoiceService->collect($invoice, $payment, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Payment recorded.');
    }
}
