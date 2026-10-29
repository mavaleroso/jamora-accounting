<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Timekeeping and leave rules from the Employee Handbook (Code of Conduct effective 1 June 2025), as the owner decided:
 *  - Tardy one minute after the shift starts: the shift library and rosters from today on lose their 5-minute grace
 *    period. Days already worked keep the grace they were computed with.
 *  - SIL is taken in whole days and forfeited when unused (no longer converted to cash).
 *  - Medical Leave of Absence: unpaid, up to 60 days, supporting document required. Added to a catalogue already
 *    seeded (a fresh install gets it from PeopleSetupSeeder) and to every employee who has a list of leave types
 *    (employees without a list can already file every type).
 *  - Over-breaks are counted on the time record; absence notices record whether they came in time.
 */
return new class extends Migration
{
    private const OLD_GRACE = 5;

    public function up(): void
    {
        Schema::table('dtr_entries', function (Blueprint $table) {
            // Minutes a punched break ran past the allotted break (Employee Handbook, over-break).
            $table->unsignedSmallInteger('over_break_minutes')->default(0)->after('night_diff_hours');
        });

        Schema::table('attendance_requests', function (Blueprint $table) {
            // Absence notices: on_time (at least absence_notice_hours before the shift) or late.
            $table->string('notice_status', 10)->nullable()->after('requested_rest_day');
        });

        DB::table('shift_templates')->where('grace_minutes', self::OLD_GRACE)->update(['grace_minutes' => 0, 'updated_at' => now()]);
        DB::table('shift_rosters')->where('grace_minutes', self::OLD_GRACE)->whereDate('roster_date', '>=', now()->toDateString())
            ->update(['grace_minutes' => 0, 'updated_at' => now()]);

        DB::table('leave_types')->where('code', 'SIL')->update(['allow_half_day' => false, 'is_convertible' => false, 'updated_at' => now()]);

        if (! DB::table('leave_types')->exists()) {
            return;
        }

        $mloa = collect(config('people.leave_types'))->firstWhere('code', 'MLOA');
        DB::table('leave_types')->updateOrInsert(['code' => 'MLOA'], [
            'name' => $mloa['name'],
            'legal_basis' => $mloa['legal_basis'],
            'is_paid' => false,
            'balance_tracked' => false,
            'annual_entitlement' => 0,
            'max_days_per_filing' => $mloa['max_days_per_filing'],
            'max_carry_over' => 0,
            'prorate_first_year' => false,
            'is_convertible' => false,
            'counts_calendar_days' => true,
            'min_service_months' => 0,
            'min_notice_days' => 0,
            'attachment_required_after_days' => 0,
            'allow_half_day' => false,
            'sort_order' => $mloa['sort_order'],
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('leave_types')->where('code', 'LWOP')->update(['sort_order' => 9]);

        $mloaId = (int) DB::table('leave_types')->where('code', 'MLOA')->value('id');
        DB::table('employees')->whereNotNull('leave_type_ids')->orderBy('id')->each(function (object $employee) use ($mloaId) {
            $ids = json_decode((string) $employee->leave_type_ids, true);
            if (is_array($ids) && ! in_array($mloaId, array_map('intval', $ids), true)) {
                DB::table('employees')->where('id', $employee->id)->update(['leave_type_ids' => json_encode([...array_map('intval', $ids), $mloaId])]);
            }
        });
    }

    /** Grace periods, SIL and the employees' leave lists are not restored; the columns go. */
    public function down(): void
    {
        Schema::table('dtr_entries', function (Blueprint $table) {
            $table->dropColumn('over_break_minutes');
        });
        Schema::table('attendance_requests', function (Blueprint $table) {
            $table->dropColumn('notice_status');
        });
    }
};
