import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { overviewNavItem, useNavGroups, type NavGroup } from '@/hooks/use-nav-groups';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { ChevronDown } from 'lucide-react';

const navbarLinkClass =
    'inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring';

const activeLinkClass = 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_-2px_0_var(--sidebar-primary)] hover:bg-sidebar-accent';

/** Shorter group names so the full module list fits a single navbar row. */
const navbarTitle: Record<string, string> = {
    'Inventory Integration': 'Inventory',
    'Accounts Payable': 'Payables',
    'Employee Management': 'People',
};

const hrefOf = (href: NavItem['href']) => (typeof href === 'string' ? href : href.url);

/** Most specific match wins, so a section root is not also active on its child pages. */
function useActiveUrl(groups: NavGroup[]): string | undefined {
    const { isCurrentUrl } = useCurrentUrl();

    return [overviewNavItem, ...groups.flatMap((g) => g.items)]
        .map((item) => hrefOf(item.href))
        .filter((url) => url && isCurrentUrl(url))
        .sort((a, b) => b.length - a.length)[0];
}

function NavBadge({ count, tone = 'sidebar' }: { count?: number | null; tone?: 'sidebar' | 'menu' }) {
    if (count == null || count <= 0) return null;

    return (
        <span
            className={cn(
                'ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                tone === 'sidebar' ? 'bg-sidebar-accent text-sidebar-foreground/80' : 'bg-muted text-muted-foreground',
            )}
        >
            {count > 999 ? '999+' : count.toLocaleString()}
        </span>
    );
}

function NavGroupDropdown({ group, activeUrl }: { group: NavGroup; activeUrl?: string }) {
    const active = group.items.some((item) => hrefOf(item.href) === activeUrl);
    const Icon = group.icon;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" className={cn(navbarLinkClass, 'gap-1.5', active && activeLinkClass)}>
                    <Icon className="h-4 w-4 opacity-80" aria-hidden />
                    {navbarTitle[group.title] ?? group.title}
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[60] w-60 p-1">
                {group.items.map((item) => {
                    const itemActive = hrefOf(item.href) === activeUrl;

                    return (
                        <DropdownMenuItem key={item.title} asChild className={cn(itemActive && 'bg-primary/10 text-primary font-medium')}>
                            <Link href={item.href} prefetch className="flex w-full cursor-pointer items-center gap-2">
                                {item.icon && <item.icon className="h-4 w-4" />}
                                <span>{item.title}</span>
                                <NavBadge count={item.count} tone="menu" />
                            </Link>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export function AppNavbarNav({ className }: { className?: string }) {
    const { groups, isEmployee } = useNavGroups();
    const activeUrl = useActiveUrl(groups);
    const OverviewIcon = overviewNavItem.icon;

    return (
        <nav className={cn('hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex', className)}>
            {!isEmployee && (
                <Link
                    href={overviewNavItem.href}
                    prefetch
                    className={cn(navbarLinkClass, hrefOf(overviewNavItem.href) === activeUrl && activeLinkClass)}
                >
                    {OverviewIcon && <OverviewIcon className="h-4 w-4 opacity-80" />}
                    {overviewNavItem.title}
                </Link>
            )}
            {groups.map((group) => (
                <NavGroupDropdown key={group.title} group={group} activeUrl={activeUrl} />
            ))}
        </nav>
    );
}

function MobileNavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
    return (
        <Link
            href={item.href}
            onClick={onNavigate}
            className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--sidebar-primary)]'
                    : 'text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )}
        >
            {item.icon && <item.icon className="h-4 w-4" />}
            {item.title}
            <NavBadge count={item.count} />
        </Link>
    );
}

/** Full navigation list for the navbar layout's slide-out menu on small screens. */
export function AppNavbarMobileNav({ onNavigate }: { onNavigate?: () => void }) {
    const { groups, isEmployee } = useNavGroups();
    const activeUrl = useActiveUrl(groups);

    return (
        <nav className="flex flex-col gap-4 overflow-y-auto p-3">
            {!isEmployee && <MobileNavLink item={overviewNavItem} active={hrefOf(overviewNavItem.href) === activeUrl} onNavigate={onNavigate} />}
            {groups.map((group) => (
                <div key={group.title} className="space-y-1">
                    <p className="text-sidebar-foreground/50 px-3 text-[10px] font-semibold tracking-wider uppercase">{group.title}</p>
                    {group.items.map((item) => (
                        <MobileNavLink key={item.title} item={item} active={hrefOf(item.href) === activeUrl} onNavigate={onNavigate} />
                    ))}
                </div>
            ))}
        </nav>
    );
}
