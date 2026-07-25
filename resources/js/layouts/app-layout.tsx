import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import type { AppLayoutProps } from '@/types';
import { useFlashToast } from '@/hooks/use-flash-toast';

export default ({ children, breadcrumbs, ...props }: AppLayoutProps) => {
    useFlashToast();
    return (
        <AppLayoutTemplate breadcrumbs={breadcrumbs} {...props}>
            {children}
        </AppLayoutTemplate>
    );
};
