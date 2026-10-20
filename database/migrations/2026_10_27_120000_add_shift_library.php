<?php

use App\Models\ShiftTemplate;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

/**
 * Shift library (Libraries › Shifts): each company's shifts, added and edited there and offered when rostering a day.
 * One shift per company is its default, the shift every employee works unless the roster sets another; each company
 * gets one from config people.default_shift (9:00 AM - 6:00 PM), editable like any other. Admin and the Accountant
 * manage the library (RoleEnum::defaultPermissions).
 */
return new class extends Migration
{
    private const PERMISSION = 'libraries.shifts.manage';

    public function up(): void
    {
        Schema::table('shift_templates', function (Blueprint $table) {
            $table->boolean('is_default')->default(false)->after('is_active');
        });

        foreach (DB::table('entities')->pluck('id') as $entityId) {
            ShiftTemplate::ensureDefault((int) $entityId);
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();
        Permission::findOrCreate(self::PERMISSION, 'web');
        foreach (['Admin', 'Accountant'] as $role) {
            Role::query()->where('name', $role)->where('guard_name', 'web')->first()?->givePermissionTo(self::PERMISSION);
        }
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        Permission::query()->where('name', self::PERMISSION)->delete();
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        Schema::table('shift_templates', function (Blueprint $table) {
            $table->dropColumn('is_default');
        });
    }
};
