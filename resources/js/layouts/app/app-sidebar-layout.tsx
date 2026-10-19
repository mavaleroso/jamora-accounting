import { AppContent } from '@/components/app-content';
import { AppFooter } from '@/components/app-footer';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { useContentWidth } from '@/hooks/use-app-layout';
import { shellWidthClass } from '@/lib/app-shell-layout';
import { cn } from '@/lib/utils';
import type { AppLayoutProps } from '@/types';

export default function AppSidebarLayout({ children, breadcrumbs = [] }: AppLayoutProps) {
    const { contentWidth } = useContentWidth();

    return (
        <AppShell variant="sidebar">
            <AppSidebar />
            <AppContent variant="sidebar" className="overflow-x-hidden">
                <AppSidebarHeader breadcrumbs={breadcrumbs} />
                <div data-page-content className={cn(shellWidthClass(contentWidth), 'flex flex-1 flex-col')}>
                    {children}
                </div>
                <AppFooter />
            </AppContent>
        </AppShell>
    );
}
