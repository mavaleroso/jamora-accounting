<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance no longer comes from a biometric time clock (employees clock in on the web, or punches are entered or
 * imported by employee code), so employees no longer carry a biometric ID.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('biometric_id');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('biometric_id')->nullable()->after('department');
        });
    }
};
