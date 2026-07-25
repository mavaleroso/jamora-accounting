<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->string('entry_no')->unique();
            $table->foreignId('journal_id')->constrained();
            $table->foreignId('accounting_period_id')->constrained();
            $table->date('entry_date');
            $table->string('reference')->nullable();
            $table->text('memo')->nullable();
            $table->string('source_system')->default('manual');
            $table->string('source_type')->nullable();
            $table->string('source_id')->nullable();
            $table->string('status')->default('draft');
            $table->decimal('total_debit', 18, 2)->default(0);
            $table->decimal('total_credit', 18, 2)->default(0);
            $table->foreignId('prepared_by')->nullable()->constrained('users');
            $table->foreignId('approved_by')->nullable()->constrained('users');
            $table->foreignId('posted_by')->nullable()->constrained('users');
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('voided_by')->nullable()->constrained('users');
            $table->timestamp('voided_at')->nullable();
            $table->foreignId('void_of_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index('status');
            $table->index('entry_date');
            $table->index(['source_system', 'source_type', 'source_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entries');
    }
};
