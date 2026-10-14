<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Employee Requests: attendance_requests also carries official business, undertime and
 * change-of-schedule filings (see App\Models\AttendanceRequest for how each type uses the columns).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_requests', function (Blueprint $table) {
            $table->string('destination')->nullable()->after('requested_ot_hours');
            $table->boolean('requested_rest_day')->default(false)->after('destination');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_requests', function (Blueprint $table) {
            $table->dropColumn(['destination', 'requested_rest_day']);
        });
    }
};
