<?php

namespace Database\Seeders;

use App\Models\Account;
use App\Models\BankAccount;
use App\Models\Entity;
use Illuminate\Database\Seeder;

class BankAccountSeeder extends Seeder
{
    public function run(): void
    {
        $jam = Entity::query()->where('code', 'JAM_OPTICUS')->first();
        $aJamora = Entity::query()->where('code', 'A_JAMORA')->first();
        $alJamora = Entity::query()->where('code', 'AL_JAMORA')->first();

        $shared = [
            ['code' => 'BANK1', 'name' => 'Shared Operating Account 1', 'bank_name' => 'BDO'],
            ['code' => 'BANK2', 'name' => 'Shared Operating Account 2', 'bank_name' => 'BPI'],
            ['code' => 'BANK3', 'name' => 'Shared Operating Account 3', 'bank_name' => 'Metrobank'],
            ['code' => 'BANK4', 'name' => 'Shared Operating Account 4', 'bank_name' => 'UnionBank'],
        ];

        foreach ($shared as $row) {
            $account = BankAccount::query()->updateOrCreate(
                ['code' => $row['code']],
                [
                    'name' => $row['name'],
                    'bank_name' => $row['bank_name'],
                    'is_shared' => true,
                    'is_active' => true,
                ]
            );
            $ids = array_filter([$jam?->id, $aJamora?->id]);
            $account->entities()->sync($ids);
        }

        $alAccount = BankAccount::query()->updateOrCreate(
            ['code' => 'BANK5'],
            [
                'name' => 'AL Jamora Dedicated Account',
                'bank_name' => 'BDO',
                'is_shared' => false,
                'is_active' => true,
            ]
        );
        if ($alJamora) {
            $alAccount->entities()->sync([$alJamora->id]);
        }
    }
}
