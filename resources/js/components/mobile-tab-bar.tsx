import { openCommandPalette } from '@/components/command-palette';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { overviewNavItem, REPORTS_HUB_URL, useNavGroups } from '@/hooks/use-nav-groups';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { Menu, Search, type LucideIcon } from 'lucide-react';

/** Fired to open the full menu (the sidebar drawer, or the navbar's slide-out menu) from the tab bar. */
export const OPEN_MENU_EVENT = 'app-menu:open';

/** The pages an employee opens most, in thumb order, with labels short enough for a phone. */
const EMPLOYEE_TABS: { href: string; label: string }[] = [
    { href: '/employee-management/portal', label: 'Home' },
    { href: '/employee-management/attendance', label: 'Time' },
    { href: '/employee-management/roster', label: 'Schedule' },
    { href: '/employee-management/requests', label: 'Requests' },
    { href: '/employee-management/my-pay', label: 'Pay' },
];

type Tab = { label: string; icon?: LucideIcon | null } & ({ href: string } | { onClick: () => void });

const tabClass = (active: boolean) =>
    cn(
        'flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
    );

const hrefOf = (href: NavItem['href']) => (typeof href === 'string' ? href : href.url);

/**
 * Bottom tab bar on phones, within reach of the thumb. Employees get their own pages; everyone else gets the
 * Overview, Reports, search and the full menu. Wider screens use the regular menu.
 */
export function MobileTabBar() {
    const { groups, isEmployee } = useNavGroups();
    const { isCurrentUrl } = useCurrentUrl();
    const items = groups.flatMap((group) => [...(group.hub ? [group.hub] : []), ...group.items]);

    const tabs: Tab[] = isEmployee
        ? EMPLOYEE_TABS.flatMap((tab) => {
              const item = items.find((i) => i.href === tab.href);
              return item ? [{ ...tab, icon: item.icon }] : [];
          })
        : [
              { href: hrefOf(overviewNavItem.href), label: 'Home', icon: overviewNavItem.icon },
              ...items.filter((item) => item.href === REPORTS_HUB_URL).map((item) => ({ href: REPORTS_HUB_URL, label: 'Reports', icon: item.icon })),
              { label: 'Search', icon: Search, onClick: openCommandPalette },
              { label: 'Menu', icon: Menu, onClick: () => window.dispatchEvent(new Event(OPEN_MENU_EVENT)) },
          ];

    if (tabs.length < 2) return null;

    return (
        <nav
            aria-label="Main"
            className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
        >
            <ul className="flex">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = 'href' in tab && isCurrentUrl(tab.href);
                    const content = (
                        <>
                            {Icon && <Icon className={cn('size-5', active && 'stroke-[2.25]')} />}
                            <span className="truncate">{tab.label}</span>
                        </>
                    );

                    return (
                        <li key={tab.label} className="min-w-0 flex-1">
                            {'href' in tab ? (
                                <Link href={tab.href} prefetch aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                                    {content}
                                </Link>
                            ) : (
                                <button type="button" onClick={tab.onClick} className={tabClass(false)}>
                                    {content}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

/** Bottom padding that keeps page content clear of the tab bar on phones (and of the home indicator under it). */
export const TAB_BAR_SPACING = 'max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]';
