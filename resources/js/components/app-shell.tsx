import { usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { SharedData } from '@/types';

type Props = {
    children: ReactNode;
    variant?: 'header' | 'sidebar';
};

/**
 * The sidebar remounts on every visit, so its starting state must be current. The server's `sidebarOpen`
 * prop can be stale when the page came from Inertia's prefetch cache (fetched while the sidebar was in its
 * other state), so in the browser the cookie the sidebar writes is the source of truth.
 */
function readSidebarCookie(): boolean | undefined {
    if (typeof document === 'undefined') return undefined;
    const match = document.cookie.match(/(?:^|;\s*)sidebar_state=(true|false)/);
    return match ? match[1] === 'true' : undefined;
}

export function AppShell({ children, variant = 'header' }: Props) {
    const serverOpen = usePage<SharedData>().props.sidebarOpen;
    const isOpen = readSidebarCookie() ?? serverOpen;

    if (variant === 'header') {
        return (
            <div className="flex min-h-screen w-full flex-col">{children}</div>
        );
    }

    return <SidebarProvider defaultOpen={isOpen}>{children}</SidebarProvider>;
}
