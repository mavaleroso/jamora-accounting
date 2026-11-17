import { AppContent } from '@/components/app-content';
import { AppFooter } from '@/components/app-footer';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { EmployeeViewBanner } from '@/components/employee-view-banner';
import { MobileTabBar, OPEN_MENU_EVENT, TAB_BAR_SPACING } from '@/components/mobile-tab-bar';
import { useSidebar } from '@/components/ui/sidebar';
import { useContentWidth } from '@/hooks/use-app-layout';
import { shellWidthClass } from '@/lib/app-shell-layout';
import { cn } from '@/lib/utils';
import type { AppLayoutProps } from '@/types';
import { useEffect } from 'react';

/** Opens the sidebar drawer when the tab bar's Menu button is pressed. */
function OpenMenuFromTabBar() {
    const { setOpenMobile } = useSidebar();

    useEffect(() => {
        const open = () => setOpenMobile(true);
        window.addEventListener(OPEN_MENU_EVENT, open);
        return () => window.removeEventListener(OPEN_MENU_EVENT, open);
    }, [setOpenMobile]);

    return null;
}

export default function AppSidebarLayout({ children, breadcrumbs = [] }: AppLayoutProps) {
    const { contentWidth } = useContentWidth();

    return (
        <AppShell variant="sidebar">
            <AppSidebar />
            <AppContent variant="sidebar" className={cn('overflow-x-clip', TAB_BAR_SPACING)}>
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                <EmployeeViewBanner />
                <div data-page-content className={cn(shellWidthClass(contentWidth), 'flex flex-1 flex-col')}>
                    {children}
                </div>
                <AppFooter />
            </AppContent>
            <MobileTabBar />
            <OpenMenuFromTabBar />
        </AppShell>
    );
}
