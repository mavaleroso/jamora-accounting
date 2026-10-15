import { AppFooter } from '@/components/app-footer';
import { AppHeader } from '@/components/app-header';
import { AppShell } from '@/components/app-shell';
import { useContentWidth } from '@/hooks/use-app-layout';
import { shellWidthClass } from '@/lib/app-shell-layout';
import { cn } from '@/lib/utils';
import type { AppLayoutProps } from '@/types';

/** Top-navbar shell: full-width header, page content centred on the same width, footer at the bottom. */
export default function AppHeaderLayout({ children, breadcrumbs }: AppLayoutProps) {
    const { contentWidth } = useContentWidth();

    return (
        <AppShell>
            <div className="bg-background flex min-h-svh w-full flex-col">
                <AppHeader breadcrumbs={breadcrumbs} />
                <main className={cn(shellWidthClass(contentWidth), 'flex flex-1 flex-col')}>{children}</main>
                <AppFooter />
            </div>
        </AppShell>
    );
}
