<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\PostingRule;
use App\Support\EntityContext;
use Illuminate\Database\Seeder;

class PostingRulesSeeder extends Seeder
{
    public function run(): void
    {
        $entityId = app(EntityContext::class)->id();
        if (! $entityId) {
            return;
        }

        $accounts = Account::withoutGlobalScope('entity')
            ->where('entity_id', $entityId)
            ->whereIn('code', ['1000', '1020', '1100', '1200', '2000', '2100', '4000', '4100', '5000'])
            ->pluck('id', 'code');

        $rules = [
            [
                'event' => 'ar',
                'name' => 'Accounts Receivable',
                'debit_code' => '1100',
                'credit_code' => '4000',
                'sort_order' => 10,
            ],
            [
                'event' => 'sales_revenue',
                'name' => 'Sales Revenue',
                'debit_code' => '1100',
                'credit_code' => '4000',
                'sort_order' => 20,
            ],
            [
                'event' => 'sales_discount',
                'name' => 'Sales Discounts',
                'debit_code' => '4100',
                'credit_code' => '4000',
                'sort_order' => 30,
            ],
            [
                'event' => 'output_vat',
                'name' => 'Output VAT',
                'debit_code' => '1100',
                'credit_code' => '2100',
                'sort_order' => 40,
            ],
            [
                'event' => 'collection_cash',
                'name' => 'Cash Collection',
                'debit_code' => '1000',
                'credit_code' => '1100',
                'sort_order' => 50,
            ],
            [
                'event' => 'collection_card',
                'name' => 'Card Collection',
                'debit_code' => '1020',
                'credit_code' => '1100',
                'sort_order' => 60,
            ],
            [
                'event' => 'cogs',
                'name' => 'Cost of Goods Sold',
                'debit_code' => '5000',
                'credit_code' => '1200',
                'sort_order' => 70,
            ],
            [
                'event' => 'purchase_inventory',
                'name' => 'Inventory Purchase',
                'debit_code' => '1200',
                'credit_code' => '2000',
                'sort_order' => 80,
            ],
        ];

        foreach ($rules as $rule) {
            $debitId = $accounts[$rule['debit_code']] ?? null;
            $creditId = $accounts[$rule['credit_code']] ?? null;

            if (! $debitId || ! $creditId) {
                continue;
            }

            PostingRule::withoutGlobalScope('entity')->updateOrCreate(
                ['entity_id' => $entityId, 'event' => $rule['event']],
                [
                    'name' => $rule['name'],
                    'debit_account_id' => $debitId,
                    'credit_account_id' => $creditId,
                    'is_active' => true,
                    'sort_order' => $rule['sort_order'],
                ]
            );
        }
    }
}
