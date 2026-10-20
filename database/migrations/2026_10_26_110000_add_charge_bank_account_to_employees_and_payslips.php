<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            // The company bank account charged when this employee's pay is released (one of their company's).
            $table->foreignId('charge_bank_account_id')->nullable()->after('bank_account_no')->constrained('bank_accounts')->nullOnDelete();
        });

        Schema::table('payslips', function (Blueprint $table) {
            // The company bank account the net pay was released from, fixed when the run is paid.
            $table->foreignId('charge_bank_account_id')->nullable()->after('net_pay')->constrained('bank_accounts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropConstrainedForeignId('charge_bank_account_id');
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('charge_bank_account_id');
        });
    }
};
