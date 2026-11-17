import { CommandPalette } from '@/components/command-palette';
import { useAppLayout } from '@/hooks/use-app-layout';
import { useFlashToast } from '@/hooks/use-flash-toast';
import AppHeaderLayout from '@/layouts/app/app-header-layout';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import { useResumeOpticalSync } from '@/lib/optical-sync';
import { hasPermission } from '@/lib/permissions';
import type { AppLayoutProps, SharedData } from '@/types';
import { usePage } from '@inertiajs/react';

export default ({ children, breadcrumbs, ...props }: AppLayoutProps) => {
    useFlashToast();
    const { layout } = useAppLayout();
    const { auth } = usePage<SharedData>().props;
    // A check of the optical POS started before a reload keeps its progress toast.
    useResumeOpticalSync(hasPermission(auth, 'integration.optical.sync'));
    const Layout = layout === 'navbar' ? AppHeaderLayout : AppSidebarLayout;

    return (
        <Layout breadcrumbs={breadcrumbs} {...props}>
            {children}
            <CommandPalette />
        </Layout>
    );
};
