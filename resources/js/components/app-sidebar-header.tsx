import { AppearanceToggle } from '@/components/appearance-toggle';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { EntitySwitcher } from '@/components/entity-switcher';
import LayoutToggleDropdown from '@/components/layout-toggle-dropdown';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ViewModeSwitch } from '@/components/view-mode-switch';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { usePage } from '@inertiajs/react';

/**
 * Routes that keep separate books per entity — show the entity switcher in the page header. The Employee Directory and
 * Bank Accounts are not: they list every company's records together, each labelled by company, and their forms pick it.
 */
const ENTITY_SCOPED_PATH_PREFIXES = [
    '/accounting',
    '/billing',
    '/payroll',
    '/ap',
    '/banks/reconciliations',
    '/reports',
    '/libraries/partners',
    '/libraries/vendors',
    '/libraries/cost-centers',
    '/libraries/tax-codes',
    '/libraries/journal-types',
    '/libraries/account-types',
    '/integration/optical',
] as const;

export function isEntityScopedPath(pathname: string): boolean {
    const path = pathname.split('?')[0] || '/';
    return ENTITY_SCOPED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function AppSidebarHeader({ breadcrumbs = [] }: { breadcrumbs?: BreadcrumbItemType[] }) {
    const { url } = usePage();
    const showEntitySwitcher = isEntityScopedPath(url);

    return (
        <header className="border-sidebar-border/50 flex h-16 shrink-0 items-center gap-2 border-b px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4">
            <div className="flex flex-1 items-center gap-2">
                <SidebarTrigger className="-ml-1" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>
            {showEntitySwitcher ? <EntitySwitcher variant="header" /> : null}
            <ViewModeSwitch />
            <AppearanceToggle />
            <LayoutToggleDropdown />
        </header>
    );
}
