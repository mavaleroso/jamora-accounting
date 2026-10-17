<?php

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Collapse the nine built-in roles into the four the company actually has: Admin (the owner,
 * who directs and signs off), Accountant (does the finance and admin work), Accounting Retainer
 * (outsourced reviewer) and Employee. Users of a retired role move to its successor, the retired
 * roles are deleted, and the built-in roles get their default permissions (RoleEnum::defaultPermissions).
 * Custom roles are left untouched.
 */
return new class extends Migration
{
    /** retired role => successor. Management only read reports, so it moves to the read-only role. */
    private const SUCCESSORS = [
        'Finance Manager' => 'Accountant',
        'Senior Accountant' => 'Accountant',
        'Accounting Staff' => 'Accountant',
        'Front-desk Billing' => 'Accountant',
        'Payroll' => 'Accountant',
        'Auditor' => 'Accounting Retainer',
        'Management' => 'Accounting Retainer',
    ];

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (PermissionEnum::cases() as $permission) {
            Permission::findOrCreate($permission->value, 'web');
        }

        foreach (self::SUCCESSORS as $retired => $successor) {
            $old = Role::query()->where('name', $retired)->where('guard_name', 'web')->first();
            if (! $old) {
                continue;
            }

            $new = Role::findOrCreate($successor, 'web');
            User::role($old)->get()->each(function (User $user) use ($old, $new) {
                $user->removeRole($old);
                if (! $user->hasRole($new)) {
                    $user->assignRole($new);
                }
            });

            $old->delete();
        }

        foreach (RoleEnum::cases() as $role) {
            Role::findOrCreate($role->value, 'web')->syncPermissions($role->defaultPermissions());
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    /** Users cannot be split back across the retired roles, so this is not reversed. */
    public function down(): void {}
};
