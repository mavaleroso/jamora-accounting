import type { ReactNode } from 'react';

/** Page title row used by finance screens: title + one-line purpose on the left, primary actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
    return (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {description && <p className="text-muted-foreground text-sm">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function PageBody({ children }: { children: ReactNode }) {
    return <div className="flex h-full flex-1 flex-col gap-5 p-4 md:p-6">{children}</div>;
}
