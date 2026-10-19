<?php

namespace Database\Seeders;

use App\Models\BankAccount;
use App\Models\Entity;
use App\Support\ChartOfAccounts;
use Illuminate\Database\Seeder;

/**
 * Demo bank accounts. Every bank account belongs to exactly one entity and gets its own Cash in Bank ledger
 * account in that entity's chart; no account is shared between entities.
 */
class BankAccountSeeder extends Seeder
{
    public const ACCOUNTS = [
        'JAM_OPTICUS' => [
            ['code' => 'JAM-BDO', 'name' => 'JAM Opticus Operating', 'bank_name' => 'BDO'],
            ['code' => 'JAM-BPI', 'name' => 'JAM Opticus Collections', 'bank_name' => 'BPI'],
        ],
        'A_JAMORA' => [
            ['code' => 'AJO-BPI', 'name' => 'A. Jamora Optical Operating', 'bank_name' => 'BPI'],
            ['code' => 'AJO-MBTC', 'name' => 'A. Jamora Optical Payroll', 'bank_name' => 'Metrobank'],
        ],
        'AL_JAMORA' => [
            ['code' => 'ALJ-BDO', 'name' => 'AL Jamora Optical Operating', 'bank_name' => 'BDO'],
        ],
    ];

    public function run(): void
    {
        foreach (self::ACCOUNTS as $entityCode => $accounts) {
            $entity = Entity::query()->where('code', $entityCode)->first();
            if (! $entity) {
                continue;
            }

            foreach ($accounts as $row) {
                $bank = BankAccount::query()->withoutGlobalScope('entity')->updateOrCreate(
                    ['code' => $row['code']],
                    [
                        'entity_id' => $entity->id,
                        'name' => $row['name'],
                        'bank_name' => $row['bank_name'],
                        'is_active' => true,
                    ]
                );

                ChartOfAccounts::ensureBankLedger($bank);
            }
        }
    }
}
