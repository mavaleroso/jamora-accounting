import { AppFooter } from '@/components/app-footer';
import { AppHeader } from '@/components/app-header';
import { AppShell } from '@/components/app-shell';
import { EmployeeViewBanner } from '@/components/employee-view-banner';
import { MobileTabBar, TAB_BAR_SPACING } from '@/components/mobile-tab-bar';
import { useContentWidth } from '@/hooks/use-app-layout';
import { shellWidthClass } from '@/lib/app-shell-layout';
import { cn } from '@/lib/utils';
import type { AppLayoutProps } from '@/types';

/** Top-navbar shell: full-width header, page content centred on the same width, footer at the bottom. */
export default function AppHeaderLayout({ children, breadcrumbs }: AppLayoutProps) {
    const { contentWidth } = useContentWidth();

    return (
        <AppShell>
            <div className={cn('bg-background flex min-h-svh w-full flex-col', TAB_BAR_SPACING)}>
                <AppHeader breadcrumbs={breadcrumbs} />
                <EmployeeViewBanner />
                <main data-page-content className={cn(shellWidthClass(contentWidth), 'flex flex-1 flex-col')}>
                    {children}
                </main>
                <AppFooter />
            </div>
            <MobileTabBar />
        </AppShell>
    );
}
