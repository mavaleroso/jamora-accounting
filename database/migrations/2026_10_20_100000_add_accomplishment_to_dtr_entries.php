<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the employee got done that day, entered when they check out.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dtr_entries', function (Blueprint $table) {
            $table->text('accomplishment')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('dtr_entries', function (Blueprint $table) {
            $table->dropColumn('accomplishment');
        });
    }
};
