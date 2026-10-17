<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A new hire's first-year credits are pro-rated for company-policy leave. Statutory leave granted per
 * year by law (Solo Parent RA 11861, VAWC RA 9262) is given in full, so it stays off.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->boolean('prorate_first_year')->default(false)->after('max_carry_over');
        });

        DB::table('leave_types')->whereIn('code', ['VL', 'SL', 'EL'])->update(['prorate_first_year' => true]);
    }

    public function down(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->dropColumn('prorate_first_year');
        });
    }
};
