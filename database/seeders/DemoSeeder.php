<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

/**
 * Sample data for trying the system out, on top of DatabaseSeeder's setup:
 *
 *   php artisan db:seed --class=DemoSeeder
 *
 * php artisan accounting:clear-demo-data --force removes it again.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            DemoUserSeeder::class,
            DemoDataSeeder::class,
            EmployeeDirectorySeeder::class,
            AttendanceDemoSeeder::class,
            PayrollDemoSeeder::class,
        ]);
    }
}
