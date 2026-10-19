<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\PermissionRegistrar;

/**
 * Clears the sample data the demo seeders created, for a clean start before go-live: every transaction, employee
 * and payroll record, customer and supplier, the sample company benefits and the demo logins. The setup stays:
 * entities, chart of accounts, journals, posting rules, tax codes, cost centers, fiscal years and periods, bank
 * accounts, roles and permissions, leave types, shifts, holidays, statutory benefit programs and every other login.
 */
class ClearDemoDataCommand extends Command
{
    protected $signature = 'accounting:clear-demo-data {--force : Delete; without it the command only reports what it would remove}';

    protected $description = 'Delete the sample transactions, employees, payroll, customers, suppliers and demo logins, keeping the setup';

    /** Emptied completely. */
    public const TABLES = [
        // Books
        'journal_entry_lines', 'journal_entries', 'account_period_balances', 'partner_balances',
        'invoice_payments', 'invoice_lines', 'invoices', 'customer_deposits',
        'bill_payments', 'bill_lines', 'bills',
        'bank_reconciliations', 'bank_transactions',
        'inventory_movements', 'inventory_items',
        'partners', 'vendors',
        // People and payroll
        'payslips', 'payroll_adjustments', 'payroll_runs', 'payroll_periods',
        'dtr_entries', 'attendance_requests', 'shift_rosters',
        'leave_ledger_entries', 'leave_balances', 'leave_requests',
        'employee_benefits', 'employees',
        'compliance_items', // regenerated from the statutory calendar when the page opens
        // Optical sync history (a later sync starts from the go-live date again)
        'sync_documents', 'sync_runs', 'sync_cursors',
        'audit_trails',
    ];

    /** Logins the demo seeders create (current and earlier versions), all on @jamora.local. */
    public const DEMO_USERNAMES = [
        'accountant', 'retainer', 'employee',
        'finance-manager', 'senior-accountant', 'accounting-staff', 'front-desk', 'payroll', 'auditor', 'management',
    ];

    public function handle(): int
    {
        $tables = array_values(array_filter(self::TABLES, fn (string $table) => Schema::hasTable($table)));
        $users = User::query()->whereIn('username', self::DEMO_USERNAMES)->where('email', 'like', '%@jamora.local')->orderBy('id')->get(['id', 'username']);
        $programs = DB::table('benefit_programs')->where('category', '!=', 'statutory')->orderBy('id')->get(['id', 'code']);

        $rows = array_map(fn (string $table) => [$table, DB::table($table)->count()], $tables);
        $rows[] = ['benefit_programs (not statutory)', $programs->count().($programs->isNotEmpty() ? ': '.$programs->pluck('code')->implode(', ') : '')];
        $rows[] = ['users (demo logins)', $users->count().($users->isNotEmpty() ? ': '.$users->pluck('username')->implode(', ') : '')];
        $this->table(['Records', 'Rows'], $rows);

        if (! $this->option('force')) {
            $this->info('Nothing deleted. Run again with --force to delete the records above.');

            return self::SUCCESS;
        }

        Schema::disableForeignKeyConstraints();
        try {
            foreach ($tables as $table) {
                DB::table($table)->truncate();
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        DB::transaction(function () use ($users, $programs) {
            DB::table('benefit_programs')->whereIn('id', $programs->pluck('id'))->delete();

            $ids = $users->pluck('id');
            $morph = (new User)->getMorphClass();
            DB::table('model_has_roles')->where('model_type', $morph)->whereIn('model_id', $ids)->delete();
            DB::table('model_has_permissions')->where('model_type', $morph)->whereIn('model_id', $ids)->delete();
            DB::table('sessions')->whereIn('user_id', $ids)->delete();
            DB::table('users')->whereIn('id', $ids)->delete(); // entity access goes with them
        });

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $this->info('Sample data cleared. The setup and the remaining logins are untouched.');

        return self::SUCCESS;
    }
}
