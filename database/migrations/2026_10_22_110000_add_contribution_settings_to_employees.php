<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which government contributions are not deducted for the employee, set in the Employee Directory:
 * {"philhealth": {"mode": "none"}}. A missing agency (or NULL) means deducted, always computed from
 * the contribution table on the salary. Withholding tax is not configured here; payroll computes it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->json('contribution_settings')->nullable()->after('tin');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('contribution_settings');
        });
    }
};
