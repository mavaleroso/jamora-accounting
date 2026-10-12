<?php

namespace App\Http\Controllers\Payroll;

use App\Http\Controllers\Controller;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Services\Payroll\PayrollService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PayrollRunsController extends Controller
{
    public function __construct(protected PayrollService $payrollService) {}

    public function index(Request $request): Response
    {
        $pageSize = max(1, min(100, (int) $request->get('per_page', 10)));
        $page = max(1, (int) $request->get('page', 1));

        $paginator = PayrollRun::query()
            ->with('period:id,code,start_date,end_date')
            ->orderByDesc('created_at')
            ->paginate($pageSize, ['*'], 'page', $page);

        return Inertia::render('payroll/runs/page', [
            'runs' => $paginator->items(),
            'totalRuns' => $paginator->total(),
            'pageSize' => $pageSize,
            'currentPage' => $paginator->currentPage(),
            'periods' => PayrollPeriod::query()->whereIn('status', ['open', 'processing'])->orderByDesc('start_date')->get(['id', 'code', 'start_date', 'end_date', 'status']),
        ]);
    }

    public function compute(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'payroll_period_id' => ['required', 'integer', 'exists:payroll_periods,id'],
        ]);

        $period = PayrollPeriod::query()->findOrFail($data['payroll_period_id']);
        $run = $this->payrollService->compute($period, (int) $request->user()->id);

        return redirect()->back()->with('status', "Payroll run {$run->run_no} computed.");
    }

    public function post(Request $request, PayrollRun $payrollRun): RedirectResponse
    {
        $this->payrollService->post($payrollRun, (int) $request->user()->id);

        return redirect()->back()->with('status', 'Payroll run posted.');
    }
}
