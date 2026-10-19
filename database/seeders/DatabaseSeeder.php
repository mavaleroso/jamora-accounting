<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * The setup only. Sample data is separate: php artisan db:seed --class=DemoSeeder
     * (and php artisan accounting:clear-demo-data removes it again).
     */
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            UserSeeder::class,
            EntitySeeder::class,
            AccountingSetupSeeder::class, // chart of accounts and posting rules for every entity
            BankAccountSeeder::class,
            PeopleSetupSeeder::class,
        ]);
    }
}
