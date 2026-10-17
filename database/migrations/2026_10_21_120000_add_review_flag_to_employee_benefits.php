<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Enrollment shares are fixed amounts. When a salary change makes a share worked out from salary
 * out of date, the enrollment is flagged for HR to review; saving the enrollment clears the flag.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_benefits', function (Blueprint $table) {
            $table->timestamp('review_flagged_at')->nullable()->after('notes');
            $table->string('review_note', 255)->nullable()->after('review_flagged_at');
        });
    }

    public function down(): void
    {
        Schema::table('employee_benefits', function (Blueprint $table) {
            $table->dropColumn(['review_flagged_at', 'review_note']);
        });
    }
};
