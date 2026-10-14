<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Compliance gets its own permissions (it was reachable with any of periods.view / dashboard.view / ap.view):
 * view, manage (generate, prepare, file) and verify (second-person sign-off). Mirrors RolesAndPermissionsSeeder.
 */
return new class extends Migration
{
    private const GRANTS = [
        'Admin' => ['compliance.view', 'compliance.manage', 'compliance.verify'],
        'Finance Manager' => ['compliance.view', 'compliance.manage', 'compliance.verify'],
        'Senior Accountant' => ['compliance.view', 'compliance.manage'],
        'Payroll' => ['compliance.view', 'compliance.manage'],
        'Accounting Staff' => ['compliance.view'],
        'Auditor' => ['compliance.view'],
        'Management' => ['compliance.view'],
    ];

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (['compliance.view', 'compliance.manage', 'compliance.verify'] as $name) {
            Permission::findOrCreate($name, 'web');
        }
        foreach (self::GRANTS as $role => $permissions) {
            Role::query()->where('name', $role)->where('guard_name', 'web')->first()?->givePermissionTo($permissions);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::query()->whereIn('name', ['compliance.view', 'compliance.manage', 'compliance.verify'])->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
