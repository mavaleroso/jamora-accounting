import { Link, router } from '@inertiajs/react';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

export function NavMain({
    items = [],
    title,
}: {
    items: NavItem[];
    title: string;
}) {
    const { isCurrentUrl } = useCurrentUrl();

    const handleNavClick = (e: React.MouseEvent, href: NavItem['href']) => {
        const url = typeof href === 'string' ? href : (href as { url?: string })?.url;
        if (!url) return;
        e.preventDefault();
        e.stopPropagation();
        router.visit(url);
    };

    const urlOf = (href: NavItem['href']) => (typeof href === 'string' ? href : ((href as { url?: string })?.url ?? ''));
    // Highlight only the most specific match, so a section root (e.g. /employee-management) is not
    // also active on its child pages.
    const activeUrl = items
        .map((item) => urlOf(item.href))
        .filter((url) => url && isCurrentUrl(url))
        .sort((a, b) => b.length - a.length)[0];

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>{title}</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => {
                    const href = item.href;
                    const url = urlOf(href);
                    const isLibrary = url.includes('/libraries/');
                    return (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                                asChild
                                isActive={url !== '' && url === activeUrl}
                                tooltip={
                                    isLibrary
                                        ? undefined
                                        : {
                                              children:
                                                  item.count != null
                                                      ? `${item.title} (${item.count})`
                                                      : item.title,
                                          }
                                }
                            >
                                <Link
                                    href={href}
                                    prefetch
                                    className="flex w-full items-center gap-2"
                                    onClick={(e) => isLibrary && handleNavClick(e, href)}
                                >
                                    {item.icon && <item.icon />}
                                    <span className="min-w-0 flex-1 truncate">
                                        {item.title}
                                    </span>
                                    {item.count != null && (
                                        <span className="ml-auto shrink-0 rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-sidebar-accent-foreground tabular-nums group-data-[collapsible=icon]:hidden">
                                            {item.count.toLocaleString()}
                                        </span>
                                    )}
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}
