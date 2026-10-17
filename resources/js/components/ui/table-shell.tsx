import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Bordered card around a table; matches TableCard from @/components/data-table. */
export function TableShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'overflow-hidden rounded-xl border bg-card shadow-sm',
                className,
            )}
            {...props}
        />
    );
}
