import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { overviewNavItem, useNavGroups } from '@/hooks/use-nav-groups';
import { APP_BRAND } from '@/lib/entities';

export function AppSidebar() {
    const { groups, isEmployee } = useNavGroups();

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <div className="flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                    <APP_BRAND.logo className="size-8 shrink-0" />
                    <span className="truncate text-base font-semibold tracking-wide uppercase group-data-[collapsible=icon]:hidden">
                        {APP_BRAND.name}
                    </span>
                </div>
            </SidebarHeader>

            <SidebarContent>
                {!isEmployee && <NavMain items={[overviewNavItem]} />}
                {groups.map((group) => (
                    <NavMain key={group.title} items={group.items} title={group.title} />
                ))}
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
