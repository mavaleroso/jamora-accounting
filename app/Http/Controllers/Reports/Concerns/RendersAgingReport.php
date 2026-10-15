<?php

namespace App\Http\Controllers\Reports\Concerns;

use App\Exports\ArrayExport;
use App\Services\Reports\AgingReportService;
use App\Support\EntityContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Shared controller actions for AR and AP aging (same report, different documents).
 */
trait RendersAgingReport
{
    /** @return 'ar'|'ap' */
    abstract protected function agingType(): string;

    public function index(Request $request): Response
    {
        $asOf = $this->asOf($request);

        return Inertia::render('reports/aging/page', [
            'type' => $this->agingType(),
            'report' => app(AgingReportService::class)->build($this->agingType(), $asOf),
            'entityName' => app(EntityContext::class)->current()?->name,
        ]);
    }

    public function data(Request $request): JsonResponse
    {
        return response()->json(app(AgingReportService::class)->build($this->agingType(), $this->asOf($request)));
    }

    public function export(Request $request): BinaryFileResponse
    {
        $asOf = $this->asOf($request);
        $view = $request->get('view') === 'detail' ? 'detail' : 'summary';
        $report = app(AgingReportService::class)->build($this->agingType(), $asOf);
        $party = $this->agingType() === 'ar' ? 'Customer' : 'Supplier';
        $title = $this->agingType() === 'ar' ? 'Accounts Receivable Aging' : 'Accounts Payable Aging';
        $bucketHeads = ['Current', '1–30', '31–60', '61–90', 'Over 90'];

        if ($view === 'summary') {
            $headings = [$party, ...$bucketHeads, 'Total'];
            $rows = array_map(fn ($r) => [$r['party_name'], $r['current'], $r['days_1_30'], $r['days_31_60'], $r['days_61_90'], $r['days_over_90'], $r['total']], $report['summary']);
            $t = $report['totals'];
            $rows[] = ['Total', $t['current'], $t['days_1_30'], $t['days_31_60'], $t['days_61_90'], $t['days_over_90'], $t['total']];
        } else {
            $headings = ['Document', 'Reference', $party, 'Date', 'Due date', 'Days past due', 'Bucket', 'Total', 'Paid', 'Balance'];
            $labels = array_combine(AgingReportService::BUCKETS, $bucketHeads);
            $rows = array_map(fn ($d) => [$d['number'], $d['external_ref'], $d['party_name'], $d['doc_date'], $d['due_date'], $d['days_past_due'], $labels[$d['bucket']], $d['total'], $d['paid_as_of'], $d['balance']], $report['details']);
            $rows[] = ['Total', '', '', '', '', '', '', '', '', $report['totals']['total']];
        }

        return Excel::download(
            new ArrayExport($headings, $rows, [app(EntityContext::class)->current()?->name.' — '.$title.' ('.$view.')', 'As of '.Carbon::parse($asOf)->format('F j, Y')], $title),
            str($title)->slug().'-'.$view.'-'.$asOf.'.xlsx',
        );
    }

    protected function asOf(Request $request): string
    {
        return $request->validate(['as_of' => ['nullable', 'date']])['as_of'] ?? Carbon::now('Asia/Manila')->toDateString();
    }
}
