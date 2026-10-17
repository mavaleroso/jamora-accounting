import { ShieldCheck } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { avatarSrc, initials, isOnline, type UserRow } from '../lib';

export function UserAvatar({ user, src, className, showPresence = false }: { user: Partial<UserRow> | null; src?: string | null; className?: string; showPresence?: boolean }) {
    const [failed, setFailed] = React.useState(false);
    const url = src ?? avatarSrc(user);
    React.useEffect(() => setFailed(false), [url]);

    return (
        <span className={cn('relative inline-flex size-9 shrink-0', className)}>
            <span className="inline-flex size-full items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[0.7em] font-semibold text-primary">
                {url && !failed ? <img src={url} alt="" className="size-full object-cover" onError={() => setFailed(true)} /> : <span className="text-xs">{initials(user?.name)}</span>}
            </span>
            {showPresence && user && isOnline(user as UserRow) && (
                <span className="absolute right-0 bottom-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-card" title="Online now" aria-label="Online now" />
            )}
        </span>
    );
}

export function StatusBadge({ active, className }: { active: boolean; className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                active
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'border-border bg-muted text-muted-foreground',
                className,
            )}
        >
            <span className={cn('size-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
            {active ? 'Active' : 'Disabled'}
        </span>
    );
}

export function RoleBadge({ role, className }: { role: string | null | undefined; className?: string }) {
    if (!role) return <span className={cn('text-xs text-amber-700 italic dark:text-amber-400', className)}>No role</span>;
    return (
        <span className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px] font-semibold', className)}>
            <ShieldCheck className="size-3 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{role}</span>
        </span>
    );
}

/** Titled block used to break long forms and detail views into sections. */
export function Section({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn('space-y-3', className)}>
            <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
            {children}
        </section>
    );
}
