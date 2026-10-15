import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';
import { Link, router } from '@inertiajs/react';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

export function NavMain({ items = [], title }: { items: NavItem[]; title?: string }) {
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

    // Groups start collapsed; only the one containing the current page opens.
    // activeUrl is derived from the URL, so this matches the SSR output.
    const [open, setOpen] = useState(Boolean(activeUrl));

    useEffect(() => {
        setOpen(Boolean(activeUrl));
    }, [activeUrl]);

    const menu = (
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
                            className="data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)]"
                            tooltip={
                                isLibrary
                                    ? undefined
                                    : {
                                          children: item.count != null ? `${item.title} (${item.count})` : item.title,
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
                                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                {item.count != null && (
                                    <span className="bg-sidebar-accent text-sidebar-accent-foreground ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums group-data-[collapsible=icon]:hidden">
                                        {item.count.toLocaleString()}
                                    </span>
                                )}
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                );
            })}
        </SidebarMenu>
    );

    // Untitled groups (e.g. Overview) are standalone links with no collapsible header.
    if (!title) {
        return <SidebarGroup className="px-2 py-0">{menu}</SidebarGroup>;
    }

    return (
        <Collapsible open={open} onOpenChange={setOpen} asChild>
            <SidebarGroup className="group/collapsible px-2 py-0">
                <SidebarGroupLabel asChild>
                    <CollapsibleTrigger className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full cursor-pointer">
                        {title}
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </CollapsibleTrigger>
                </SidebarGroupLabel>
                {/* Force-mounted so item icons stay visible when the sidebar is collapsed to icon mode. */}
                <CollapsibleContent forceMount className="group-data-[collapsible=icon]:block! data-[state=closed]:hidden">
                    {menu}
                </CollapsibleContent>
            </SidebarGroup>
        </Collapsible>
    );
}
