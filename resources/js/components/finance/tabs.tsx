import { cn } from '@/lib/utils';
import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
    return <TabsPrimitive.Root className={cn('flex flex-col gap-3', className)} {...props} />;
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
    return (
        <TabsPrimitive.List
            className={cn('bg-muted text-muted-foreground inline-flex h-9 w-fit items-center rounded-lg p-1', className)}
            {...props}
        />
    );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
    return (
        <TabsPrimitive.Trigger
            className={cn(
                'focus-visible:ring-ring/50 data-[state=active]:bg-background data-[state=active]:text-foreground inline-flex h-7 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 data-[state=active]:shadow-sm',
                className,
            )}
            {...props}
        />
    );
}

export const TabsContent = TabsPrimitive.Content;
