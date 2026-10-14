<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Payroll flow: draft -> approved -> posted -> paid (or void), employer shares, per-run adjustments.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->string('frequency', 20)->default('semi_monthly')->after('code'); // semi_monthly | monthly
        });

        Schema::table('payroll_runs', function (Blueprint $table) {
            $table->unsignedInteger('headcount')->default(0)->after('status');
            $table->decimal('employer_total', 18, 2)->default(0)->after('net_total');
            $table->json('warnings')->nullable()->after('employer_total');
            $table->text('notes')->nullable()->after('warnings');
            $table->foreignId('computed_by')->nullable()->after('journal_entry_id')->constrained('users')->nullOnDelete();
            $table->timestamp('computed_at')->nullable()->after('computed_by');
            $table->foreignId('approved_by')->nullable()->after('computed_at')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->foreignId('paid_by')->nullable()->after('posted_at')->constrained('users')->nullOnDelete();
            $table->timestamp('paid_at')->nullable()->after('paid_by');
            $table->date('paid_on')->nullable()->after('paid_at');
            $table->foreignId('bank_account_id')->nullable()->after('paid_on')->constrained('bank_accounts')->nullOnDelete();
            $table->foreignId('payment_journal_entry_id')->nullable()->after('bank_account_id')->constrained('journal_entries')->nullOnDelete();
            $table->timestamp('voided_at')->nullable()->after('payment_journal_entry_id');
        });

        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('holiday_pay', 18, 2)->default(0)->after('ot_pay');
            $table->decimal('night_diff_pay', 18, 2)->default(0)->after('holiday_pay');
            $table->decimal('taxable_allowances', 18, 2)->default(0)->after('night_diff_pay');
            $table->decimal('non_taxable_allowances', 18, 2)->default(0)->after('taxable_allowances');
            $table->decimal('unpaid_leave', 18, 2)->default(0)->after('tardiness');
            $table->decimal('sss_er', 18, 2)->default(0)->after('sss');
            $table->decimal('sss_ec', 18, 2)->default(0)->after('sss_er');
            $table->decimal('philhealth_er', 18, 2)->default(0)->after('philhealth');
            $table->decimal('pagibig_er', 18, 2)->default(0)->after('pagibig');
            $table->decimal('taxable_income', 18, 2)->default(0)->after('pagibig_er');
            $table->boolean('is_mwe')->default(false)->after('taxable_income');
        });

        Schema::create('payroll_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payroll_run_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('kind', 20); // earning | deduction
            $table->string('category', 40); // allowance, de_minimis, bonus, salary_adjustment, cash_advance, sss_loan, pagibig_loan, other
            $table->string('description');
            $table->decimal('amount', 18, 2);
            $table->boolean('taxable')->default(true); // earnings only
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['payroll_run_id', 'employee_id']);
        });

        // Old "computed" runs become drafts. The old flow locked time records at compute; drafts must not.
        $draftPeriods = DB::table('payroll_runs')->where('status', 'computed')->pluck('payroll_period_id');
        DB::table('payroll_runs')->where('status', 'computed')->update(['status' => 'draft']);
        DB::table('dtr_entries')
            ->whereIn('payroll_period_id', $draftPeriods)
            ->where('status', 'locked')
            ->whereNotIn('payroll_period_id', DB::table('payroll_runs')->whereIn('status', ['posted'])->pluck('payroll_period_id'))
            ->update(['status' => 'approved']);
    }

    public function down(): void
    {
        DB::table('payroll_runs')->where('status', 'draft')->update(['status' => 'computed']);

        Schema::dropIfExists('payroll_adjustments');

        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn([
                'holiday_pay', 'night_diff_pay', 'taxable_allowances', 'non_taxable_allowances', 'unpaid_leave',
                'sss_er', 'sss_ec', 'philhealth_er', 'pagibig_er', 'taxable_income', 'is_mwe',
            ]);
        });

        Schema::table('payroll_runs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('computed_by');
            $table->dropConstrainedForeignId('approved_by');
            $table->dropConstrainedForeignId('paid_by');
            $table->dropConstrainedForeignId('bank_account_id');
            $table->dropConstrainedForeignId('payment_journal_entry_id');
            $table->dropColumn(['headcount', 'employer_total', 'warnings', 'notes', 'computed_at', 'approved_at', 'paid_at', 'paid_on', 'voided_at']);
        });

        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->dropColumn('frequency');
        });
    }
};
