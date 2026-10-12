import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Optical-style bordered table container */
export function TableShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'overflow-hidden rounded-xl border-2 border-border bg-card shadow-sm',
                className,
            )}
            {...props}
        />
    );
}
