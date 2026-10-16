import AppLogoIcon from '@/components/app-logo-icon';
import { APP_BRAND } from '@/lib/entities';
import { cn } from '@/lib/utils';

export default function AppWordmark({ className }: { className?: string }) {
    return (
        <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
            <AppLogoIcon className="size-9 shrink-0" />
            <span className="grid min-w-0 leading-none">
                <span className="truncate text-lg leading-none font-extrabold tracking-tight text-sidebar-accent-foreground">
                    Jamora <span className="text-sidebar-primary">BMS</span>
                </span>
                <span className="mt-0.5 truncate text-[0.5rem] leading-none font-semibold tracking-[0.06em] text-sidebar-foreground/70 uppercase">
                    {APP_BRAND.tagline}
                </span>
            </span>
        </span>
    );
}
