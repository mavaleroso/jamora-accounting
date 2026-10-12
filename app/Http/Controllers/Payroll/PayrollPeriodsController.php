<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\PayrollPeriod;
use App\Support\EntityContext;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class PayrollPeriodsController extends Controller
{
    public function index(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->get('per_page', 10)));
        $page = max(1, (int) $request->get('page', 1));

        $paginator = PayrollPeriod::query()
            ->orderByDesc('start_date')
            ->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('payroll/periods/page', [
            'periods' => $paginator->items(),
            'totalPeriods' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $entityId = app(EntityContext::class)->id();

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', Rule::unique('payroll_periods', 'code')->where('entity_id', $entityId)],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'pay_date' => ['nullable', 'date'],
        ]);

        PayrollPeriod::query()->create([
            ...$data,
            'status' => 'open',
        ]);

        return redirect()->back()->with('status', 'Payroll period created successfully.');
    }
}
