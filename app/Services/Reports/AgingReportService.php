<?php

namespace App\Services\Reports;

use App\Models\Bill;
use App\Models\Invoice;
use Illuminate\Support\Carbon;

/**
 * Receivables / payables aging as of a date.
 *
 * - Includes documents dated on or before the as-of date that were confirmed/posted.
 * - The balance is the document total less payments dated on or before the as-of date, so a past as-of date
 *   reproduces what was outstanding then.
 * - Days past due are counted from the due date (document date when none). Due today or later is Current.
 * - Buckets: Current, 1–30, 31–60, 61–90, over 90 days.
 */
class AgingReportService
{
    public const BUCKETS = ['current', 'days_1_30', 'days_31_60', 'days_61_90', 'days_over_90'];

    /**
     * @param  'ar'|'ap'  $type
     * @return array{as_of: string, summary: list<array<string, mixed>>, details: list<array<string, mixed>>, totals: array<string, float>, overdue: float, party_count: int, document_count: int}
     */
    public function build(string $type, string $asOf): array
    {
        $asOfDate = Carbon::parse($asOf)->startOfDay();
        $documents = $type === 'ar' ? $this->invoices($asOf) : $this->bills($asOf);

        $details = [];
        $summary = [];
        $totals = array_fill_keys([...self::BUCKETS, 'total'], 0.0);

        foreach ($documents as $doc) {
            $balance = round($doc['total'] - $doc['paid_as_of'], 2);
            if ($balance <= 0.004) {
                continue;
            }

            $due = Carbon::parse($doc['due_date'] ?? $doc['doc_date'])->startOfDay();
            $daysPast = max(0, (int) $due->diffInDays($asOfDate, false));
            $bucket = $this->bucket($daysPast);

            $details[] = [...$doc, 'balance' => $balance, 'days_past_due' => $daysPast, 'bucket' => $bucket];

            $key = $doc['party_id'];
            $summary[$key] ??= ['party_id' => $key, 'party_code' => $doc['party_code'], 'party_name' => $doc['party_name'], ...array_fill_keys([...self::BUCKETS, 'total'], 0.0), 'documents' => 0];
            $summary[$key][$bucket] += $balance;
            $summary[$key]['total'] += $balance;
            $summary[$key]['documents']++;
            $totals[$bucket] += $balance;
            $totals['total'] += $balance;
        }

        usort($details, fn ($a, $b) => [$b['days_past_due'], $a['party_name']] <=> [$a['days_past_due'], $b['party_name']]);
        $summary = array_values($summary);
        usort($summary, fn ($a, $b) => $b['total'] <=> $a['total']);

        $round = fn (array $row) => array_map(fn ($v) => is_float($v) ? round($v, 2) : $v, $row);
        $totals = $round($totals);

        return [
            'as_of' => $asOfDate->toDateString(),
            'summary' => array_map($round, $summary),
            'details' => $details,
            'totals' => $totals,
            'overdue' => round($totals['total'] - $totals['current'], 2),
            'party_count' => count($summary),
            'document_count' => count($details),
        ];
    }

    public function bucket(int $daysPast): string
    {
        return match (true) {
            $daysPast <= 0 => 'current',
            $daysPast <= 30 => 'days_1_30',
            $daysPast <= 60 => 'days_31_60',
            $daysPast <= 90 => 'days_61_90',
            default => 'days_over_90',
        };
    }

    /** @return list<array<string, mixed>> */
    protected function invoices(string $asOf): array
    {
        return Invoice::query()
            ->with('partner:id,code,name')
            ->withSum(['payments as paid_as_of' => fn ($q) => $q->whereDate('paid_date', '<=', $asOf)], 'amount')
            ->whereIn('status', ['confirmed', 'partially_paid', 'paid'])
            ->whereDate('invoice_date', '<=', $asOf)
            ->get()
            ->map(fn (Invoice $i) => [
                'id' => $i->id,
                'number' => $i->invoice_no,
                'external_ref' => $i->bir_si_or_no,
                'party_id' => $i->partner_id,
                'party_code' => $i->partner?->code,
                'party_name' => $i->partner?->name ?? '—',
                'doc_date' => $i->invoice_date?->toDateString(),
                'due_date' => $i->due_date?->toDateString(),
                'total' => (float) $i->total_amount,
                'paid_as_of' => (float) $i->paid_as_of,
                'url' => "/billing/invoices/{$i->id}",
            ])
            ->all();
    }

    /** @return list<array<string, mixed>> */
    protected function bills(string $asOf): array
    {
        return Bill::query()
            ->with('vendor:id,code,name')
            ->withSum(['payments as paid_as_of' => fn ($q) => $q->whereDate('paid_date', '<=', $asOf)], 'amount')
            ->whereIn('status', ['posted', 'partially_paid', 'paid'])
            ->whereDate('bill_date', '<=', $asOf)
            ->get()
            ->map(fn (Bill $b) => [
                'id' => $b->id,
                'number' => $b->bill_no,
                'external_ref' => $b->vendor_invoice_no,
                'party_id' => $b->vendor_id,
                'party_code' => $b->vendor?->code,
                'party_name' => $b->vendor?->name ?? '—',
                'doc_date' => $b->bill_date?->toDateString(),
                'due_date' => $b->due_date?->toDateString(),
                'total' => (float) $b->total_amount,
                'paid_as_of' => (float) $b->paid_as_of,
                'url' => "/ap/bills/{$b->id}",
            ])
            ->all();
    }
}
