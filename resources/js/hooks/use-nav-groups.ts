import { hasAnyPermission, hasPermission } from '@/lib/permissions';
import type { NavItem, SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import {
    BadgeCheck,
    Banknote,
    BarChart3,
    BookOpen,
    Building2,
    Calculator,
    CalendarCheck,
    CalendarRange,
    ClipboardList,
    Clock,
    CreditCard,
    FileSpreadsheet,
    HeartHandshake,
    HistoryIcon,
    Home,
    Landmark,
    LayoutDashboard,
    LayoutGrid,
    Library,
    Link2,
    ListTree,
    Package,
    Receipt,
    Scale,
    Shield,
    UserCheck,
    UserRound,
    Users,
    Wallet,
    type LucideIcon,
} from 'lucide-react';

export type NavGroup = {
    title: string;
    icon: LucideIcon;
    items: NavItem[];
};

export const overviewNavItem: NavItem = { title: 'Overview', href: '/overview', icon: Home };

const accountingNavItems: NavItem[] = [
    { title: 'Dashboard', href: '/accounting/dashboard', icon: LayoutGrid },
    { title: 'Non-Cash Journals', href: '/accounting/journal-entries', icon: Receipt },
    { title: 'Cash & Bank Records', href: '/accounting/cash-bank-records', icon: Wallet },
    { title: 'Chart of Accounts', href: '/accounting/chart-of-accounts', icon: BookOpen },
    { title: 'General Ledger', href: '/accounting/general-ledger', icon: Landmark },
    { title: 'Accounting Periods', href: '/accounting/periods', icon: CalendarRange },
];

const billingNavItems: NavItem[] = [
    { title: 'Invoices & Billing', href: '/billing/invoices', icon: Receipt },
    { title: 'Customer Deposits', href: '/billing/deposits', icon: Wallet },
];

const inventoryNavItems: NavItem[] = [
    { title: 'Inventory Movements', href: '/integration/inventory', icon: Package },
    { title: 'Optical Sync', href: '/integration/optical', icon: Link2 },
    { title: 'Sync Rules', href: '/integration/optical/rules', icon: ListTree },
];

const apNavItems: NavItem[] = [{ title: 'Bills & Payables', href: '/ap/bills', icon: CreditCard }];

const banksNavItems: NavItem[] = [
    { title: 'Bank Accounts', href: '/banks/accounts', icon: Landmark },
    { title: 'Reconciliations', href: '/banks/reconciliations', icon: Scale },
];

const employeeMgmtNavItems: NavItem[] = [
    { title: 'Dashboard', href: '/employee-management', icon: LayoutDashboard },
    { title: 'Employee Directory', href: '/libraries/employees', icon: UserRound },
    { title: 'Shift & Roster', href: '/employee-management/roster', icon: CalendarCheck },
    { title: 'Time & Attendance', href: '/employee-management/attendance', icon: Clock },
    { title: 'Employee Requests', href: '/employee-management/requests', icon: ClipboardList },
    { title: 'Payroll', href: '/payroll/runs', icon: Banknote },
    { title: 'Benefits Admin', href: '/employee-management/benefits', icon: HeartHandshake },
    { title: 'Employee Portal', href: '/employee-management/portal', icon: UserCheck },
    { title: 'My Pay', href: '/employee-management/my-pay', icon: Wallet },
    { title: 'People Reports', href: '/employee-management/reports', icon: BarChart3 },
    { title: 'Compliance Mgmt', href: '/employee-management/compliance', icon: BadgeCheck },
];

const reportsNavItems: NavItem[] = [
    { title: 'Trial Balance', href: '/reports/trial-balance', icon: Scale },
    { title: 'Income Statement', href: '/reports/income-statement', icon: FileSpreadsheet },
    { title: 'Balance Sheet', href: '/reports/balance-sheet', icon: Wallet },
    { title: 'Cash Flow', href: '/reports/cash-flow', icon: Calculator },
    { title: 'Journal Register', href: '/reports/journal-register', icon: ListTree },
    { title: 'AR Aging', href: '/reports/ar-aging', icon: FileSpreadsheet },
    { title: 'AP Aging', href: '/reports/ap-aging', icon: FileSpreadsheet },
    { title: 'Daily Sales', href: '/reports/operations/daily-sales', icon: Receipt },
    { title: 'VAT Summary', href: '/reports/operations/vat-summary', icon: Calculator },
    { title: 'Cost of Goods Sold', href: '/reports/operations/cogs', icon: Package },
    { title: 'Collections by Method', href: '/reports/operations/collections', icon: CreditCard },
    { title: 'Deposits Liability', href: '/reports/operations/deposits', icon: Wallet },
];

const librariesNavItems: NavItem[] = [
    { title: 'Account Types', href: '/libraries/account-types', icon: BookOpen },
    { title: 'Journal Types', href: '/libraries/journal-types', icon: Receipt },
    { title: 'Cost Centers', href: '/libraries/cost-centers', icon: Landmark },
    { title: 'Tax Codes', href: '/libraries/tax-codes', icon: Calculator },
    { title: 'Partners', href: '/libraries/partners', icon: Users },
    { title: 'Vendors', href: '/libraries/vendors', icon: Building2 },
];

const adminNavItems: NavItem[] = [
    { title: 'Users', href: '/admin/users', icon: Users },
    { title: 'Roles & Permissions', href: '/admin/roles', icon: Shield },
    { title: 'Audit Trails', href: '/admin/audit-trails', icon: HistoryIcon },
];

/**
 * The sidebar's module groups, filtered to what the signed-in user may access.
 * Shared by the sidebar and the Overview page so both stay in sync.
 */
export function useNavGroups(): { groups: NavGroup[]; isEmployee: boolean } {
    const { props } = usePage<SharedData>();
    const auth = props?.auth;
    const isEmployee = auth?.user?.roles?.includes('Employee') ?? false;
    const can = (permission: string) => hasPermission(auth, permission);
    const canAny = (permissions: string[]) => hasAnyPermission(auth, permissions);

    const userCount = props.userCount ?? 0;
    const roleCount = props.roleCount ?? 0;
    const journalEntryCount = props.journalEntryCount ?? 0;
    const syncExceptionCount = props.syncExceptionCount ?? 0;

    const filteredAccounting = accountingNavItems
        .map((item) => (item.href === '/accounting/journal-entries' ? { ...item, count: journalEntryCount } : item))
        .filter((item) => {
            switch (item.href) {
                case '/accounting/dashboard':
                    return can('dashboard.view');
                case '/accounting/journal-entries':
                    return canAny(['journals.view', 'journals.create', 'journals.update', 'journals.post']);
                case '/accounting/cash-bank-records':
                    return canAny(['banks.view', 'journals.view', 'banks.manage', 'journals.create']);
                case '/accounting/chart-of-accounts':
                    return canAny(['accounts.view', 'accounts.manage']);
                case '/accounting/general-ledger':
                    return can('reports.general-ledger.view');
                case '/accounting/periods':
                    return canAny(['periods.view', 'periods.manage', 'periods.close', 'periods.reopen']);
                default:
                    return true;
            }
        });

    const filteredBilling = billingNavItems.filter((item) => {
        switch (item.href) {
            case '/billing/invoices':
            case '/billing/deposits':
                return canAny(['billing.view', 'billing.manage', 'billing.collect']);
            default:
                return true;
        }
    });

    const filteredAp = apNavItems.filter(() => canAny(['ap.view', 'ap.manage', 'ap.pay']));

    const filteredBanks = banksNavItems.filter(() => canAny(['banks.view', 'banks.manage', 'banks.reconcile']));

    const filteredReports = reportsNavItems.filter((item) => {
        switch (item.href) {
            case '/reports/trial-balance':
                return can('reports.trial-balance.view');
            case '/reports/income-statement':
                return can('reports.income-statement.view');
            case '/reports/balance-sheet':
                return can('reports.balance-sheet.view');
            case '/reports/cash-flow':
                return can('reports.cash-flow.view');
            case '/reports/journal-register':
                return can('reports.journal-register.view');
            case '/reports/ar-aging':
                return can('reports.ar-aging.view');
            case '/reports/ap-aging':
                return can('reports.ap-aging.view');
            case '/reports/operations/daily-sales':
            case '/reports/operations/collections':
                return can('reports.daily-sales.view');
            case '/reports/operations/vat-summary':
                return can('reports.vat-summary.view');
            case '/reports/operations/cogs':
                return can('reports.income-statement.view');
            case '/reports/operations/deposits':
                return can('reports.ar-aging.view');
            default:
                return true;
        }
    });

    const filteredLibraries = librariesNavItems.filter((item) => {
        switch (item.href) {
            case '/libraries/account-types':
                return can('libraries.account-types.manage');
            case '/libraries/journal-types':
                return can('libraries.journals.manage');
            case '/libraries/cost-centers':
                return can('libraries.cost-centers.manage');
            case '/libraries/tax-codes':
                return can('libraries.tax-codes.manage');
            case '/libraries/partners':
                return can('libraries.partners.manage');
            case '/libraries/employees':
                return can('libraries.employees.manage');
            case '/libraries/vendors':
                return can('libraries.vendors.manage');
            default:
                return true;
        }
    });

    const filteredIntegration = inventoryNavItems
        .map((item) => (item.href === '/integration/optical' ? { ...item, count: syncExceptionCount } : item))
        .filter((item) => {
            switch (item.href) {
                case '/integration/inventory':
                    return canAny(['integration.optical.view', 'journals.view', 'billing.view']);
                case '/integration/optical':
                    return canAny(['integration.optical.view', 'integration.optical.sync']);
                case '/integration/optical/rules':
                    return can('integration.optical.rules-manage');
                default:
                    return true;
            }
        });

    const filteredEmployeeMgmt = employeeMgmtNavItems
        .filter((item) => {
            switch (item.href) {
                case '/employee-management':
                    // Same gate as the route: anyone who manages part of Employee Management (not self-service staff).
                    return (
                        canAny([
                            'attendance.manage',
                            'leave.approve',
                            'payroll.view',
                            'payroll.manage',
                            'payroll.run',
                            'roster.manage',
                            'libraries.employees.manage',
                            'compliance.view',
                        ]) && !isEmployee
                    );
                case '/libraries/employees':
                    return can('libraries.employees.manage');
                case '/employee-management/roster':
                    return canAny(['roster.view', 'roster.manage', 'payroll.view', 'payroll.manage']);
                case '/employee-management/attendance':
                    return canAny(['attendance.view', 'attendance.punch', 'attendance.manage', 'payroll.view', 'payroll.manage']);
                case '/employee-management/requests':
                    return canAny([
                        'leave.view',
                        'leave.file',
                        'leave.approve',
                        'attendance.view',
                        'attendance.punch',
                        'attendance.manage',
                        'payroll.view',
                        'payroll.manage',
                    ]);
                case '/payroll/runs':
                    return canAny(['payroll.view', 'payroll.run']);
                case '/employee-management/benefits':
                    return canAny(['payroll.manage', 'libraries.employees.manage']);
                case '/employee-management/portal':
                    // A personal page: only useful to someone with an employee record in this branch.
                    return !!auth?.user?.employee_id && canAny(['portal.view', 'payroll.view', 'payroll.manage']);
                case '/employee-management/my-pay':
                    // The signed-in employee's own pay history.
                    return !!auth?.user?.employee_id && can('portal.view');
                case '/employee-management/reports':
                    return canAny(['payroll.view', 'dashboard.view']);
                case '/employee-management/compliance':
                    return canAny(['compliance.view', 'compliance.manage', 'compliance.verify']);
                default:
                    return true;
            }
        })
        .map((item) => {
            // Same rule as the server: without scheduling or payroll access the roster is the user's own week.
            if (item.href === '/employee-management/roster' && !canAny(['roster.manage', 'payroll.view', 'payroll.manage'])) {
                return { ...item, title: 'My Schedule' };
            }

            if (!isEmployee) return item;

            if (item.href === '/employee-management/portal') {
                return { ...item, title: 'Dashboard' };
            }

            if (item.href === '/employee-management/attendance') {
                return { ...item, title: 'My Attendance' };
            }

            if (item.href === '/employee-management/requests') {
                return { ...item, title: 'My Requests' };
            }

            return item;
        });

    // Employees land on their portal, so it leads their menu.
    if (isEmployee) {
        filteredEmployeeMgmt.sort((a, b) => Number(b.href === '/employee-management/portal') - Number(a.href === '/employee-management/portal'));
    }

    const filteredAdmin = adminNavItems
        .map((item) => {
            if (item.href === '/admin/users') return { ...item, count: userCount };
            if (item.href === '/admin/roles') return { ...item, count: roleCount };
            return item;
        })
        .filter((item) => {
            switch (item.href) {
                case '/admin/users':
                    return can('admin.users.manage');
                case '/admin/roles':
                    return can('admin.roles-permissions.manage');
                case '/admin/audit-trails':
                    return can('admin.audit-trails.view');
                default:
                    return true;
            }
        });

    const groups: NavGroup[] = isEmployee
        ? [{ title: 'Employee Management', icon: Users, items: filteredEmployeeMgmt }]
        : [
              { title: 'Accounting', icon: BookOpen, items: filteredAccounting },
              { title: 'Billing', icon: Receipt, items: filteredBilling },
              { title: 'Inventory Integration', icon: Package, items: filteredIntegration },
              { title: 'Accounts Payable', icon: CreditCard, items: filteredAp },
              { title: 'Banks', icon: Landmark, items: filteredBanks },
              { title: 'Employee Management', icon: Users, items: filteredEmployeeMgmt },
              { title: 'Reports', icon: BarChart3, items: filteredReports },
              { title: 'Libraries', icon: Library, items: filteredLibraries },
              { title: 'Admin', icon: Shield, items: filteredAdmin },
          ];

    return { groups: groups.filter((group) => group.items.length > 0), isEmployee };
}
