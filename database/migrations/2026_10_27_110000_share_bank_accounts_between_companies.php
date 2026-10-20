<?php

use App\Models\BankAccount;
use App\Models\Entity;
use App\Support\ChartOfAccounts;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Shared bank accounts, as the proposal sets out (§3.5): four accounts shared between JAM Opticus and A. Jamora
 * Optical, and one dedicated to AL Jamora Optical. An account is held by one company (bank_accounts.entity_id) and
 * may be shared with others. Every company using it has its own Cash in Bank sub-account for it in its own chart
 * (bank_account_entity.gl_account_id), and each register line is tagged with the company whose books it is in.
 *
 * Existing accounts keep their holder and ledger. The shared operating accounts (BANK1–BANK4) are shared between
 * JAM Opticus and A. Jamora Optical again, each company getting its own ledger for them.
 */
return new class extends Migration
{
    private const SHARED_CODES = ['BANK1', 'BANK2', 'BANK3', 'BANK4'];

    public function up(): void
    {
        Schema::create('bank_account_entity', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bank_account_id')->constrained()->cascadeOnDelete();
            $table->foreignId('entity_id')->constrained()->cascadeOnDelete();
            // This company's own Cash in Bank sub-account for the bank account.
            $table->foreignId('gl_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->timestamps();
            $table->unique(['bank_account_id', 'entity_id']);
        });

        foreach (DB::table('bank_accounts')->whereNotNull('entity_id')->get() as $bank) {
            DB::table('bank_account_entity')->insert([
                'bank_account_id' => $bank->id,
                'entity_id' => $bank->entity_id,
                'gl_account_id' => $bank->gl_account_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $companies = Entity::query()->whereIn('code', ['JAM_OPTICUS', 'A_JAMORA'])->pluck('id');
        if ($companies->count() < 2) {
            return;
        }

        BankAccount::query()->withoutGlobalScope('entity')
            ->where(fn ($q) => $q->whereIn('code', self::SHARED_CODES)->orWhere('name', 'like', 'Shared Operating Account%'))
            ->get()
            ->each(fn (BankAccount $bank) => $companies->each(fn ($entityId) => ChartOfAccounts::ensureBankLedger($bank, (int) $entityId)));
    }

    public function down(): void
    {
        Schema::dropIfExists('bank_account_entity');
    }
};
