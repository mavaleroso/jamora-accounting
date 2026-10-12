<?php

namespace App\Http\Controllers\Billing;

use App\Http\Controllers\Controller;
use App\Models\CustomerDeposit;
use App\Models\Partner;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DepositsController extends Controller
{
    public function index(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->get('per_page', 10)));
        $page = max(1, (int) $request->get('page', 1));

        $paginator = CustomerDeposit::query()
            ->with('partner:id,code,name')
            ->orderByDesc('deposit_date')
            ->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('billing/deposits/page', [
            'deposits' => $paginator->items(),
            'totalDeposits' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'partners' => Partner::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'partner_id' => ['required', 'integer', 'exists:partners,id'],
            'deposit_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['nullable', 'string', 'max:50'],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string'],
        ]);

        CustomerDeposit::query()->create([
            ...$data,
            'status' => 'open',
            'applied_amount' => 0,
        ]);

        return redirect()->back()->with('status', 'Deposit recorded successfully.');
    }
}
