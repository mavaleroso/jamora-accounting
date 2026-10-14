<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Model-level audit trail: before / after values per record, grouped per request (batch), with the
 * branch, source (web / console / queue) and a readable label for the record.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_trails', function (Blueprint $table) {
            $table->string('event', 20)->nullable()->after('action'); // created | updated | deleted | restored | request
            $table->string('subject_label')->nullable()->after('subject_id');
            $table->json('old_values')->nullable()->after('request_payload');
            $table->json('new_values')->nullable()->after('old_values');
            $table->foreignId('entity_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
            $table->uuid('batch_id')->nullable()->after('entity_id');
            $table->string('source', 20)->default('web')->after('batch_id');
            $table->unsignedSmallInteger('status_code')->nullable()->after('method');

            $table->index('created_at');
            $table->index('batch_id');
            $table->index(['subject_type', 'subject_id']);
            $table->index(['event', 'created_at']);
        });

        DB::table('audit_trails')->whereNull('event')->update(['event' => 'request']);
    }

    public function down(): void
    {
        Schema::table('audit_trails', function (Blueprint $table) {
            $table->dropIndex(['created_at']);
            $table->dropIndex(['batch_id']);
            $table->dropIndex(['subject_type', 'subject_id']);
            $table->dropIndex(['event', 'created_at']);
            $table->dropConstrainedForeignId('entity_id');
            $table->dropColumn(['event', 'subject_label', 'old_values', 'new_values', 'batch_id', 'source', 'status_code']);
        });
    }
};
