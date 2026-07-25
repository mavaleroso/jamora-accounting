<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_period_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('account_id')->constrained();
            $table->foreignId('accounting_period_id')->constrained();
            $table->decimal('opening_debit', 18, 2)->default(0);
            $table->decimal('opening_credit', 18, 2)->default(0);
            $table->decimal('period_debit', 18, 2)->default(0);
            $table->decimal('period_credit', 18, 2)->default(0);
            $table->decimal('closing_debit', 18, 2)->default(0);
            $table->decimal('closing_credit', 18, 2)->default(0);
            $table->timestamps();

            $table->unique(['account_id', 'accounting_period_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_period_balances');
    }
};
