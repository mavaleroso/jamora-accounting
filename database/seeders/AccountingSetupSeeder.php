<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\AccountingPeriod;
use App\Models\AccountType;
use App\Models\CostCenter;
use App\Models\FiscalYear;
use App\Models\Journal;
use App\Models\TaxCode;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class AccountingSetupSeeder extends Seeder
{
    public function run(): void
    {
        $accountTypes = $this->seedAccountTypes();
        $this->seedChartOfAccounts($accountTypes);
        $this->seedJournals();
        $this->seedTaxCodes();
        $this->seedCostCenters();
        $this->seedFiscalYearAndPeriods();
        $this->call(PostingRulesSeeder::class);
    }

    protected function seedAccountTypes(): array
    {
        $types = [
            ['name' => 'Current Assets', 'classification' => 'asset', 'normal_balance' => 'debit', 'statement' => 'BS'],
            ['name' => 'Non-current Assets', 'classification' => 'asset', 'normal_balance' => 'debit', 'statement' => 'BS'],
            ['name' => 'Current Liabilities', 'classification' => 'liability', 'normal_balance' => 'credit', 'statement' => 'BS'],
            ['name' => 'Non-current Liabilities', 'classification' => 'liability', 'normal_balance' => 'credit', 'statement' => 'BS'],
            ['name' => 'Equity', 'classification' => 'equity', 'normal_balance' => 'credit', 'statement' => 'BS'],
            ['name' => 'Operating Revenue', 'classification' => 'revenue', 'normal_balance' => 'credit', 'statement' => 'IS'],
            ['name' => 'Other Revenue', 'classification' => 'revenue', 'normal_balance' => 'credit', 'statement' => 'IS'],
            ['name' => 'Cost of Sales', 'classification' => 'expense', 'normal_balance' => 'debit', 'statement' => 'IS'],
            ['name' => 'Operating Expenses', 'classification' => 'expense', 'normal_balance' => 'debit', 'statement' => 'IS'],
            ['name' => 'Other Expenses', 'classification' => 'expense', 'normal_balance' => 'debit', 'statement' => 'IS'],
        ];

        $result = [];
        foreach ($types as $type) {
            $result[$type['name']] = AccountType::firstOrCreate(
                ['name' => $type['name']],
                $type
            );
        }

        return $result;
    }

    protected function seedChartOfAccounts(array $types): void
    {
        $accounts = [
            ['code' => '1000', 'name' => 'Cash on Hand', 'type' => 'Current Assets', 'cash_flow_section' => 'operating'],
            ['code' => '1010', 'name' => 'Cash in Bank', 'type' => 'Current Assets', 'cash_flow_section' => 'operating'],
            ['code' => '1020', 'name' => 'Card Clearing', 'type' => 'Current Assets', 'cash_flow_section' => 'operating'],
            ['code' => '1100', 'name' => 'Accounts Receivable', 'type' => 'Current Assets', 'cash_flow_section' => 'operating'],
            ['code' => '1200', 'name' => 'Inventory', 'type' => 'Current Assets'],
            ['code' => '1300', 'name' => 'Input VAT', 'type' => 'Current Assets'],
            ['code' => '1500', 'name' => 'Property and Equipment', 'type' => 'Non-current Assets', 'cash_flow_section' => 'investing'],
            ['code' => '2000', 'name' => 'Accounts Payable', 'type' => 'Current Liabilities', 'cash_flow_section' => 'operating'],
            ['code' => '2100', 'name' => 'Output VAT', 'type' => 'Current Liabilities'],
            ['code' => '2200', 'name' => 'Accrued Expenses', 'type' => 'Current Liabilities', 'cash_flow_section' => 'operating'],
            ['code' => '3000', 'name' => 'Capital', 'type' => 'Equity', 'cash_flow_section' => 'financing'],
            ['code' => '3100', 'name' => 'Retained Earnings', 'type' => 'Equity'],
            ['code' => '4000', 'name' => 'Sales Revenue', 'type' => 'Operating Revenue'],
            ['code' => '4100', 'name' => 'Sales Discounts', 'type' => 'Operating Revenue', 'description' => 'Contra revenue account'],
            ['code' => '5000', 'name' => 'Cost of Goods Sold', 'type' => 'Cost of Sales'],
            ['code' => '6000', 'name' => 'Salaries and Wages', 'type' => 'Operating Expenses'],
            ['code' => '6100', 'name' => 'Rent Expense', 'type' => 'Operating Expenses'],
            ['code' => '6200', 'name' => 'Utilities Expense', 'type' => 'Operating Expenses'],
            ['code' => '6300', 'name' => 'Office Supplies', 'type' => 'Operating Expenses'],
            ['code' => '6400', 'name' => 'Miscellaneous Expense', 'type' => 'Other Expenses'],
        ];

        foreach ($accounts as $account) {
            Account::firstOrCreate(
                ['code' => $account['code']],
                [
                    'name' => $account['name'],
                    'account_type_id' => $types[$account['type']]->id,
                    'is_postable' => true,
                    'is_active' => true,
                    'cash_flow_section' => $account['cash_flow_section'] ?? null,
                    'description' => $account['description'] ?? null,
                ]
            );
        }
    }

    protected function seedJournals(): void
    {
        $cashOnHand = Account::where('code', '1000')->first();

        $journals = [
            ['code' => 'GJ', 'name' => 'General Journal', 'type' => 'general', 'sequence_prefix' => 'GJ'],
            ['code' => 'SJ', 'name' => 'Sales Journal', 'type' => 'sales', 'sequence_prefix' => 'SJ'],
            ['code' => 'CRJ', 'name' => 'Cash Receipts Journal', 'type' => 'cash_receipts', 'sequence_prefix' => 'CRJ', 'default_account_id' => $cashOnHand?->id],
            ['code' => 'CDJ', 'name' => 'Cash Disbursements Journal', 'type' => 'cash_disbursements', 'sequence_prefix' => 'CDJ', 'default_account_id' => $cashOnHand?->id],
            ['code' => 'PJ', 'name' => 'Purchases Journal', 'type' => 'purchases', 'sequence_prefix' => 'PJ'],
        ];

        foreach ($journals as $journal) {
            Journal::firstOrCreate(
                ['code' => $journal['code']],
                [
                    'name' => $journal['name'],
                    'type' => $journal['type'],
                    'sequence_prefix' => $journal['sequence_prefix'],
                    'default_account_id' => $journal['default_account_id'] ?? null,
                    'next_sequence' => 1,
                ]
            );
        }
    }

    protected function seedTaxCodes(): void
    {
        $outputVatAccount = Account::where('code', '2100')->first();
        $inputVatAccount = Account::where('code', '1300')->first();

        TaxCode::firstOrCreate(
            ['code' => 'OVAT'],
            [
                'name' => 'Output VAT 12%',
                'rate' => config('accounting.vat_rate', 0.12),
                'type' => 'output_vat',
                'account_id' => $outputVatAccount?->id,
                'is_active' => true,
            ]
        );

        TaxCode::firstOrCreate(
            ['code' => 'IVAT'],
            [
                'name' => 'Input VAT 12%',
                'rate' => config('accounting.vat_rate', 0.12),
                'type' => 'input_vat',
                'account_id' => $inputVatAccount?->id,
                'is_active' => true,
            ]
        );
    }

    protected function seedCostCenters(): void
    {
        $centers = [
            ['code' => 'MAIN', 'name' => 'Main'],
            ['code' => 'ROB', 'name' => 'Robinsons'],
            ['code' => 'SM', 'name' => 'SM'],
            ['code' => 'WHO', 'name' => 'Wholesale'],
            ['code' => 'WH', 'name' => 'Warehouse'],
        ];

        foreach ($centers as $center) {
            CostCenter::firstOrCreate(
                ['code' => $center['code']],
                [
                    'name' => $center['name'],
                    'is_active' => true,
                ]
            );
        }
    }

    protected function seedFiscalYearAndPeriods(): void
    {
        $year = (int) now()->year;

        $fiscalYear = FiscalYear::firstOrCreate(
            ['code' => "FY{$year}"],
            [
                'start_date' => Carbon::create($year, 1, 1)->toDateString(),
                'end_date' => Carbon::create($year, 12, 31)->toDateString(),
                'status' => 'open',
            ]
        );

        for ($month = 1; $month <= 12; $month++) {
            $start = Carbon::create($year, $month, 1);
            $end = $start->copy()->endOfMonth();

            AccountingPeriod::firstOrCreate(
                [
                    'fiscal_year_id' => $fiscalYear->id,
                    'period_no' => $month,
                ],
                [
                    'start_date' => $start->toDateString(),
                    'end_date' => $end->toDateString(),
                    'status' => 'open',
                ]
            );
        }
    }
}
