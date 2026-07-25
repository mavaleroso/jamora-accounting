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
    }
}
