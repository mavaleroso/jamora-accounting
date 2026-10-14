<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Employee Management business-flow upgrade (PH Labor Code / DOLE aligned).
 *
 * - Shift templates + roster draft/publish audit
 * - Holiday calendar (regular / special non-working)
 * - DTR computed against schedule, OT approval, night differential, day type, approval & payroll lock
 * - Attendance correction / overtime requests
 * - Leave types, leave balances and an auditable leave ledger
 * - Benefit contribution basis, compliance filing workflow stamps
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shift_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->string('code', 30);
            $table->string('name');
            $table->time('start_time');
            $table->time('end_time');
            $table->unsignedSmallInteger('break_minutes')->default(60);
            $table->unsignedSmallInteger('grace_minutes')->default(5);
            $table->string('color', 20)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['entity_id', 'code']);
        });

        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            // null entity_id = national holiday applicable to all entities
            $table->foreignId('entity_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('holiday_date');
            $table->string('name');
            $table->string('type', 20); // regular, special
            $table->string('scope', 20)->default('national'); // national, local
            $table->timestamps();

            $table->unique(['entity_id', 'holiday_date']);
            $table->index('holiday_date');
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->string('employment_type', 30)->default('regular')->after('employment_status'); // probationary, regular, contractual, project, seasonal
            $table->date('regularization_date')->nullable()->after('hire_date');
            $table->string('gender', 10)->nullable()->after('lastname'); // male, female
            $table->string('civil_status', 20)->nullable()->after('gender'); // single, married, widowed, separated, solo_parent
            $table->foreignId('default_shift_template_id')->nullable()->after('biometric_id')->constrained('shift_templates')->nullOnDelete();
            $table->json('rest_days')->nullable()->after('default_shift_template_id'); // ISO weekday numbers, 0 = Sunday
        });

        Schema::table('shift_rosters', function (Blueprint $table) {
            $table->foreignId('shift_template_id')->nullable()->after('employee_id')->constrained('shift_templates')->nullOnDelete();
            $table->unsignedSmallInteger('break_minutes')->default(60)->after('shift_end');
            $table->unsignedSmallInteger('grace_minutes')->default(5)->after('break_minutes');
            $table->timestamp('published_at')->nullable()->after('status');
            $table->foreignId('published_by')->nullable()->after('published_at')->constrained('users')->nullOnDelete();
        });

        Schema::table('dtr_entries', function (Blueprint $table) {
            $table->foreignId('shift_roster_id')->nullable()->after('payroll_period_id')->constrained('shift_rosters')->nullOnDelete();
            $table->time('scheduled_in')->nullable()->after('work_date');
            $table->time('scheduled_out')->nullable()->after('scheduled_in');
            $table->decimal('undertime_minutes', 8, 2)->default(0)->after('tardiness_minutes');
            $table->decimal('night_diff_hours', 8, 2)->default(0)->after('undertime_minutes');
            $table->decimal('ot_hours_approved', 8, 2)->default(0)->after('ot_hours');
            $table->string('day_type', 40)->default('regular')->after('night_diff_hours');
            $table->string('attendance_status', 20)->default('present')->after('day_type'); // present, late, undertime, absent, on_leave, rest_day, holiday, incomplete
            $table->foreignId('leave_request_id')->nullable()->after('attendance_status');
            $table->string('status', 20)->default('open')->after('location_status'); // open, approved, locked
            $table->foreignId('approved_by')->nullable()->after('status')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');

            $table->index(['entity_id', 'work_date', 'status']);
        });

        Schema::create('attendance_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('dtr_entry_id')->nullable()->constrained('dtr_entries')->nullOnDelete();
            $table->string('request_type', 20); // correction, overtime
            $table->date('work_date');
            $table->time('requested_time_in')->nullable();
            $table->time('requested_break_out')->nullable();
            $table->time('requested_break_in')->nullable();
            $table->time('requested_time_out')->nullable();
            $table->decimal('requested_ot_hours', 6, 2)->nullable();
            $table->text('reason');
            $table->string('status', 20)->default('pending'); // pending, approved, rejected, cancelled
            $table->foreignId('filed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('review_remarks')->nullable();
            $table->timestamps();

            $table->index(['entity_id', 'status']);
            $table->index(['employee_id', 'work_date']);
        });

        Schema::create('leave_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name');
            $table->string('legal_basis')->nullable();
            $table->boolean('is_paid')->default(true);
            $table->boolean('balance_tracked')->default(true); // false = per-occurrence or unlimited
            $table->decimal('annual_entitlement', 6, 2)->default(0);
            $table->decimal('max_days_per_filing', 6, 2)->nullable();
            $table->decimal('max_carry_over', 6, 2)->default(0);
            $table->boolean('is_convertible')->default(false); // convertible to cash at year end
            $table->boolean('counts_calendar_days')->default(false); // e.g. maternity counts calendar days
            $table->string('gender', 10)->nullable(); // restrict to male / female
            $table->unsignedSmallInteger('min_service_months')->default(0);
            $table->unsignedSmallInteger('min_notice_days')->default(0);
            $table->decimal('attachment_required_after_days', 6, 2)->nullable();
            $table->boolean('allow_half_day')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('leave_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('leave_type_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('year');
            $table->decimal('entitled', 8, 2)->default(0);
            $table->decimal('carried_over', 8, 2)->default(0);
            $table->decimal('adjusted', 8, 2)->default(0);
            $table->decimal('used', 8, 2)->default(0);
            $table->decimal('reserved', 8, 2)->default(0);
            $table->timestamps();

            $table->unique(['employee_id', 'leave_type_id', 'year']);
        });

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->foreignId('leave_type_id')->nullable()->after('employee_id')->constrained()->nullOnDelete();
            $table->string('half_day', 2)->nullable()->after('end_date'); // am, pm
            $table->string('attachment_path')->nullable()->after('reason');
            $table->foreignId('filed_by')->nullable()->after('status')->constrained('users')->nullOnDelete();
            $table->foreignId('cancelled_by')->nullable()->after('rejection_reason')->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable()->after('cancelled_by');
            $table->text('cancellation_reason')->nullable()->after('cancelled_at');
        });

        Schema::create('leave_ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('leave_type_id')->constrained()->cascadeOnDelete();
            $table->foreignId('leave_request_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('year');
            $table->string('action', 20); // entitlement, carry_over, adjustment, reserve, release, use, restore
            $table->decimal('days', 8, 2);
            $table->decimal('available_after', 8, 2)->default(0);
            $table->string('remarks')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();

            $table->index(['employee_id', 'leave_type_id', 'year']);
        });

        Schema::table('benefit_programs', function (Blueprint $table) {
            $table->foreignId('entity_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
            $table->string('contribution_basis', 30)->default('fixed')->after('category'); // fixed, percent_of_basic, statutory_sss, statutory_philhealth, statutory_pagibig
            $table->decimal('employee_rate', 8, 4)->default(0)->after('default_employer_share'); // % of basic when percent_of_basic
            $table->decimal('employer_rate', 8, 4)->default(0)->after('employee_rate');
        });

        Schema::table('employee_benefits', function (Blueprint $table) {
            $table->date('end_date')->nullable()->after('effective_date');
        });

        Schema::table('compliance_items', function (Blueprint $table) {
            $table->string('form_code', 40)->nullable()->after('title');
            $table->string('agency', 40)->nullable()->after('form_code'); // BIR, SSS, PHIC, HDMF, DOLE, LGU
            $table->string('frequency', 20)->default('monthly')->after('category'); // monthly, quarterly, annual, one_time
            $table->foreignId('prepared_by')->nullable()->after('evidence_file')->constrained('users')->nullOnDelete();
            $table->timestamp('prepared_at')->nullable()->after('prepared_by');
            $table->foreignId('submitted_by')->nullable()->after('prepared_at')->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable()->after('submitted_by');
        });

        // Normalise legacy data
        DB::table('shift_rosters')->where('status', 'published')->whereNull('published_at')->update(['published_at' => now()]);
        DB::table('dtr_entries')->where('ot_hours', '>', 0)->update(['ot_hours_approved' => DB::raw('ot_hours')]);
        DB::table('dtr_entries')->where('is_absent', true)->update(['attendance_status' => 'absent']);
        DB::table('dtr_entries')->where('tardiness_minutes', '>', 0)->where('is_absent', false)->update(['attendance_status' => 'late']);
    }

    public function down(): void
    {
        Schema::table('compliance_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('prepared_by');
            $table->dropConstrainedForeignId('submitted_by');
            $table->dropColumn(['form_code', 'agency', 'frequency', 'prepared_at', 'submitted_at']);
        });

        Schema::table('employee_benefits', function (Blueprint $table) {
            $table->dropColumn('end_date');
        });

        Schema::table('benefit_programs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('entity_id');
            $table->dropColumn(['contribution_basis', 'employee_rate', 'employer_rate']);
        });

        Schema::dropIfExists('leave_ledger_entries');

        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('leave_type_id');
            $table->dropConstrainedForeignId('filed_by');
            $table->dropConstrainedForeignId('cancelled_by');
            $table->dropColumn(['half_day', 'attachment_path', 'cancelled_at', 'cancellation_reason']);
        });

        Schema::dropIfExists('leave_balances');
        Schema::dropIfExists('leave_types');
        Schema::dropIfExists('attendance_requests');

        Schema::table('dtr_entries', function (Blueprint $table) {
            $table->dropIndex(['entity_id', 'work_date', 'status']);
            $table->dropConstrainedForeignId('shift_roster_id');
            $table->dropConstrainedForeignId('approved_by');
            $table->dropColumn([
                'scheduled_in', 'scheduled_out', 'undertime_minutes', 'night_diff_hours', 'ot_hours_approved',
                'day_type', 'attendance_status', 'leave_request_id', 'status', 'approved_at',
            ]);
        });

        Schema::table('shift_rosters', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shift_template_id');
            $table->dropConstrainedForeignId('published_by');
            $table->dropColumn(['break_minutes', 'grace_minutes', 'published_at']);
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('default_shift_template_id');
            $table->dropColumn(['employment_type', 'regularization_date', 'gender', 'civil_status', 'rest_days']);
        });

        Schema::dropIfExists('holidays');
        Schema::dropIfExists('shift_templates');
    }
};

