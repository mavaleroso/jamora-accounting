<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Reconciliation starts from the previous statement's ending balance.
        Schema::table('bank_reconciliations', function (Blueprint $table) {
            $table->decimal('beginning_balance', 18, 2)->default(0)->after('statement_date');
        });

        // Deposits received through a bank appear on that bank's register.
        Schema::table('customer_deposits', function (Blueprint $table) {
            $table->foreignId('bank_account_id')->nullable()->after('payment_method')->constrained()->nullOnDelete();
        });

        // Wholesale price list for JAM Opticus product sales (selling_price remains the retail price).
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->decimal('wholesale_price', 18, 2)->nullable()->after('selling_price');
        });

        Schema::table('invoice_lines', function (Blueprint $table) {
            $table->foreignId('inventory_item_id')->nullable()->after('line_type')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('invoice_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('inventory_item_id');
        });
        Schema::table('inventory_items', function (Blueprint $table) {
            $table->dropColumn('wholesale_price');
        });
        Schema::table('customer_deposits', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bank_account_id');
        });
        Schema::table('bank_reconciliations', function (Blueprint $table) {
            $table->dropColumn('beginning_balance');
        });
    }
};
