<?php

namespace App\Support;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use Illuminate\Support\Str;

/**
 * Human-readable names for permission keys and roles, used by the Roles & Permissions screen.
 * Keys not listed here (created at runtime) fall back to a label derived from the key.
 */
class PermissionCatalog
{
    /** module key => [label, description, permission prefixes] — in display order */
    public const MODULES = [
        'general' => ['Dashboard', 'Home dashboard and KPIs.', ['dashboard']],
        'ledger' => ['General Ledger', 'Chart of accounts, journal entries and accounting periods.', ['accounts', 'journals', 'periods']],
        'reports' => ['Financial Reports', 'Statements, aging and tax reports.', ['reports']],
        'billing' => ['Billing & Collections', 'Invoices, receipts and customer deposits.', ['billing']],
        'payables' => ['Payables', 'Supplier bills and payments.', ['ap']],
        'banking' => ['Banking', 'Bank accounts, transactions and reconciliation.', ['banks']],
        'integration' => ['Optical Integration', 'Sync with the optical clinic system.', ['integration']],
        'people' => ['People & Payroll', 'Roster, attendance, leave, payroll and the employee portal.', ['roster', 'attendance', 'leave', 'payroll', 'portal']],
        'compliance' => ['Compliance', 'Statutory filing calendar: BIR, SSS, PhilHealth, Pag-IBIG, DOLE and LGU.', ['compliance']],
        'libraries' => ['Master Data', 'Reference lists used across modules.', ['libraries']],
        'admin' => ['Administration', 'Users, access control, audit trail and profile.', ['admin', 'settings']],
    ];

    /** permission key => [label, description] */
    public const PERMISSIONS = [
        'dashboard.view' => ['View dashboard', 'Open the home dashboard and its KPIs.'],

        'accounts.view' => ['View chart of accounts', 'Browse accounts and their balances.'],
        'accounts.manage' => ['Manage chart of accounts', 'Create, edit and deactivate accounts.'],
        'journals.view' => ['View journal entries', 'Browse journal entries and their lines.'],
        'journals.create' => ['Create journal entries', 'Draft manual journal entries.'],
        'journals.update' => ['Edit journal entries', 'Change draft or pending entries.'],
        'journals.delete' => ['Delete journal entries', 'Remove draft entries.'],
        'journals.approve' => ['Approve journal entries', 'Approve entries submitted for review.'],
        'journals.post' => ['Post journal entries', 'Post approved entries to the ledger.'],
        'journals.void' => ['Void journal entries', 'Reverse posted entries.'],
        'periods.view' => ['View accounting periods', 'See fiscal years and period status.'],
        'periods.manage' => ['Manage accounting periods', 'Create fiscal years and periods.'],
        'periods.close' => ['Close periods', 'Soft- or hard-close an accounting period.'],
        'periods.reopen' => ['Reopen periods', 'Reopen a closed period for corrections.'],

        'reports.trial-balance.view' => ['Trial balance', 'Run the trial balance.'],
        'reports.general-ledger.view' => ['General ledger', 'Run the general ledger report.'],
        'reports.journal-register.view' => ['Journal register', 'Run the journal register.'],
        'reports.income-statement.view' => ['Income statement', 'Run the income statement.'],
        'reports.balance-sheet.view' => ['Balance sheet', 'Run the balance sheet.'],
        'reports.cash-flow.view' => ['Cash flow', 'Run the cash flow statement.'],
        'reports.ar-aging.view' => ['AR aging', 'Run receivables aging.'],
        'reports.ap-aging.view' => ['AP aging', 'Run payables aging.'],
        'reports.vat-summary.view' => ['VAT summary', 'Run the VAT summary.'],
        'reports.daily-sales.view' => ['Daily sales', 'Run the daily sales report.'],
        'reports.export' => ['Export reports', 'Download reports as Excel / PDF.'],

        'billing.view' => ['View billing', 'Browse invoices, receipts and deposits.'],
        'billing.manage' => ['Manage invoices', 'Create, edit and cancel invoices.'],
        'billing.collect' => ['Collect payments', 'Record receipts and apply deposits.'],

        'ap.view' => ['View payables', 'Browse supplier bills.'],
        'ap.manage' => ['Manage bills', 'Create, edit and approve supplier bills.'],
        'ap.pay' => ['Pay bills', 'Record supplier payments.'],

        'banks.view' => ['View bank accounts', 'Browse bank accounts and transactions.'],
        'banks.manage' => ['Manage bank accounts', 'Create bank accounts and record transactions.'],
        'banks.reconcile' => ['Reconcile banks', 'Perform bank reconciliations.'],

        'integration.optical.view' => ['View optical sync', 'See synced documents and sync runs.'],
        'integration.optical.sync' => ['Run optical sync', 'Pull and post documents from the optical system.'],
        'integration.optical.rules-manage' => ['Manage sync rules', 'Edit how optical documents map to accounts.'],

        'roster.view' => ['View rosters', 'See shift schedules.'],
        'roster.manage' => ['Manage rosters', 'Create shifts and publish rosters.'],
        'attendance.view' => ['View attendance', 'See time records and the live board.'],
        'attendance.punch' => ['Clock in / out', 'Record own attendance punches.'],
        'attendance.manage' => ['Manage attendance', 'Correct, approve and close time records.'],
        'leave.view' => ['View leave', 'See leave requests and balances.'],
        'leave.file' => ['File leave', 'File own leave and attendance requests.'],
        'leave.approve' => ['Approve leave', 'Approve or decline leave and attendance requests.'],
        'payroll.view' => ['View payroll', 'See payroll runs and payslips.'],
        'payroll.manage' => ['Manage payroll setup', 'Pay periods, adjustments and benefit programs.'],
        'payroll.run' => ['Run payroll', 'Compute, approve, post and release payroll.'],
        'portal.view' => ['Employee portal', 'Open own payslips, leave and attendance.'],

        'compliance.view' => ['View compliance calendar', 'See filings, due dates and proof of filing.'],
        'compliance.manage' => ['Prepare & file', 'Generate the calendar, prepare filings and record submissions.'],
        'compliance.verify' => ['Verify filings', 'Sign off filings prepared by someone else, or return them.'],

        'libraries.account-types.manage' => ['Account types', 'Maintain account types.'],
        'libraries.journals.manage' => ['Journal types', 'Maintain journal books.'],
        'libraries.cost-centers.manage' => ['Cost centers', 'Maintain cost centers.'],
        'libraries.tax-codes.manage' => ['Tax codes', 'Maintain VAT and withholding codes.'],
        'libraries.employees.manage' => ['Employee directory', 'Maintain employee records.'],
        'libraries.partners.manage' => ['Partners', 'Maintain customers and patients.'],
        'libraries.vendors.manage' => ['Vendors', 'Maintain suppliers.'],

        'admin.users.manage' => ['Manage users', 'Create users, reset access and assign roles.'],
        'admin.roles-permissions.manage' => ['Manage roles & permissions', 'Change what each role can do.'],
        'admin.audit-trails.view' => ['View audit trail', 'Review the change log.'],
        'settings.profile.manage' => ['Edit own profile', 'Update own profile and password.'],
    ];

