<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A short, human description of what a role is for (shown on the Roles & Permissions screen).
 * Built-in roles fall back to App\Support\PermissionCatalog::roleDescription().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table(config('permission.table_names.roles', 'roles'), function (Blueprint $table) {
            $table->string('description', 255)->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table(config('permission.table_names.roles', 'roles'), function (Blueprint $table) {
            $table->dropColumn('description');
        });
    }
};
