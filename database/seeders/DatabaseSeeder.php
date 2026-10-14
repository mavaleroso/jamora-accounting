<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            UserSeeder::class,
            EntitySeeder::class,
            AccountingSetupSeeder::class, // also runs PostingRulesSeeder per entity
            BankAccountSeeder::class,
            DemoDataSeeder::class,
            PeopleSetupSeeder::class,
            EmployeeDirectorySeeder::class,
            AttendanceDemoSeeder::class,
        ]);
    }
}
