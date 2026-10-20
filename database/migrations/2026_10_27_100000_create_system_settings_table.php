<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * System Settings: company-wide policy the owner changes without a deploy (App\Support\SystemSettings).
 * A setting never saved falls back to its default in config. Managing them is owner-only, so only
 * Admin gets the permission (RoleEnum::OWNER_ONLY).
 */
return new class extends Migration
{
    private const PERMISSION = 'admin.system-settings.manage';

    public function up(): void
    {
        Schema::create('system_settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Permission::findOrCreate(self::PERMISSION, 'web');
        Role::query()->where('name', 'Admin')->where('guard_name', 'web')->first()?->givePermissionTo(self::PERMISSION);

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::query()->where('name', self::PERMISSION)->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Schema::dropIfExists('system_settings');
    }
};