    /** Permissions a role holding admin.roles-permissions.manage must keep, so nobody locks themselves out. */
    public const ADMIN_LOCKED = [
        PermissionEnum::AdminRolesPermissionsManage->value,
        PermissionEnum::AdminUsersManage->value,
    ];

    /**
     * @return array{key: string, label: string, description: string, module: string, builtin: bool}
     */
    public static function describe(string $permission): array
    {
        [$label, $description] = self::PERMISSIONS[$permission] ?? [Str::of($permission)->replace(['.', '-'], ' ')->ucfirst()->toString(), ''];

        return [
            'key' => $permission,
            'label' => $label,
            'description' => $description,
            'module' => self::moduleOf($permission),
            'builtin' => PermissionEnum::tryFrom($permission) !== null,
        ];
    }

    public static function moduleOf(string $permission): string
    {
        $prefix = Str::before($permission, '.');
        foreach (self::MODULES as $key => [, , $prefixes]) {
            if (in_array($prefix, $prefixes, true)) {
                return $key;
            }
        }

        return 'other';
    }

    /**
     * @return array<int, array{key: string, label: string, description: string}>
     */
    public static function modules(): array
    {
        $modules = collect(self::MODULES)->map(fn ($m, $key) => ['key' => $key, 'label' => $m[0], 'description' => $m[1]])->values()->all();
        $modules[] = ['key' => 'other', 'label' => 'Other', 'description' => 'Custom permission keys.'];

        return $modules;
    }

    /** Built-in roles are referenced by code: they cannot be renamed or deleted. */
    public static function isSystemRole(string $role): bool
    {
        return RoleEnum::tryFrom($role) !== null;
    }

    public static function roleDescription(string $role): ?string
    {
        return match (RoleEnum::tryFrom($role)) {
            RoleEnum::Admin => 'Full access to every module, including user and access administration.',
            RoleEnum::FinanceManager => 'Oversees accounting: approves and posts entries, closes periods, sees all reports.',
            RoleEnum::SeniorAccountant => 'Prepares and posts journal entries, reconciles banks and runs reports.',
            RoleEnum::AccountingStaff => 'Day-to-day bookkeeping: drafts entries and records bills and receipts.',
            RoleEnum::FrontDeskBilling => 'Issues invoices and collects payments at the front desk.',
            RoleEnum::Payroll => 'Runs payroll, manages attendance, leave, rosters and benefits.',
            RoleEnum::Auditor => 'Read-only access to the books, reports and audit trail.',
            RoleEnum::Management => 'Dashboards and summary reports for decision-making.',
            RoleEnum::Employee => 'Self-service: own attendance, leave filings and payslips.',
            null => null,
        };
    }
}
