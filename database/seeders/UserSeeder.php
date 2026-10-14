<?php

namespace Database\Seeders;

use App\Enums\RoleEnum;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    /**
     * Create one demo login for each application role.
     * All seeded users use the password "password".
     */
    public function run(): void
    {
        // Keep this seeder runnable on its own, including role permissions.
        $this->call(RolesAndPermissionsSeeder::class);

        $users = [
            ['admin', 'Admin', null, 'User', 'Administrator', RoleEnum::Admin],
            ['finance-manager', 'Frank', 'Finance', 'Manager', 'Finance Manager', RoleEnum::FinanceManager],
            ['senior-accountant', 'Sally', null, 'Accountant', 'Senior Accountant', RoleEnum::SeniorAccountant],
            ['accounting-staff', 'Alex', null, 'Accountant', 'Accounting Staff', RoleEnum::AccountingStaff],
            ['front-desk', 'Dana', null, 'Billing', 'Front-desk Billing', RoleEnum::FrontDeskBilling],
            ['payroll', 'Parker', null, 'Payroll', 'Payroll', RoleEnum::Payroll],
            ['auditor', 'Avery', null, 'Auditor', 'Auditor', RoleEnum::Auditor],
            ['management', 'Morgan', null, 'Manager', 'Management', RoleEnum::Management],
            ['employee', 'Staff', 'Demo', 'Employee', 'Optical Staff / Assistant', RoleEnum::Employee],
        ];

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
