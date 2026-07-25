<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_documents', function (Blueprint $table) {
            $table->id();
            $table->string('source_system')->default('optical');
            $table->string('source_type');
            $table->string('source_id');
            $table->string('payload_hash');
            $table->foreignId('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();
            $table->string('status');
            $table->text('error')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->unique(['source_system', 'source_type', 'source_id']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_documents');
    }
};
