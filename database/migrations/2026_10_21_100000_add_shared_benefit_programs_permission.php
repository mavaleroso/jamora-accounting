<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Benefit programs shared by every branch (entity_id null) change payroll everywhere, so editing or
 * archiving them needs its own permission. Branch HR can still enroll their staff in them.
 * Admin and Finance Manager hold it (as in RolesAndPermissionsSeeder); other roles get it in Roles & Permissions.
 */
return new class extends Migration
{
    private const PERMISSION = 'payroll.shared-programs.manage';

    public function up(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Permission::findOrCreate(self::PERMISSION, 'web');
        foreach (['Admin', 'Finance Manager'] as $role) {
            Role::query()->where('name', $role)->where('guard_name', 'web')->first()?->givePermissionTo(self::PERMISSION);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::query()->where('name', self::PERMISSION)->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }
};
