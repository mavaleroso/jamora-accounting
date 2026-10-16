import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';
import { Link, router } from '@inertiajs/react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const urlOf = (href: NavItem['href']) => (typeof href === 'string' ? href : ((href as { url?: string })?.url ?? ''));

// Library pages are visited manually rather than through the Link's own click handling.
const handleLibraryClick = (e: React.MouseEvent, url: string) => {
    if (!url.includes('/libraries/')) return;
    e.preventDefault();
    e.stopPropagation();
    router.visit(url);
};

function CountBadge({ count, className }: { count?: number | null; className?: string }) {
    if (count == null) return null;

    return (
        <span className={cn('ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums', className)}>
            {count.toLocaleString()}
        </span>
    );
}

export function NavMain({ items = [], title, icon: Icon }: { items: NavItem[]; title?: string; icon?: LucideIcon }) {
    const { isCurrentUrl } = useCurrentUrl();
    const { state, isMobile } = useSidebar();
    const isIconMode = state === 'collapsed' && !isMobile;

    // Highlight only the most specific match, so a section root (e.g. /employee-management) is not
    // also active on its child pages.
    const activeUrl = items
        .map((item) => urlOf(item.href))
        .filter((url) => url && isCurrentUrl(url))
        .sort((a, b) => b.length - a.length)[0];

    // Groups start collapsed; only the one containing the current page opens.
    // activeUrl is derived from the URL, so this matches the SSR output.
    const [open, setOpen] = useState(Boolean(activeUrl));
    // Animate only when the user toggles the group, not when a page visit remounts it already open.
    const [toggled, setToggled] = useState(false);

    useEffect(() => {
        setOpen(Boolean(activeUrl));
    }, [activeUrl]);

    // Untitled groups (e.g. Overview) are standalone links with no parent row.
    if (!title) {
        return (
            <SidebarGroup className="px-2 py-0">
                <SidebarMenu>
                    {items.map((item) => {
                        const url = urlOf(item.href);
                        return (
                            <SidebarMenuItem key={item.title}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={url !== '' && url === activeUrl}
                                    className="data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)]"
                                    tooltip={{ children: item.title }}
                                >
                                    <Link href={item.href} prefetch onClick={(e) => handleLibraryClick(e, url)}>
                                        {item.icon && <item.icon />}
                                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            </SidebarGroup>
        );
    }

    const hasActiveChild = Boolean(activeUrl);
    const parentClassName = cn(
        'font-medium',
        hasActiveChild && 'text-sidebar-accent-foreground [&>svg:first-child]:text-sidebar-primary font-semibold',
    );

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarMenu>
                {isIconMode ? (
                    <HoverMenu title={title} icon={Icon} items={items} activeUrl={activeUrl} className={parentClassName} />
                ) : (
                    <Collapsible
                        open={open}
                        onOpenChange={(next) => {
                            setToggled(true);
                            setOpen(next);
                        }}
                        asChild
                    >
                        <SidebarMenuItem className="group/collapsible">
                            <CollapsibleTrigger asChild>
                                <SidebarMenuButton className={parentClassName}>
                                    {Icon && <Icon />}
                                    <span className="min-w-0 flex-1 truncate">{title}</span>
                                    <ChevronRight className="ml-auto size-4 opacity-70 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[state=open]/collapsible:rotate-90" />
                                </SidebarMenuButton>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="sidebar-group-content" data-animate={toggled || undefined}>
                                <SidebarMenuSub className="mr-0 ml-4 gap-0.5 py-1 pr-0 pl-2">
                                    {items.map((item) => {
                                        const url = urlOf(item.href);
                                        return (
                                            <SidebarMenuSubItem key={item.title}>
                                                <SidebarMenuSubButton
                                                    asChild
                                                    size="sm"
                                                    isActive={url !== '' && url === activeUrl}
                                                    className="text-sidebar-foreground/80 data-[active=true]:text-sidebar-primary h-7 data-[active=true]:font-semibold data-[active=true]:shadow-[inset_2px_0_0_var(--sidebar-primary)] [&>svg]:size-3.5 [&>svg]:text-current"
                                                >
                                                    <Link href={item.href} prefetch onClick={(e) => handleLibraryClick(e, url)}>
                                                        {item.icon && <item.icon />}
                                                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                                        <CountBadge count={item.count} className="bg-sidebar-accent text-sidebar-accent-foreground" />
                                                    </Link>
                                                </SidebarMenuSubButton>
                                            </SidebarMenuSubItem>
                                        );
                                    })}
                                </SidebarMenuSub>
                            </CollapsibleContent>
                        </SidebarMenuItem>
                    </Collapsible>
                )}
            </SidebarMenu>
        </SidebarGroup>
    );
}

/** Icon-only parent for the collapsed sidebar; hovering (or clicking) it opens its child pages beside it. */
function HoverMenu({
    title,
    icon: Icon,
    items,
    activeUrl,
    className,
}: {
    title: string;
    icon?: LucideIcon;
    items: NavItem[];
    activeUrl?: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const show = () => {
        clearTimeout(closeTimer.current);
        setOpen(true);
    };
    // A short delay lets the pointer travel from the icon into the popover without it closing.
    const hide = () => {
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setOpen(false), 120);
    };

    useEffect(() => () => clearTimeout(closeTimer.current), []);

    return (
        <SidebarMenuItem>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <SidebarMenuButton
                        isActive={Boolean(activeUrl)}
                        aria-label={title}
                        className={cn('data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)]', className)}
                        onMouseEnter={show}
                        onMouseLeave={hide}
                    >
                        {Icon && <Icon />}
                        <span>{title}</span>
                    </SidebarMenuButton>
                </PopoverTrigger>
                <PopoverContent
                    side="right"
                    align="start"
                    sideOffset={10}
                    className="w-60 p-1.5"
                    onMouseEnter={show}
                    onMouseLeave={hide}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="text-muted-foreground flex items-center gap-2 px-2 pt-1 pb-1.5 text-xs font-semibold tracking-wide uppercase">
                        {Icon && <Icon className="size-3.5" />}
                        {title}
                    </div>
                    <ul className="flex flex-col gap-0.5">
                        {items.map((item) => {
                            const url = urlOf(item.href);
                            const isActive = url !== '' && url === activeUrl;
                            return (
                                <li key={item.title}>
                                    <Link
                                        href={item.href}
                                        prefetch
                                        data-active={isActive}
                                        className="hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent flex h-8 items-center gap-2 rounded-md px-2 text-sm data-[active=true]:font-semibold [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:opacity-70"
                                        onClick={(e) => {
                                            handleLibraryClick(e, url);
                                            setOpen(false);
                                        }}
                                    >
                                        {item.icon && <item.icon />}
                                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                        <CountBadge count={item.count} className="bg-muted text-muted-foreground" />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </PopoverContent>
            </Popover>
        </SidebarMenuItem>
    );
}
