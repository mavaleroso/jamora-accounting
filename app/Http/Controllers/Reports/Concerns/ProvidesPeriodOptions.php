<?php

namespace App\Http\Controllers\Reports\Concerns;

use App\Models\AccountingPeriod;

trait ProvidesPeriodOptions
{
    /**
     * @return list<array<string, mixed>>
     */
    protected function periodOptions(): array
    {
        return AccountingPeriod::query()
            ->with('fiscalYear:id,code')
            ->whereIn('status', ['open', 'soft-closed', 'closed'])
            ->orderByDesc('start_date')
            ->get()
            ->map(fn (AccountingPeriod $period) => [
                'id' => $period->id,
                'period_no' => $period->period_no,
                'start_date' => $period->start_date->toDateString(),
                'end_date' => $period->end_date->toDateString(),
                'status' => $period->status,
                'fiscal_year' => $period->fiscalYear ? [
                    'id' => $period->fiscalYear->id,
                    'code' => $period->fiscalYear->code,
                ] : null,
            ])
            ->values()
            ->all();
    }
}
