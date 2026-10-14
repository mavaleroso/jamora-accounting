import { cn } from '@/lib/utils';
import { initials, type UserRow } from '../lib';

export function UserAvatar({ user, className }: { user: Pick<UserRow, 'name' | 'avatarUrl'>; className?: string }) {
    return (
        <span className={cn('inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[11px] font-semibold text-muted-foreground', className)}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="size-full object-cover" /> : initials(user.name)}
        </span>
    );
}

export function Pill({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
    return (
        <span title={title} className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap', className)}>
            {children}
        </span>
    );
}

export const SYSTEM_PILL = 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300';
export const CUSTOM_PILL = 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300';
export const MUTED_PILL = 'border-border bg-muted text-muted-foreground';

/** Thin progress bar for "x of y permissions". */
export function Coverage({ value, total, className }: { value: number; total: number; className?: string }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div className={cn('h-1 w-full overflow-hidden rounded-full bg-muted', className)} role="presentation">
            <div className="h-full rounded-full bg-primary/70 transition-all" style={{ width: `${pct}%` }} />
        </div>
    );
}
