import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Link } from '@inertiajs/react';
import type { ComponentType, ReactNode } from 'react';

export type StatTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

const toneAccent: Record<StatTone, string> = {
    default: 'bg-primary/10 text-primary',
    info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    danger: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const toneValue: Record<StatTone, string> = {
    default: '',
    info: '',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
};

const toneBar: Record<StatTone, string> = {
    default: 'before:bg-primary',
    info: 'before:bg-sky-500',
    success: 'before:bg-emerald-500',
    warning: 'before:bg-amber-500',
    danger: 'before:bg-red-500',
};

type StatCardProps = {
    title: string;
    value: ReactNode;
    description?: ReactNode;
    icon?: ComponentType<{ className?: string }>;
    href?: string;
    tone?: StatTone;
    /** Colour the value itself (e.g. a non-zero difference), not just the icon. */
    emphasize?: boolean;
    className?: string;
};

/** Summary figure used across finance pages: label, big tabular value, optional hint and drill-down link. */
export function StatCard({ title, value, description, icon: Icon, href, tone = 'default', emphasize = false, className }: StatCardProps) {
    const content = (
        <Card
            className={cn(
                'border-border/60 relative h-full gap-2 overflow-hidden py-4 shadow-xs transition-colors',
                "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
                toneBar[tone],
                href && 'hover:border-primary/40 hover:shadow-sm',
                className,
            )}
        >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 px-5">
                <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</CardTitle>
                {Icon && (
                    <div className={cn('rounded-md p-1.5', toneAccent[tone])}>
                        <Icon className="size-4" />
                    </div>
                )}
            </CardHeader>
            <CardContent className="px-5">
                <div className={cn('font-mono text-2xl font-semibold tabular-nums', emphasize && toneValue[tone])}>{value}</div>
                {description ? <p className="text-muted-foreground mt-1 text-xs">{description}</p> : null}
            </CardContent>
        </Card>
    );

    return href ? (
        <Link href={href} prefetch className="block">
            {content}
        </Link>
    ) : (
        content
    );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>;
}
