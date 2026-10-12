<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Bill;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ApAgingController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('reports/ap-aging/page');
    }

    public function data(Request $request): JsonResponse
    {
        $asOf = $request->validate(['as_of' => ['nullable', 'date']])['as_of'] ?? now()->toDateString();
        $asOfDate = \Carbon\Carbon::parse($asOf);

        $bills = Bill::query()
            ->with('vendor:id,code,name')
            ->whereIn('status', ['posted', 'partially_paid'])
            ->where('balance_due', '>', 0)
            ->get();

        $rows = [];
        $totals = ['current' => 0, 'days_30' => 0, 'days_60' => 0, 'days_90' => 0, 'total' => 0];

        foreach ($bills as $bill) {
            $dueDate = $bill->due_date ?? $bill->bill_date;
            $daysPast = $dueDate ? $asOfDate->diffInDays($dueDate, false) * -1 : 0;
            $balance = (float) $bill->balance_due;

            $bucket = match (true) {
                $daysPast <= 0 => 'current',
                $daysPast <= 30 => 'days_30',
                $daysPast <= 60 => 'days_60',
                default => 'days_90',
            };

            $vendorKey = $bill->vendor_id;
            if (! isset($rows[$vendorKey])) {
                $rows[$vendorKey] = [
                    'vendor_code' => $bill->vendor?->code,
                    'vendor_name' => $bill->vendor?->name,
                    'current' => 0,
                    'days_30' => 0,
                    'days_60' => 0,
                    'days_90' => 0,
                    'total' => 0,
                ];
            }

            $rows[$vendorKey][$bucket] += $balance;
            $rows[$vendorKey]['total'] += $balance;
            $totals[$bucket] += $balance;
            $totals['total'] += $balance;
        }

        return response()->json([
            'as_of' => $asOfDate->toDateString(),
            'rows' => array_values($rows),
            'totals' => array_map(fn ($v) => round($v, 2), $totals),
        ]);
    }
}
