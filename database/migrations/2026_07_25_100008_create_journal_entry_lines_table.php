<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entry_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('journal_entry_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('line_no');
            $table->foreignId('account_id')->constrained();
            $table->decimal('debit', 18, 2)->default(0);
            $table->decimal('credit', 18, 2)->default(0);
            $table->string('memo')->nullable();
            $table->foreignId('cost_center_id')->nullable()->constrained();
            $table->string('partner_type')->nullable();
            $table->unsignedBigInteger('partner_id')->nullable();
            $table->foreignId('tax_code_id')->nullable()->constrained();
            $table->timestamps();

            $table->unique(['journal_entry_id', 'line_no']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entry_lines');
    }
};
