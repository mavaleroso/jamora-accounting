<?php

namespace App\Http\Controllers\Reports;

use App\Http\Controllers\Controller;
use App\Models\Invoice;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ArAgingController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('reports/ar-aging/page');
    }

    public function data(Request $request): JsonResponse
    {
        $asOf = $request->validate(['as_of' => ['nullable', 'date']])['as_of'] ?? now()->toDateString();
        $asOfDate = \Carbon\Carbon::parse($asOf);

        $invoices = Invoice::query()
            ->with('partner:id,code,name')
            ->whereIn('status', ['confirmed', 'partially_paid'])
            ->where('balance_due', '>', 0)
            ->get();

        $rows = [];
        $totals = ['current' => 0, 'days_30' => 0, 'days_60' => 0, 'days_90' => 0, 'total' => 0];

        foreach ($invoices as $invoice) {
            $dueDate = $invoice->due_date ?? $invoice->invoice_date;
            $daysPast = $dueDate ? $asOfDate->diffInDays($dueDate, false) * -1 : 0;
            $balance = (float) $invoice->balance_due;

            $bucket = match (true) {
                $daysPast <= 0 => 'current',
                $daysPast <= 30 => 'days_30',
                $daysPast <= 60 => 'days_60',
                default => 'days_90',
            };

            $partnerKey = $invoice->partner_id;
            if (! isset($rows[$partnerKey])) {
                $rows[$partnerKey] = [
                    'partner_code' => $invoice->partner?->code,
                    'partner_name' => $invoice->partner?->name,
                    'current' => 0,
                    'days_30' => 0,
                    'days_60' => 0,
                    'days_90' => 0,
                    'total' => 0,
                ];
            }

            $rows[$partnerKey][$bucket] += $balance;
            $rows[$partnerKey]['total'] += $balance;
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
