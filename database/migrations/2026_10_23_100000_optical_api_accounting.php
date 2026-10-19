<?php

use App\Models\BankAccount;
use App\Models\Entity;
use App\Support\ChartOfAccounts;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Accounting side of the optical API integration:
 *  - every bank account belongs to exactly one entity (no shared accounts) and has its own ledger account;
 *  - sync documents keep their payload and what they created, so a changed or cancelled order can be reversed;
 *  - incremental sync cursors per API stream;
 *  - customer deposits and stock movements remember the optical record they came from;
 *  - the chart of accounts and posting rules gain intercompany, GRNI, opening-balance and discount accounts.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->foreignId('entity_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });

        // A formerly shared account goes to the entity with most of its register lines, else its first linked entity.
        foreach (DB::table('bank_accounts')->get() as $bank) {
            $owner = DB::table('bank_transactions')
                ->where('bank_account_id', $bank->id)
                ->select('entity_id', DB::raw('COUNT(*) as n'))
                ->groupBy('entity_id')
                ->orderByDesc('n')
                ->orderBy('entity_id')
                ->value('entity_id');

            $owner ??= Schema::hasTable('bank_account_entity')
                ? DB::table('bank_account_entity')->where('bank_account_id', $bank->id)->orderBy('entity_id')->value('entity_id')
                : null;
            $owner ??= DB::table('entities')->orderBy('id')->value('id');

            DB::table('bank_accounts')->where('id', $bank->id)->update(['entity_id' => $owner]);

            $foreign = DB::table('bank_transactions')->where('bank_account_id', $bank->id)->where('entity_id', '!=', $owner)->count();
            if ($foreign > 0) {
                Log::warning("Bank account {$bank->code} now belongs to entity {$owner}; {$foreign} register line(s) from other entities remain on it and need moving to that entity's own bank account.");
            }
        }

        Schema::dropIfExists('bank_account_entity');
        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->dropColumn('is_shared');
        });

        Schema::table('sync_documents', function (Blueprint $table) {
            $table->json('payload')->nullable()->after('payload_hash');
            $table->json('meta')->nullable()->after('payload');
        });

        Schema::create('sync_cursors', function (Blueprint $table) {
            $table->id();
            $table->string('source_system');
            $table->string('stream');
            $table->timestamp('cursor_at')->nullable();
            $table->foreignId('last_run_id')->nullable()->constrained('sync_runs')->nullOnDelete();
            $table->timestamps();
            $table->unique(['source_system', 'stream']);
        });

        Schema::table('customer_deposits', function (Blueprint $table) {
            $table->string('source_system')->nullable()->after('journal_entry_id');
            $table->string('source_id')->nullable()->after('source_system');
            $table->string('external_order_id')->nullable()->after('source_id');
            $table->index(['source_system', 'external_order_id']);
        });

        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->foreignId('inventory_item_id')->nullable()->change();
            $table->string('source_system')->nullable()->after('journal_entry_id');
            $table->string('source_ref')->nullable()->after('source_system');
            $table->string('stock_type')->nullable()->after('source_ref');
            $table->string('product_code')->nullable()->after('stock_type');
            $table->string('description')->nullable()->after('product_code');
            $table->string('counterparty')->nullable()->after('description');
            $table->date('occurred_on')->nullable()->after('counterparty');
            $table->index(['source_system', 'source_ref']);
        });

        foreach (Entity::query()->get() as $entity) {
            ChartOfAccounts::ensureFor($entity);
        }

        foreach (BankAccount::query()->withoutGlobalScope('entity')->whereNotNull('entity_id')->get() as $bank) {
            ChartOfAccounts::ensureBankLedger($bank);
        }
    }

    public function down(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->dropIndex(['source_system', 'source_ref']);
            $table->dropColumn(['source_system', 'source_ref', 'stock_type', 'product_code', 'description', 'counterparty', 'occurred_on']);
        });

        Schema::table('customer_deposits', function (Blueprint $table) {
            $table->dropIndex(['source_system', 'external_order_id']);
            $table->dropColumn(['source_system', 'source_id', 'external_order_id']);
        });

        Schema::dropIfExists('sync_cursors');

        Schema::table('sync_documents', function (Blueprint $table) {
            $table->dropColumn(['payload', 'meta']);
        });

        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->boolean('is_shared')->default(false)->after('account_number');
        });

        Schema::create('bank_account_entity', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bank_account_id')->constrained()->cascadeOnDelete();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['bank_account_id', 'entity_id']);
        });

        foreach (DB::table('bank_accounts')->whereNotNull('entity_id')->get() as $bank) {
            DB::table('bank_account_entity')->insert(['bank_account_id' => $bank->id, 'entity_id' => $bank->entity_id, 'created_at' => now(), 'updated_at' => now()]);
        }

        Schema::table('bank_accounts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('entity_id');
        });
    }
};
