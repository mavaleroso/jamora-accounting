<?php

namespace App\Services\Accounting;

use App\Models\Account;
use App\Models\AccountingPeriod;
use App\Models\AccountPeriodBalance;

class FinancialStatementService
{
    public function __construct(
        protected TrialBalanceService $trialBalanceService
    ) {}

    public function incomeStatement(int $periodId): array
    {
        $trialBalance = $this->trialBalanceService->getTrialBalance($periodId);

        $revenue = [];
        $expenses = [];
        $totalRevenue = 0.0;
        $totalExpenses = 0.0;

        foreach ($trialBalance as $row) {
            if ($row['classification'] === 'revenue') {
                $amount = $row['credit'] - $row['debit'];
                $revenue[] = [
                    'account_code' => $row['account_code'],
                    'account_name' => $row['account_name'],
                    'amount' => round($amount, 2),
                ];
                $totalRevenue += $amount;
            } elseif ($row['classification'] === 'expense') {
                $amount = $row['debit'] - $row['credit'];
                $expenses[] = [
                    'account_code' => $row['account_code'],
                    'account_name' => $row['account_name'],
                    'amount' => round($amount, 2),
                ];
                $totalExpenses += $amount;
            }
        }

        return [
            'revenue' => $revenue,
            'expenses' => $expenses,
            'total_revenue' => round($totalRevenue, 2),
            'total_expenses' => round($totalExpenses, 2),
            'net_income' => round($totalRevenue - $totalExpenses, 2),
        ];
    }

    public function balanceSheet(int $periodId): array
    {
        $trialBalance = $this->trialBalanceService->getTrialBalance($periodId);
        $incomeStatement = $this->incomeStatement($periodId);

        $assets = [];
        $liabilities = [];
        $equity = [];
        $totalAssets = 0.0;
        $totalLiabilities = 0.0;
        $totalEquity = 0.0;
        $retainedEarningsCode = config('accounting.retained_earnings_code', '3100');
        $retainedEarningsIncluded = false;

        foreach ($trialBalance as $row) {
            $amount = match ($row['classification']) {
                'asset' => $row['debit'] - $row['credit'],
                'liability' => $row['credit'] - $row['debit'],
                'equity' => $row['credit'] - $row['debit'],
                default => 0.0,
            };

            if (abs($amount) < 0.01) {
                continue;
            }

            $line = [
                'account_code' => $row['account_code'],
                'account_name' => $row['account_name'],
                'amount' => round($amount, 2),
            ];

            match ($row['classification']) {
                'asset' => $assets[] = $line,
                'liability' => $liabilities[] = $line,
                'equity' => $equity[] = $line,
                default => null,
            };

            if ($row['account_code'] === $retainedEarningsCode) {
                $retainedEarningsIncluded = true;
            }

            match ($row['classification']) {
                'asset' => $totalAssets += $amount,
                'liability' => $totalLiabilities += $amount,
                'equity' => $totalEquity += $amount,
                default => null,
            };
        }

        $netIncome = $incomeStatement['net_income'];
        if (abs($netIncome) >= 0.01) {
            if ($retainedEarningsIncluded) {
                foreach ($equity as &$line) {
                    if ($line['account_code'] === $retainedEarningsCode) {
                        $line['amount'] = round($line['amount'] + $netIncome, 2);
                        break;
                    }
                }
                unset($line);
            } else {
                $retainedAccount = Account::where('code', $retainedEarningsCode)->first();
                $equity[] = [
                    'account_code' => $retainedEarningsCode,
                    'account_name' => $retainedAccount?->name ?? 'Retained Earnings',
                    'amount' => round($netIncome, 2),
                ];
            }
            $totalEquity += $netIncome;
        }

        return [
            'assets' => $assets,
            'liabilities' => $liabilities,
            'equity' => $equity,
            'total_assets' => round($totalAssets, 2),
            'total_liabilities' => round($totalLiabilities, 2),
            'total_equity' => round($totalEquity, 2),
            'net_income_plug' => round($netIncome, 2),
        ];
    }

    public function cashFlow(int $periodId): array
    {
        $period = AccountingPeriod::findOrFail($periodId);

        $balances = AccountPeriodBalance::query()
            ->with(['account'])
            ->where('accounting_period_id', $periodId)
            ->whereHas('account', fn ($q) => $q->whereNotNull('cash_flow_section'))
            ->get();

        $sections = [
            'operating' => ['lines' => [], 'total' => 0.0],
            'investing' => ['lines' => [], 'total' => 0.0],
            'financing' => ['lines' => [], 'total' => 0.0],
        ];

        foreach ($balances as $balance) {
            $section = $balance->account->cash_flow_section;
            if (! isset($sections[$section])) {
                continue;
            }

            $change = ((float) $balance->period_debit - (float) $balance->period_credit);
            if (abs($change) < 0.01) {
                continue;
            }

            $sections[$section]['lines'][] = [
                'account_code' => $balance->account->code,
                'account_name' => $balance->account->name,
                'amount' => round($change, 2),
            ];
            $sections[$section]['total'] += $change;
        }

        $incomeStatement = $this->incomeStatement($periodId);
        $netIncome = $incomeStatement['net_income'];

        array_unshift($sections['operating']['lines'], [
            'account_code' => null,
            'account_name' => 'Net Income',
            'amount' => round($netIncome, 2),
        ]);
        $sections['operating']['total'] += $netIncome;

        foreach ($sections as $key => $section) {
            $sections[$key]['total'] = round($section['total'], 2);
        }

        $netCashChange = $sections['operating']['total']
            + $sections['investing']['total']
            + $sections['financing']['total'];

        return [
            'operating' => $sections['operating'],
            'investing' => $sections['investing'],
            'financing' => $sections['financing'],
            'net_cash_change' => round($netCashChange, 2),
        ];
    }
}
