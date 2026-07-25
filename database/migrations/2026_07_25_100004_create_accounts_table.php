<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->foreignId('account_type_id')->constrained();
            $table->foreignId('parent_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->boolean('is_postable')->default(true);
            $table->boolean('is_active')->default(true);
            $table->string('cash_flow_section')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index('parent_id');
            $table->index('account_type_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};
