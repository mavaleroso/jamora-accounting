<?php

namespace Database\Seeders;

use App\Enums\RoleEnum;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * The owner's admin login (password "password" — change it after the first sign-in). Staff logins come from
     * optical-new's users; demo logins for the other roles are in DemoUserSeeder.
     */
    public const USERS = [
        ['admin', 'Admin', null, 'User', 'Executive / Owner', RoleEnum::Admin],
    ];

    public function run(): void
    {
        // Keep this seeder runnable on its own, including role permissions.
        $this->call(RolesAndPermissionsSeeder::class);

        $this->seedUsers(static::USERS);
    }

    /**
     * @param  list<array{string, string, ?string, string, string, RoleEnum}>  $users
     */
    protected function seedUsers(array $users): void
    {

        foreach ($users as [$username, $firstname, $middlename, $lastname, $position, $role]) {
            $user = User::query()->updateOrCreate(
                ['username' => $username],
                [
                    'email' => "{$username}@jamora.local",
                    'email_verified_at' => now(),
                    'password' => Hash::make('password'),
                    'firstname' => $firstname,
                    'middlename' => $middlename,
                    'lastname' => $lastname,
                    'avatar' => null,
                    'address' => $username === 'employee' ? 'Iloilo City' : null,
                    'sex' => null,
                    'contact_number' => null,
                    'birthdate' => null,
                    'position' => $position,
                    'date_started' => null,
                    'status' => true,
                ]
            );

            $user->syncRoles([$role->value]);
        }
    }
}
