<?php

namespace App\Http\Controllers\Accounting;

use App\Exports\ArrayExport;
use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Services\Accounting\LedgerService;
use App\Support\EntityContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class GeneralLedgerController extends Controller
{
    public function __construct(private readonly LedgerService $ledgerService) {}

    public function index(Request $request): Response
    {
        $filters = $this->filters($request);

        return Inertia::render('accounting/general-ledger/page', [
            'accounts' => Account::query()
                ->with('accountType:id,classification')
                ->where('is_postable', true)
                ->where('is_active', true)
                ->orderBy('code')
                ->get(['id', 'code', 'name', 'account_type_id'])
                ->map(fn (Account $a) => ['id' => $a->id, 'code' => $a->code, 'name' => $a->name, 'classification' => $a->accountType?->classification])
                ->values(),
            'filters' => $filters,
            'ledger' => $filters['account_id']
                ? $this->ledgerService->getLedger($filters['account_id'], $filters['date_from'], $filters['date_to'])
                : null,
        ]);
    }

    /** Kept for API consumers of the previous JSON endpoint. */
    public function data(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'integer', 'exists:accounts,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        return response()->json($this->ledgerService->getLedger((int) $validated['account_id'], $validated['date_from'] ?? null, $validated['date_to'] ?? null));
    }

    public function export(Request $request): BinaryFileResponse
    {
        $filters = $this->filters($request);
        abort_unless($filters['account_id'], 422, 'Select an account to export.');

        $ledger = $this->ledgerService->getLedger($filters['account_id'], $filters['date_from'], $filters['date_to']);
        $account = $ledger['account'];

        $rows = [['', '', '', 'Balance brought forward', '', '', $ledger['opening_balance']]];
        foreach ($ledger['lines'] as $line) {
            $rows[] = [$line['entry_date'], $line['entry_no'], $line['journal_code'], $line['memo'], $line['debit'] ?: null, $line['credit'] ?: null, $line['running_balance']];
        }
        $rows[] = ['', '', '', 'Totals / closing balance', $ledger['total_debit'], $ledger['total_credit'], $ledger['closing_balance']];

        return Excel::download(
            new ArrayExport(
                ['Date', 'Entry no.', 'Journal', 'Description', 'Debit', 'Credit', 'Balance'],
                $rows,
                [
                    app(EntityContext::class)->current()?->name.' — General Ledger',
                    "{$account['code']} {$account['name']}",
                    'Period: '.($filters['date_from'] ?? 'beginning').' to '.($filters['date_to'] ?? 'date'),
                ],
                'General Ledger',
            ),
            "general-ledger-{$account['code']}-{$filters['date_from']}-{$filters['date_to']}.xlsx",
        );
    }

    /**
     * @return array{account_id: int|null, date_from: string|null, date_to: string|null}
     */
    protected function filters(Request $request): array
    {
        $validated = $request->validate([
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);

        return [
            'account_id' => isset($validated['account_id']) ? (int) $validated['account_id'] : null,
            'date_from' => $validated['date_from'] ?? Carbon::now('Asia/Manila')->startOfMonth()->toDateString(),
            'date_to' => $validated['date_to'] ?? Carbon::now('Asia/Manila')->toDateString(),
        ];
    }
}
