<?php

namespace Database\Seeders;

use App\Enums\RoleEnum;

/**
 * One demo login for each role besides Admin, all with the password "password".
 */
class DemoUserSeeder extends UserSeeder
{
    public const USERS = [
        ['accountant', 'Sally', null, 'Accountant', 'Accountant', RoleEnum::Accountant],
        ['retainer', 'Avery', null, 'Retainer', 'Accounting Retainer (outsourced)', RoleEnum::AccountingRetainer],
        ['employee', 'Staff', 'Demo', 'Employee', 'Optical Staff / Assistant', RoleEnum::Employee],
    ];
}
