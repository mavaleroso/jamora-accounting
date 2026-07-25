<?php

namespace App\Http\Controllers\Accounting;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Services\Accounting\LedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GeneralLedgerController extends Controller
{
    public function __construct(
        private readonly LedgerService $ledgerService
    ) {}

    public function index(): Response
    {
        return Inertia::render('accounting/general-ledger/page', [
            'accounts' => Account::query()
                ->where('is_postable', true)
                ->where('is_active', true)
                ->orderBy('code')
                ->get(['id', 'code', 'name'])
                ->map(fn (Account $account) => [
                    'id' => $account->id,
                    'code' => $account->code,
                    'name' => $account->name,
                ])
                ->values()
                ->all(),
        ]);
    }

    public function data(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account_id' => ['required', 'integer', 'exists:accounts,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        $lines = $this->ledgerService->getLedger(
            (int) $validated['account_id'],
            $validated['date_from'] ?? null,
            $validated['date_to'] ?? null
        );

        return response()->json([
            'lines' => $lines,
        ]);
    }
}
