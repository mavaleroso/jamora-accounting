<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // exclusive: amounts are net, 12% input VAT is added; inclusive: VAT is extracted; non_vat: supplier is not VAT-registered.
        Schema::table('bills', function (Blueprint $table) {
            $table->string('vat_treatment', 20)->default('exclusive')->after('due_date');
        });
    }

    public function down(): void
    {
        Schema::table('bills', function (Blueprint $table) {
            $table->dropColumn('vat_treatment');
        });
    }
};
