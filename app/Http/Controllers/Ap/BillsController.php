<?php

namespace App\Http\Controllers\Ap;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\BankAccount;
use App\Models\Bill;
use App\Models\Vendor;
use App\Services\Ap\BillService;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class BillsController extends Controller
{
    public function __construct(protected BillService $billService) {}

    public function index(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->get('per_page', 10)));
        $page = max(1, (int) $request->get('page', 1));

        $paginator = Bill::query()
            ->with('vendor:id,code,name')
            ->orderByDesc('bill_date')
            ->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('ap/bills/page', [
            'bills' => $paginator->items(),
            'totalBills' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('ap/bills/form/page', [
            'vendors' => Vendor::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'accounts' => Account::query()->where('is_postable', true)->where('is_active', true)->orderBy('code')->get(['id', 'code', 'name']),
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
            'due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'lines.*.amount' => ['required', 'numeric', 'min:0'],
            'lines.*.tax_code_id' => ['nullable', 'integer', 'exists:tax_codes,id'],
        ]);

        $lines = $data['lines'];
        unset($data['lines']);

        $this->billService->create($data, $lines, (int) $request->user()->id);

        return redirect()->route('ap.bills.index')->with('status', 'Bill created successfully.');
    }

    public function post(Request $request, Bill $bill): RedirectResponse
    {
        $this->billService->post($bill, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Bill posted.');
    }

    public function pay(Request $request, Bill $bill): RedirectResponse
    {
        $payment = $request->validate([
            'paid_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'reference' => ['nullable', 'string', 'max:100'],
            'bank_account_id' => ['nullable', 'integer', 'exists:bank_accounts,id'],
        ]);

        $this->billService->pay($bill, $payment, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Bill payment recorded.');
    }
}
