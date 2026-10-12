<?php

namespace Database\Seeders;

use App\Enums\RoleEnum;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $user = User::query()->updateOrCreate(
            ['username' => 'admin'],
            [
                'email' => 'admin@jamora.local',
                'email_verified_at' => now(),
                'password' => Hash::make('password'),
                'firstname' => 'Admin',
                'middlename' => null,
                'lastname' => 'User',
                'avatar' => null,
                'address' => null,
                'sex' => null,
                'contact_number' => null,
                'birthdate' => null,
                'position' => 'Administrator',
                'date_started' => null,
                'status' => true,
            ]
        );

        $user->syncRoles([RoleEnum::Admin->value]);

        $employeeUser = User::query()->updateOrCreate(
            ['username' => 'employee'],
            [
                'email' => 'employee@jamora.local',
                'email_verified_at' => now(),
                'password' => Hash::make('password'),
                'firstname' => 'Staff',
                'middlename' => 'Demo',
                'lastname' => 'Employee',
                'avatar' => null,
                'address' => 'Iloilo City',
                'sex' => 'Female',
                'contact_number' => '09170001122',
                'birthdate' => '1995-04-12',
                'position' => 'Optical Staff / Assistant',
                'date_started' => '2024-01-01',
                'status' => true,
            ]
        );

        $employeeUser->syncRoles([RoleEnum::Employee->value]);
    }
}
