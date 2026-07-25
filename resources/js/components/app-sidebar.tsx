import { usePage } from '@inertiajs/react';
import {
    BookOpen,
    Calculator,
    CalendarRange,
    FileSpreadsheet,
    HistoryIcon,
    Landmark,
    LayoutGrid,
    Link2,
    ListTree,
    Receipt,
    Scale,
    Shield,
    Users,
    Wallet,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { hasAnyPermission, hasPermission } from '@/lib/permissions';
import type { NavItem, SharedData } from '@/types';
import { Link } from '@inertiajs/react';

const accountingNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        href: '/accounting/dashboard',
        icon: LayoutGrid,
    },
    {
        title: 'Journal Entries',
        href: '/accounting/journal-entries',
        icon: Receipt,
    },
    {
        title: 'Chart of Accounts',
        href: '/accounting/chart-of-accounts',
        icon: BookOpen,
    },
    {
        title: 'General Ledger',
        href: '/accounting/general-ledger',
        icon: Landmark,
    },
    {
        title: 'Accounting Periods',
        href: '/accounting/periods',
        icon: CalendarRange,
    },
];

const reportsNavItems: NavItem[] = [
    {
        title: 'Trial Balance',
        href: '/reports/trial-balance',
        icon: Scale,
    },
    {
        title: 'Income Statement',
        href: '/reports/income-statement',
        icon: FileSpreadsheet,
    },
    {
        title: 'Balance Sheet',
        href: '/reports/balance-sheet',
        icon: Wallet,
    },
    {
        title: 'Cash Flow',
        href: '/reports/cash-flow',
        icon: Calculator,
    },
    {
        title: 'Journal Register',
        href: '/reports/journal-register',
        icon: ListTree,
    },
];

const librariesNavItems: NavItem[] = [
    {
        title: 'Account Types',
        href: '/libraries/account-types',
        icon: BookOpen,
    },
    {
        title: 'Journal Types',
        href: '/libraries/journal-types',
        icon: Receipt,
    },
    {
        title: 'Cost Centers',
        href: '/libraries/cost-centers',
        icon: Landmark,
    },
    {
        title: 'Tax Codes',
        href: '/libraries/tax-codes',
        icon: Calculator,
    },
];

const integrationNavItems: NavItem[] = [
    {
        title: 'Optical Sync',
        href: '/integration/optical',
        icon: Link2,
    },
    {
        title: 'Sync Rules',
        href: '/integration/optical/rules',
        icon: ListTree,
    },
];

const adminNavItems: NavItem[] = [
    {
        title: 'Users',
        href: '/admin/users',
        icon: Users,
    },
    {
        title: 'Roles & Permissions',
        href: '/admin/roles',
        icon: Shield,
    },
    {
        title: 'Audit Trails',
        href: '/admin/audit-trails',
        icon: HistoryIcon,
    },
];

export function AppSidebar() {
    const { props } = usePage<SharedData>();
    const auth = props?.auth;
    const can = (permission: string) => hasPermission(auth, permission);
    const canAny = (permissions: string[]) => hasAnyPermission(auth, permissions);

    const userCount = props.userCount ?? 0;
    const roleCount = props.roleCount ?? 0;
    const journalEntryCount = props.journalEntryCount ?? 0;
    const syncExceptionCount = props.syncExceptionCount ?? 0;

    const filteredAccounting = accountingNavItems
        .map((item) => {
            if (item.href === '/accounting/journal-entries') {
                return { ...item, count: journalEntryCount };
            }

            return item;
        })
        .filter((item) => {
            switch (item.href) {
                case '/accounting/dashboard':
                    return can('dashboard.view');
                case '/accounting/journal-entries':
                    return canAny(['journals.view', 'journals.create', 'journals.update', 'journals.post']);
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
            default:
                return true;
        }
    });

    const filteredIntegration = integrationNavItems
        .map((item) => {
            if (item.href === '/integration/optical') {
                return { ...item, count: syncExceptionCount };
            }

            return item;
        })
        .filter((item) => {
            switch (item.href) {
                case '/integration/optical':
                    return canAny(['integration.optical.view', 'integration.optical.sync']);
                case '/integration/optical/rules':
                    return can('integration.optical.rules-manage');
                default:
                    return true;
            }
        });

    const filteredAdmin = adminNavItems
        .map((item) => {
            switch (item.href) {
                case '/admin/users':
                    return { ...item, count: userCount };
                case '/admin/roles':
                    return { ...item, count: roleCount };
                default:
                    return item;
            }
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

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/accounting/dashboard" prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {filteredAccounting.length > 0 && <NavMain items={filteredAccounting} title="Accounting" />}
                {filteredReports.length > 0 && <NavMain items={filteredReports} title="Reports" />}
                {filteredLibraries.length > 0 && <NavMain items={filteredLibraries} title="Libraries" />}
                {filteredIntegration.length > 0 && <NavMain items={filteredIntegration} title="Integration" />}
                {filteredAdmin.length > 0 && <NavMain items={filteredAdmin} title="Admin" />}
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
