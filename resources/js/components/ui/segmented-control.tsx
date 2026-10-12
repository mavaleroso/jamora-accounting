import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const segmentedControlListClass =
    'inline-flex flex-wrap gap-1 rounded-lg border-2 border-border bg-muted p-1.5 shadow-sm';

export function segmentedControlItemClass(active: boolean, className?: string) {
    return cn(
        'inline-flex cursor-pointer items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-muted-foreground hover:bg-background hover:text-foreground',
        className,
    );
}

export function segmentedControlBadgeClass(active: boolean) {
    return cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        active
            ? 'bg-primary-foreground/20 text-primary-foreground'
            : 'bg-background text-muted-foreground ring-1 ring-border',
    );
}

type SegmentedControlProps = {
    label?: string;
    children: ReactNode;
    className?: string;
    'aria-label'?: string;
};

export function SegmentedControl({
    label,
    children,
    className,
    'aria-label': ariaLabel,
}: SegmentedControlProps) {
    return (
        <div className="space-y-1.5">
            {label ? (
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                </p>
            ) : null}
            <div
                role="tablist"
                aria-label={ariaLabel ?? label}
                className={cn(segmentedControlListClass, className)}
            >
                {children}
            </div>
        </div>
    );
}

type SegmentedControlItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
};

export function SegmentedControlItem({
    active = false,
    className,
    type = 'button',
    ...props
}: SegmentedControlItemProps) {
    return (
        <button
            type={type}
            role="tab"
            aria-selected={active}
            className={segmentedControlItemClass(active, className)}
            {...props}
        />
    );
}
