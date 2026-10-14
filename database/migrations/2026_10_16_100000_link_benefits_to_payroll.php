<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Benefit enrollments feed payroll. Each program says how payroll treats it (payroll_mode):
 *   statutory    SSS / PhilHealth / Pag-IBIG — computed by payroll for everyone, no enrollment needed
 *   earning      allowance paid in the payslip (employer share = monthly amount, taxable per is_taxable)
 *   contribution employee share deducted from pay; employer share booked as benefit expense
 *   none         tracked only (e.g. annual subsidies claimed separately)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('benefit_programs', function (Blueprint $table) {
            $table->string('payroll_mode', 20)->default('none')->after('contribution_basis');
        });

        // Existing programs keep not touching payroll unless they are allowances; HR opts the rest in.
        DB::table('benefit_programs')->where('contribution_basis', 'like', 'statutory_%')->update(['payroll_mode' => 'statutory']);
        DB::table('benefit_programs')->where('payroll_mode', 'none')->where('category', 'allowance')->update(['payroll_mode' => 'earning']);

        Schema::table('payslips', function (Blueprint $table) {
            // Part of other_deductions: employee shares of benefit programs.
            $table->decimal('benefit_deductions', 18, 2)->default(0)->after('other_deductions');
            // Employer shares of benefit programs (premiums paid for the employee, not in gross pay).
            $table->decimal('employer_benefits', 18, 2)->default(0)->after('pagibig_er');
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['benefit_deductions', 'employer_benefits']);
        });

        Schema::table('benefit_programs', function (Blueprint $table) {
            $table->dropColumn('payroll_mode');
        });
    }
};
