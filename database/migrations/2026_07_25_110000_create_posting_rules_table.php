<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posting_rules', function (Blueprint $table) {
            $table->id();
            $table->string('event');
            $table->string('name');
            $table->foreignId('debit_account_id')->constrained('accounts');
            $table->foreignId('credit_account_id')->constrained('accounts');
            $table->json('condition')->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index('event');
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posting_rules');
    }
};
