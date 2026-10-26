<?php

namespace App\Http\Controllers\Accounting;

use App\Exceptions\AccountingException;
use App\Http\Controllers\Controller;
use App\Models\AccountingPeriod;
use App\Models\FiscalYear;
use App\Services\Accounting\PeriodCloseService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PeriodsController extends Controller
{
    public function __construct(
        private readonly PeriodCloseService $periodCloseService
    ) {}

    public function index(Request $request): Response
    {
        $fiscalYearId = $request->integer('fiscal_year_id') ?: null;

        $fiscalYears = FiscalYear::query()
            ->orderByDesc('start_date')
            ->get(['id', 'code', 'start_date', 'end_date', 'status']);

        $selectedFiscalYear = $fiscalYearId
            ? $fiscalYears->firstWhere('id', $fiscalYearId)
            : $fiscalYears->first();

        $periods = [];

        if ($selectedFiscalYear) {
            $periods = AccountingPeriod::query()
                ->with(['closedByUser:id,firstname,middlename,lastname,username'])
                ->where('fiscal_year_id', $selectedFiscalYear->id)
                ->orderBy('period_no')
                ->get()
                ->map(fn (AccountingPeriod $period) => [
                    'id' => $period->id,
                    'fiscal_year_id' => $period->fiscal_year_id,
                    'period_no' => $period->period_no,
                    'start_date' => $period->start_date?->toDateString(),
                    'end_date' => $period->end_date?->toDateString(),
                    'status' => $period->status,
                    'closed_by' => $period->closed_by,
                    'closed_at' => $period->closed_at?->toISOString(),
                    'closed_by_user' => $period->closedByUser ? [
                        'id' => $period->closedByUser->id,
                        'name' => $period->closedByUser->name,
                    ] : null,
                ])
                ->values()
                ->all();
        }

        return Inertia::render('accounting/periods/page', [
            'fiscalYears' => $fiscalYears,
            'selectedFiscalYearId' => $selectedFiscalYear?->id,
            'periods' => $periods,
        ]);
    }

    public function softClose(AccountingPeriod $period): RedirectResponse
    {
        return $this->handlePeriodAction(
            fn () => $this->periodCloseService->softClose($period, request()->user()),
            'Period soft-closed successfully.'
        );
    }

    public function close(AccountingPeriod $period): RedirectResponse
    {
        return $this->handlePeriodAction(
            fn () => $this->periodCloseService->close($period, request()->user()),
            'Period closed successfully.'
        );
    }

    public function reopen(AccountingPeriod $period): RedirectResponse
    {
        return $this->handlePeriodAction(
            fn () => $this->periodCloseService->reopen($period, request()->user()),
            'Period reopened successfully.'
        );
    }

    /**
     * @param  callable(): AccountingPeriod  $action
     */
    private function handlePeriodAction(callable $action, string $successMessage): RedirectResponse
    {
        try {
            $action();

            return redirect()->back()
                ->with('status', $successMessage);
        } catch (AccountingException $e) {
            return redirect()->back()
                ->with('error', $e->getMessage());
        }
    }
}
