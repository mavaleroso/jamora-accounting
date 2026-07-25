<?php

namespace App\Http\Controllers\Reports;

use App\Exports\JournalRegisterExport;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Reports\Concerns\ProvidesPeriodOptions;
use App\Http\Resources\JournalEntryResource;
use App\Models\JournalEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class JournalRegisterController extends Controller
{
    use ProvidesPeriodOptions;

    public function index(): Response
    {
        return Inertia::render('reports/journal-register/page', [
            'periods' => $this->periodOptions(),
        ]);
    }

    public function list(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'page' => ['required', 'integer', 'min:1'],
            'per_page' => ['required', 'integer', 'min:1', 'max:100'],
            'period_id' => ['nullable', 'integer', 'exists:accounting_periods,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'status' => ['nullable', 'string', 'in:posted,all'],
        ]);

        $query = JournalEntry::query()
            ->with(['journal'])
            ->orderByDesc('entry_date')
            ->orderByDesc('id');

        $status = $validated['status'] ?? 'posted';
        if ($status !== 'all') {
            $query->where('status', 'posted');
        }

        if (! empty($validated['period_id'])) {
            $query->where('accounting_period_id', $validated['period_id']);
        }

        if (! empty($validated['date_from'])) {
            $query->where('entry_date', '>=', $validated['date_from']);
        }

        if (! empty($validated['date_to'])) {
            $query->where('entry_date', '<=', $validated['date_to']);
        }

        $paginator = $query->paginate(
            (int) $validated['per_page'],
            ['*'],
            'page',
            (int) $validated['page']
        );

        $resource = JournalEntryResource::collection(collect($paginator->items()))->toArray($request);

        return response()->json([
            'journal_entries' => $resource,
            'total' => $paginator->total(),
        ]);
    }

    public function export(Request $request): BinaryFileResponse
    {
        $validated = $request->validate([
            'period_id' => ['nullable', 'integer', 'exists:accounting_periods,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'status' => ['nullable', 'string', 'in:posted,all'],
        ]);

        $query = JournalEntry::query()
            ->with(['journal'])
            ->orderByDesc('entry_date')
            ->orderByDesc('id');

        $status = $validated['status'] ?? 'posted';
        if ($status !== 'all') {
            $query->where('status', 'posted');
        }

        if (! empty($validated['period_id'])) {
            $query->where('accounting_period_id', $validated['period_id']);
        }

        if (! empty($validated['date_from'])) {
            $query->where('entry_date', '>=', $validated['date_from']);
        }

        if (! empty($validated['date_to'])) {
            $query->where('entry_date', '<=', $validated['date_to']);
        }

        $rows = $query->get()->map(fn (JournalEntry $entry) => [
            'entry_date' => $entry->entry_date?->toDateString(),
            'entry_no' => $entry->entry_no,
            'journal_code' => $entry->journal?->code,
            'reference' => $entry->reference,
            'memo' => $entry->memo,
            'status' => $entry->status,
            'total_debit' => (float) $entry->total_debit,
            'total_credit' => (float) $entry->total_credit,
        ])->values()->all();

        return Excel::download(
            new JournalRegisterExport($rows),
            'journal-register.xlsx'
        );
    }
}
