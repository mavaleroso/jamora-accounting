<?php

namespace App\Http\Controllers\Accounting;

use App\Http\Controllers\Controller;
use App\Http\Resources\JournalEntryResource;
use App\Models\Account;
use App\Models\AccountingPeriod;
use App\Models\AccountPeriodBalance;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\SyncDocument;
use App\Models\SyncRun;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(Request $request): Response|RedirectResponse
    {
        $user = $request->user();
        if ($user && ! $user->can('dashboard.view')) {
            if ($user->can('portal.view')) {
                return redirect()->route('employee-management.portal.index');
            }
            if ($user->can('attendance.view')) {
                return redirect()->route('employee-management.attendance.index');
            }
            abort(403, 'Unauthorized.');
        }

        return Inertia::render('accounting/dashboard/page', $this->dashboardData());
    }

    public function data(): JsonResponse
    {
        return response()->json($this->dashboardData());
    }

    /**
     * @return array<string, mixed>
     */
    private function dashboardData(): array
    {
        $now = Carbon::now('Asia/Manila');
        $monthStart = $now->copy()->startOfMonth()->toDateString();
        $monthEnd = $now->copy()->endOfMonth()->toDateString();
        $yearStart = $now->copy()->startOfYear()->toDateString();
        $yearEnd = $now->copy()->endOfYear()->toDateString();

        $openPeriod = AccountingPeriod::query()
            ->where('status', 'open')
            ->where('start_date', '<=', $now->toDateString())
            ->where('end_date', '>=', $now->toDateString())
            ->orderBy('start_date')
            ->first();

        return [
            'unpostedEntriesCount' => JournalEntry::query()
                ->whereIn('status', ['draft', 'pending'])
                ->count(),
            'syncExceptionCount' => SyncDocument::query()
                ->where('status', 'failed')
                ->count(),
            'cashPosition' => round($this->cashPosition($openPeriod, $yearStart, $yearEnd), 2),
            'arBalance' => round((float) \App\Models\PartnerBalance::query()
                ->whereHas('partner')
                ->sum('balance'), 2),
            'apBalance' => round((float) \App\Models\Bill::query()
                ->whereIn('status', ['posted', 'partially_paid'])
                ->sum('balance_due'), 2),
            'depositsLiability' => round((float) \App\Models\CustomerDeposit::query()
                ->where('status', 'open')
                ->sum(DB::raw('amount - applied_amount')), 2),
            'revenueMTD' => round($this->classificationTotal('revenue', $monthStart, $monthEnd), 2),
            'revenueYTD' => round($this->classificationTotal('revenue', $yearStart, $yearEnd), 2),
            'expenseMTD' => round($this->classificationTotal('expense', $monthStart, $monthEnd), 2),
            'revenueTrend' => $this->revenueTrend($now),
            'expenseMix' => $this->expenseMix($monthStart, $monthEnd),
            'recentJournalEntries' => $this->recentJournalEntries(),
            'lastSyncRun' => $this->lastSyncRun(),
            'currentPeriod' => $openPeriod ? [
                'id' => $openPeriod->id,
                'period_no' => $openPeriod->period_no,
                'start_date' => $openPeriod->start_date->toDateString(),
                'end_date' => $openPeriod->end_date->toDateString(),
            ] : null,
        ];
    }

    private function cashPosition(?AccountingPeriod $openPeriod, string $yearStart, string $yearEnd): float
    {
        $cashCodes = ['1000', '1010', '1020'];
        $accounts = Account::query()
            ->with('accountType')
            ->whereIn('code', $cashCodes)
            ->get();

        if ($accounts->isEmpty()) {
            return 0.0;
        }

        if ($openPeriod) {
            $balances = AccountPeriodBalance::query()
                ->where('accounting_period_id', $openPeriod->id)
                ->whereIn('account_id', $accounts->pluck('id'))
                ->get()
                ->keyBy('account_id');

            if ($balances->isNotEmpty()) {
                $total = 0.0;
                foreach ($accounts as $account) {
                    $balance = $balances->get($account->id);
                    if (! $balance) {
                        continue;
                    }
                    $total += $this->netBalance(
                        (float) $balance->closing_debit,
                        (float) $balance->closing_credit,
                        $account->accountType->normal_balance
                    );
                }

                return $total;
            }
        }

        $total = 0.0;
        foreach ($accounts as $account) {
            $row = JournalEntryLine::query()
                ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
                ->where('journal_entry_lines.account_id', $account->id)
                ->where('journal_entries.status', 'posted')
                ->whereBetween('journal_entries.entry_date', [$yearStart, $yearEnd])
                ->select([
                    DB::raw('COALESCE(SUM(journal_entry_lines.debit), 0) as total_debit'),
                    DB::raw('COALESCE(SUM(journal_entry_lines.credit), 0) as total_credit'),
                ])
                ->first();

            $total += $this->netBalance(
                (float) ($row->total_debit ?? 0),
                (float) ($row->total_credit ?? 0),
                $account->accountType->normal_balance
            );
        }

        return $total;
    }

    private function netBalance(float $debit, float $credit, string $normalBalance): float
    {
        if ($normalBalance === 'credit') {
            return $credit - $debit;
        }

        return $debit - $credit;
    }

    private function classificationTotal(string $classification, string $from, string $to): float
    {
        $row = JournalEntryLine::query()
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->join('accounts', 'journal_entry_lines.account_id', '=', 'accounts.id')
            ->join('account_types', 'accounts.account_type_id', '=', 'account_types.id')
            ->where('journal_entries.status', 'posted')
            ->where('account_types.classification', $classification)
            ->whereBetween('journal_entries.entry_date', [$from, $to])
            ->select([
                DB::raw('COALESCE(SUM(journal_entry_lines.debit), 0) as total_debit'),
                DB::raw('COALESCE(SUM(journal_entry_lines.credit), 0) as total_credit'),
            ])
            ->first();

        $debit = (float) ($row->total_debit ?? 0);
        $credit = (float) ($row->total_credit ?? 0);

        if ($classification === 'revenue') {
            return $credit - $debit;
        }

        return $debit - $credit;
    }

    /**
     * @return list<array{month: string, revenue: float, expense: float}>
     */
    private function revenueTrend(Carbon $now): array
    {
        $trend = [];

        for ($i = 5; $i >= 0; $i--) {
            $month = $now->copy()->subMonths($i);
            $from = $month->copy()->startOfMonth()->toDateString();
            $to = $month->copy()->endOfMonth()->toDateString();

            $trend[] = [
                'month' => $month->format('M Y'),
                'revenue' => round($this->classificationTotal('revenue', $from, $to), 2),
                'expense' => round($this->classificationTotal('expense', $from, $to), 2),
            ];
        }

        return $trend;
    }

    /**
     * @return list<array{name: string, amount: float}>
     */
    private function expenseMix(string $from, string $to): array
    {
        return JournalEntryLine::query()
            ->join('journal_entries', 'journal_entry_lines.journal_entry_id', '=', 'journal_entries.id')
            ->join('accounts', 'journal_entry_lines.account_id', '=', 'accounts.id')
            ->join('account_types', 'accounts.account_type_id', '=', 'account_types.id')
            ->where('journal_entries.status', 'posted')
            ->where('account_types.classification', 'expense')
            ->whereBetween('journal_entries.entry_date', [$from, $to])
            ->groupBy('accounts.id', 'accounts.name')
            ->select([
                'accounts.name',
                DB::raw('SUM(journal_entry_lines.debit) - SUM(journal_entry_lines.credit) as amount'),
            ])
            ->orderByDesc('amount')
            ->limit(8)
            ->get()
            ->map(fn ($row) => [
                'name' => $row->name,
                'amount' => round((float) $row->amount, 2),
            ])
            ->filter(fn (array $row) => abs($row['amount']) >= 0.01)
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function recentJournalEntries(): array
    {
        $entries = JournalEntry::query()
            ->with(['journal'])
            ->orderByDesc('entry_date')
            ->orderByDesc('id')
            ->limit(5)
            ->get();

        $resource = JournalEntryResource::collection($entries)->toArray(request());

        return $resource['data'] ?? [];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function lastSyncRun(): ?array
    {
        $run = SyncRun::query()
            ->with('triggeredByUser:id,name,username')
            ->orderByDesc('started_at')
            ->first();

        if (! $run) {
            return null;
        }

        return [
            'id' => $run->id,
            'started_at' => $run->started_at?->copy()->timezone('Asia/Manila')->toIso8601String(),
            'finished_at' => $run->finished_at?->copy()->timezone('Asia/Manila')->toIso8601String(),
            'status' => $run->status,
            'from_date' => $run->from_date?->toDateString(),
            'to_date' => $run->to_date?->toDateString(),
            'processed' => $run->processed,
            'created_entries' => $run->created_entries,
            'skipped' => $run->skipped,
            'failed' => $run->failed,
            'message' => $run->message,
            'triggered_by' => $run->triggeredByUser?->name ?? $run->triggeredByUser?->username,
        ];
    }
}
