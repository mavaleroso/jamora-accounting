import { useAppLayout } from '@/hooks/use-app-layout';
import { useFlashToast } from '@/hooks/use-flash-toast';
import AppHeaderLayout from '@/layouts/app/app-header-layout';
import AppSidebarLayout from '@/layouts/app/app-sidebar-layout';
import type { AppLayoutProps } from '@/types';

export default ({ children, breadcrumbs, ...props }: AppLayoutProps) => {
    useFlashToast();
    const { layout } = useAppLayout();
    const Layout = layout === 'navbar' ? AppHeaderLayout : AppSidebarLayout;

    return (
        <Layout breadcrumbs={breadcrumbs} {...props}>
            {children}
        </Layout>
    );
};
