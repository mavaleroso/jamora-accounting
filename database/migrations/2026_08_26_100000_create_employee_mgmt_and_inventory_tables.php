<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('position')->nullable()->after('employment_status');
            $table->string('department')->nullable()->after('position');
            $table->string('biometric_id')->nullable()->after('department');
            $table->string('email')->nullable()->after('biometric_id');
            $table->string('phone')->nullable()->after('email');
            $table->decimal('vacation_leave_credits', 8, 2)->default(10.00)->after('leave_credits');
            $table->decimal('sick_leave_credits', 8, 2)->default(10.00)->after('vacation_leave_credits');
        });

        Schema::create('shift_rosters', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('roster_date');
            $table->string('shift_name')->default('Regular Shift');
            $table->time('shift_start')->nullable();
            $table->time('shift_end')->nullable();
            $table->boolean('is_rest_day')->default(false);
            $table->string('status')->default('published'); // draft, published
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['employee_id', 'roster_date']);
            $table->index(['entity_id', 'roster_date']);
        });

        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('leave_type'); // vacation, sick, emergency, maternity, paternity, bereavement
            $table->date('start_date');
            $table->date('end_date');
            $table->decimal('days_count', 4, 1)->default(1.0);
            $table->text('reason');
            $table->string('status')->default('pending'); // pending, approved, declined, cancelled
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamps();

            $table->index(['entity_id', 'status']);
            $table->index(['employee_id', 'start_date']);
        });

        Schema::create('benefit_programs', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('category')->default('statutory'); // statutory, allowance, insurance, company
            $table->text('description')->nullable();
            $table->decimal('default_employee_share', 18, 2)->default(0);
            $table->decimal('default_employer_share', 18, 2)->default(0);
            $table->boolean('is_taxable')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('employee_benefits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('benefit_program_id')->constrained()->cascadeOnDelete();
            $table->string('participation_status')->default('active'); // active, waived, pending
            $table->decimal('employee_share', 18, 2)->default(0);
            $table->decimal('employer_share', 18, 2)->default(0);
            $table->string('payroll_treatment')->default('standard');
            $table->date('effective_date')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['employee_id', 'benefit_program_id']);
        });

        Schema::create('compliance_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->string('category'); // statutory_tax, statutory_payroll, local_government, regulatory
            $table->string('period'); // e.g. September 2026, Q3 2026
            $table->date('due_date');
            $table->string('owner_role')->default('HR / Accounting');
            $table->string('status')->default('pending'); // pending, prepared, submitted, verified
            $table->string('reference_no')->nullable();
            $table->decimal('amount', 18, 2)->nullable();
            $table->text('notes')->nullable();
            $table->string('evidence_file')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->index(['entity_id', 'period']);
            $table->index(['entity_id', 'status']);
        });

        Schema::create('inventory_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->string('sku');
            $table->string('name');
            $table->string('category'); // frame, lens, solution, accessory, lab_service
            $table->string('brand')->nullable();
            $table->decimal('unit_cost', 18, 2)->default(0);
            $table->decimal('selling_price', 18, 2)->default(0);
            $table->integer('qty_on_hand')->default(0);
            $table->integer('reorder_level')->default(5);
            $table->foreignId('gl_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['entity_id', 'sku']);
            $table->index(['entity_id', 'category']);
        });

        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('inventory_item_id')->constrained()->cascadeOnDelete();
            $table->string('movement_reference');
            $table->string('movement_type'); // supplier_receipt, sales_issue, edging_loss, adjustment, transfer
            $table->integer('quantity');
            $table->decimal('unit_cost', 18, 2)->default(0);
            $table->decimal('total_cost', 18, 2)->default(0);
            $table->string('accounting_link_type')->default('cogs'); // cogs, ap_receipt, inventory_loss, adjustment
            $table->string('review_status')->default('matched'); // matched, needs_review, unmatched
            $table->foreignId('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['entity_id', 'movement_type']);
            $table->index(['entity_id', 'review_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('inventory_items');
        Schema::dropIfExists('compliance_items');
        Schema::dropIfExists('employee_benefits');
        Schema::dropIfExists('benefit_programs');
        Schema::dropIfExists('leave_requests');
        Schema::dropIfExists('shift_rosters');

        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn([
                'position',
                'department',
                'biometric_id',
                'email',
                'phone',
                'vacation_leave_credits',
                'sick_leave_credits',
            ]);
        });
    }
};

