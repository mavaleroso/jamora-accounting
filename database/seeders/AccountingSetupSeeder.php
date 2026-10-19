<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\AccountingPeriod;
use App\Models\CostCenter;
use App\Models\Entity;
use App\Models\FiscalYear;
use App\Models\Journal;
use App\Models\TaxCode;
use App\Support\ChartOfAccounts;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class AccountingSetupSeeder extends Seeder
{
    public function run(): void
    {
        $context = app(EntityContext::class);

        foreach (Entity::query()->orderBy('id')->get() as $entity) {
            $context->set($entity);
            ChartOfAccounts::ensureFor($entity);
            $this->seedJournals($entity);
            $this->seedTaxCodes($entity);
            $this->seedCostCenters($entity);
            $this->seedFiscalYearAndPeriods($entity);
        }

        $context->clear();
    }

    protected function seedJournals(Entity $entity): void
    {
        $cashOnHand = Account::withoutGlobalScope('entity')
            ->where('entity_id', $entity->id)
            ->where('code', '1000')
            ->first();

        $journals = [
            ['code' => 'GJ', 'name' => 'General Journal', 'type' => 'general', 'sequence_prefix' => 'GJ'],
            ['code' => 'SJ', 'name' => 'Sales Journal', 'type' => 'sales', 'sequence_prefix' => 'SJ'],
            ['code' => 'CRJ', 'name' => 'Cash Receipts Journal', 'type' => 'cash_receipts', 'sequence_prefix' => 'CRJ', 'default_account_id' => $cashOnHand?->id],
            ['code' => 'CDJ', 'name' => 'Cash Disbursements Journal', 'type' => 'cash_disbursements', 'sequence_prefix' => 'CDJ', 'default_account_id' => $cashOnHand?->id],
            ['code' => 'PJ', 'name' => 'Purchases Journal', 'type' => 'purchases', 'sequence_prefix' => 'PJ'],
        ];

        foreach ($journals as $journal) {
            Journal::withoutGlobalScope('entity')->firstOrCreate(
                ['entity_id' => $entity->id, 'code' => $journal['code']],
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

    protected function seedTaxCodes(Entity $entity): void
    {
        $outputVatAccount = Account::withoutGlobalScope('entity')
            ->where('entity_id', $entity->id)->where('code', '2100')->first();
        $inputVatAccount = Account::withoutGlobalScope('entity')
            ->where('entity_id', $entity->id)->where('code', '1300')->first();

        TaxCode::withoutGlobalScope('entity')->firstOrCreate(
            ['entity_id' => $entity->id, 'code' => 'OVAT'],
            [
                'name' => 'Output VAT 12%',
                'rate' => config('accounting.vat_rate', 0.12),
                'type' => 'output_vat',
                'account_id' => $outputVatAccount?->id,
                'is_active' => true,
            ]
        );

        TaxCode::withoutGlobalScope('entity')->firstOrCreate(
            ['entity_id' => $entity->id, 'code' => 'IVAT'],
            [
                'name' => 'Input VAT 12%',
                'rate' => config('accounting.vat_rate', 0.12),
                'type' => 'input_vat',
                'account_id' => $inputVatAccount?->id,
                'is_active' => true,
            ]
        );
    }

    protected function seedCostCenters(Entity $entity): void
    {
        $centers = [
            ['code' => 'MAIN', 'name' => 'Main'],
            ['code' => 'ROB', 'name' => 'Robinsons'],
            ['code' => 'SM', 'name' => 'SM'],
            ['code' => 'WHO', 'name' => 'Wholesale'],
            ['code' => 'WH', 'name' => 'Warehouse'],
        ];

        foreach ($centers as $center) {
            CostCenter::withoutGlobalScope('entity')->firstOrCreate(
                ['entity_id' => $entity->id, 'code' => $center['code']],
                [
                    'name' => $center['name'],
                    'is_active' => true,
                ]
            );
        }
    }

    protected function seedFiscalYearAndPeriods(Entity $entity): void
    {
        $year = (int) now()->year;

        $fiscalYear = FiscalYear::withoutGlobalScope('entity')->firstOrCreate(
            ['entity_id' => $entity->id, 'code' => "FY{$year}"],
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
