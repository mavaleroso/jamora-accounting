<?php

namespace App\Http\Controllers\Reports;

use App\Exports\ArrayExport;
use App\Http\Controllers\Controller;
use App\Services\Reports\OperationalReportService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Daily sales, VAT summary, cost of goods sold, collections by payment method and customer deposits liability.
 */
class OperationalReportsController extends Controller
{
    public function __construct(protected OperationalReportService $reports) {}

    public function show(Request $request, string $report): Response
    {
        $this->authorizeReport($request, $report);

        return Inertia::render('reports/operations/page', [
            'report' => $this->reports->build($report, $this->filters($request)),
            'reports' => collect(OperationalReportService::REPORTS)
                ->filter(fn (array $r) => $request->user()->can($r['permission']))
                ->map(fn (array $r, string $key) => ['key' => $key, 'title' => $r['title']])
                ->values(),
        ]);
    }

    public function export(Request $request, string $report): BinaryFileResponse
    {
        $this->authorizeReport($request, $report);
        abort_unless($request->user()->can('reports.export') || $request->user()->can(OperationalReportService::REPORTS[$report]['permission']), 403);

        $data = $this->reports->build($report, $this->filters($request));
        $columns = $data['columns'];
        $rows = collect([...$data['rows'], ...($data['totals'] ? [$data['totals']] : [])])
            ->map(fn (array $row) => array_map(fn (array $c) => $row[$c['key']] ?? null, $columns))
            ->all();

        $period = $data['mode'] === 'as_of' ? 'As of '.$data['filters']['as_of'] : $data['filters']['date_from'].' to '.$data['filters']['date_to'];

        return Excel::download(
            new ArrayExport(array_column($columns, 'label'), $rows, [$data['title'], (string) $data['entity'], $period], $data['title']),
            str($data['title'])->slug().'-'.now('Asia/Manila')->format('Ymd').'.xlsx'
        );
    }

    protected function authorizeReport(Request $request, string $report): void
    {
        $definition = OperationalReportService::REPORTS[$report] ?? abort(404);
        abort_unless($request->user()->can($definition['permission']), 403);
    }

    /**
     * @return array{date_from: string|null, date_to: string|null, as_of: string|null}
     */
    protected function filters(Request $request): array
    {
        $data = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'as_of' => ['nullable', 'date'],
        ]);

        return [
            'date_from' => $data['date_from'] ?? null,
            'date_to' => $data['date_to'] ?? null,
            'as_of' => $data['as_of'] ?? null,
        ];
    }
}
