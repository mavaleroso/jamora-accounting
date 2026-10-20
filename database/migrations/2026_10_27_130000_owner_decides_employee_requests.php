<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Employees' requests (leave, overtime, time corrections, official business) get their own permissions, both owner-only
 * (RoleEnum::OWNER_ONLY):
 *  - requests.approve: approve or decline them (before: leave.approve, attendance.manage or payroll.manage);
 *  - requests.manage: file them on an employee's behalf, cancel an employee's request, open their documents.
 * leave.approve is retired, so the Accountant no longer decides on requests; Admin gets the new permissions.
 */
return new class extends Migration
{
    private const NEW = ['requests.approve', 'requests.manage'];

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (self::NEW as $name) {
            Permission::findOrCreate($name, 'web');
        }
        Role::query()->where('name', 'Admin')->where('guard_name', 'web')->first()?->givePermissionTo(self::NEW);

        Permission::query()->where('name', 'leave.approve')->where('guard_name', 'web')->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Permission::findOrCreate('leave.approve', 'web');
        foreach (['Admin', 'Accountant'] as $role) {
            Role::query()->where('name', $role)->where('guard_name', 'web')->first()?->givePermissionTo('leave.approve');
        }
        Permission::query()->whereIn('name', self::NEW)->where('guard_name', 'web')->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
