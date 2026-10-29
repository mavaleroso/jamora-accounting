<?php

use App\Models\Entity;
use App\Support\ChartOfAccounts;
use App\Support\WithholdingTax;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Expanded withholding tax on supplier bills (CPA answer 7.5, Oct 2026). A bill may name an EWT code (an ATC from
 * the Tax Codes library); the tax is withheld from what the supplier is paid and owed to the BIR instead:
 *
 *   Dr expense / inventory, Dr Input VAT    Cr Accounts Payable (total − EWT)    Cr Expanded Withholding Tax Payable
 *
 * The code, rate and amount are kept on the bill so its BIR 2307 does not change when the library does. Existing
 * bills have no EWT and are unchanged. Each entity gets account 2435 and the default EWT codes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bills', function (Blueprint $table) {
            $table->foreignId('ewt_tax_code_id')->nullable()->after('vat_treatment')->constrained('tax_codes')->nullOnDelete();
            $table->string('ewt_atc', 20)->nullable()->after('ewt_tax_code_id');
            $table->decimal('ewt_rate', 8, 4)->default(0)->after('ewt_atc');
            $table->decimal('ewt_amount', 18, 2)->default(0)->after('total_amount');
        });

        foreach (Entity::query()->get() as $entity) {
            ChartOfAccounts::ensureFor($entity);
            WithholdingTax::ensureFor($entity);
        }
    }

    public function down(): void
    {
        Schema::table('bills', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ewt_tax_code_id');
            $table->dropColumn(['ewt_atc', 'ewt_rate', 'ewt_amount']);
        });
    }
};
