<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('entities', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->json('settings')->nullable();
            $table->timestamps();
        });

        Schema::create('entity_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
            $table->unique(['entity_id', 'user_id']);
        });

        $entityTables = [
            'accounts',
            'journals',
            'journal_entries',
            'fiscal_years',
            'cost_centers',
            'tax_codes',
            'posting_rules',
            'sync_documents',
            'sync_runs',
        ];

        foreach ($entityTables as $tableName) {
            if (! Schema::hasTable($tableName)) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                $table->foreignId('entity_id')->nullable()->after('id')->constrained()->nullOnDelete();
            });
        }

        // Drop global unique constraints that conflict with per-entity codes.
        $this->dropUniqueIfExists('accounts', 'accounts_code_unique');
        $this->dropUniqueIfExists('journals', 'journals_code_unique');
        $this->dropUniqueIfExists('journal_entries', 'journal_entries_entry_no_unique');
        $this->dropUniqueIfExists('fiscal_years', 'fiscal_years_code_unique');
        $this->dropUniqueIfExists('cost_centers', 'cost_centers_code_unique');
        $this->dropUniqueIfExists('tax_codes', 'tax_codes_code_unique');
        $this->dropUniqueIfExists('sync_documents', 'sync_documents_source_system_source_type_source_id_unique');

        Schema::table('accounts', function (Blueprint $table) {
            $table->unique(['entity_id', 'code']);
        });
        Schema::table('journals', function (Blueprint $table) {
            $table->unique(['entity_id', 'code']);
        });
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->unique(['entity_id', 'entry_no']);
        });
        Schema::table('fiscal_years', function (Blueprint $table) {
            $table->unique(['entity_id', 'code']);
        });
        Schema::table('cost_centers', function (Blueprint $table) {
            $table->unique(['entity_id', 'code']);
        });
        Schema::table('tax_codes', function (Blueprint $table) {
            $table->unique(['entity_id', 'code']);
        });
        Schema::table('posting_rules', function (Blueprint $table) {
            $table->unique(['entity_id', 'event']);
        });
        Schema::table('sync_documents', function (Blueprint $table) {
            $table->unique(['entity_id', 'source_system', 'source_type', 'source_id'], 'sync_documents_entity_source_unique');
        });
    }

    public function down(): void
    {
        $entityTables = [
            'accounts',
            'journals',
            'journal_entries',
            'fiscal_years',
            'cost_centers',
            'tax_codes',
            'posting_rules',
            'sync_documents',
            'sync_runs',
        ];

        foreach ($entityTables as $tableName) {
            if (! Schema::hasTable($tableName) || ! Schema::hasColumn($tableName, 'entity_id')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) {
                $table->dropConstrainedForeignId('entity_id');
            });
        }

        Schema::dropIfExists('entity_user');
        Schema::dropIfExists('entities');
    }

    protected function dropUniqueIfExists(string $table, string $index): void
    {
        try {
            Schema::table($table, function (Blueprint $blueprint) use ($index) {
                $blueprint->dropUnique($index);
            });
        } catch (\Throwable) {
            // Index name may differ by driver; ignore if already gone.
        }
    }
};
