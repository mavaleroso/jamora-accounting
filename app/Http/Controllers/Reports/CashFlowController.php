<?php

namespace App\Http\Controllers\Reports;

use App\Exports\CashFlowExport;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Reports\Concerns\ProvidesPeriodOptions;
use App\Services\Accounting\FinancialStatementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class CashFlowController extends Controller
{
    use ProvidesPeriodOptions;

    public function __construct(
        private readonly FinancialStatementService $financialStatementService
    ) {}

    public function index(): Response
    {
        return Inertia::render('reports/cash-flow/page', [
            'periods' => $this->periodOptions(),
        ]);
    }

    public function data(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period_id' => ['required', 'integer', 'exists:accounting_periods,id'],
        ]);

        $statement = $this->financialStatementService->cashFlow((int) $validated['period_id']);

        return response()->json($statement);
    }

    public function export(Request $request): BinaryFileResponse
    {
        $validated = $request->validate([
            'period_id' => ['required', 'integer', 'exists:accounting_periods,id'],
        ]);

        $statement = $this->financialStatementService->cashFlow((int) $validated['period_id']);

        return Excel::download(
            new CashFlowExport($statement),
            'cash-flow.xlsx'
        );
    }
}
