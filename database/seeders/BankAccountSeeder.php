<?php

namespace Database\Seeders;

use App\Models\BankAccount;
use App\Models\Entity;
use App\Support\ChartOfAccounts;
use Illuminate\Database\Seeder;

/**
 * Bank accounts as the proposal sets them out (§3.5): four accounts shared between JAM Opticus and A. Jamora Optical,
 * and one dedicated to AL Jamora Optical. Each company using an account gets its own Cash in Bank ledger account for
 * it. Names and banks are placeholders until the real accounts are entered.
 */
class BankAccountSeeder extends Seeder
{
    /** code => holder, the other companies sharing it, name, bank */
    public const ACCOUNTS = [
        'BANK1' => ['holder' => 'JAM_OPTICUS', 'shared_with' => ['A_JAMORA'], 'name' => 'Shared Operating Account 1', 'bank_name' => 'BDO'],
        'BANK2' => ['holder' => 'A_JAMORA', 'shared_with' => ['JAM_OPTICUS'], 'name' => 'Shared Operating Account 2', 'bank_name' => 'BPI'],
        'BANK3' => ['holder' => 'JAM_OPTICUS', 'shared_with' => ['A_JAMORA'], 'name' => 'Shared Operating Account 3', 'bank_name' => 'Metrobank'],
        'BANK4' => ['holder' => 'JAM_OPTICUS', 'shared_with' => ['A_JAMORA'], 'name' => 'Shared Operating Account 4', 'bank_name' => 'UnionBank'],
        'BANK5' => ['holder' => 'AL_JAMORA', 'shared_with' => [], 'name' => 'AL Jamora Dedicated Account', 'bank_name' => 'BDO'],
    ];

    public function run(): void
    {
        $entities = Entity::query()->pluck('id', 'code');

        foreach (self::ACCOUNTS as $code => $row) {
            if (! isset($entities[$row['holder']])) {
                continue;
            }

            $bank = BankAccount::query()->withoutGlobalScope('entity')->updateOrCreate(
                ['code' => $code],
                [
                    'entity_id' => $entities[$row['holder']],
                    'name' => $row['name'],
                    'bank_name' => $row['bank_name'],
                    'is_active' => true,
                ]
            );

            ChartOfAccounts::ensureBankLedger($bank);
            foreach ($row['shared_with'] as $company) {
                if (isset($entities[$company])) {
                    ChartOfAccounts::ensureBankLedger($bank, (int) $entities[$company]);
                }
            }
        }
    }
}
