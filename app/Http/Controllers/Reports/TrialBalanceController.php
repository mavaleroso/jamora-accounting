<?php

namespace App\Http\Controllers\Reports;

use App\Exports\TrialBalanceExport;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Reports\Concerns\ProvidesPeriodOptions;
use App\Services\Accounting\TrialBalanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class TrialBalanceController extends Controller
{
    use ProvidesPeriodOptions;

    public function __construct(
        private readonly TrialBalanceService $trialBalanceService
    ) {}

    public function index(): Response
    {
        return Inertia::render('reports/trial-balance/page', [
            'periods' => $this->periodOptions(),
        ]);
    }

    public function data(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period_id' => ['required', 'integer', 'exists:accounting_periods,id'],
        ]);

        $rows = $this->trialBalanceService->getTrialBalance((int) $validated['period_id']);
        $totalDebit = array_sum(array_column($rows, 'debit'));
        $totalCredit = array_sum(array_column($rows, 'credit'));

        return response()->json([
            'rows' => $rows,
            'totals' => [
                'debit' => round($totalDebit, 2),
                'credit' => round($totalCredit, 2),
            ],
        ]);
    }

    public function export(Request $request): BinaryFileResponse
    {
        $validated = $request->validate([
            'period_id' => ['required', 'integer', 'exists:accounting_periods,id'],
        ]);

        $rows = $this->trialBalanceService->getTrialBalance((int) $validated['period_id']);
        $totals = [
            'debit' => round(array_sum(array_column($rows, 'debit')), 2),
            'credit' => round(array_sum(array_column($rows, 'credit')), 2),
        ];

        return Excel::download(
            new TrialBalanceExport($rows, $totals),
            'trial-balance.xlsx'
        );
    }
}
