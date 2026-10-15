import { cn } from '@/lib/utils';

/** Thin usage bar (e.g. how much of a deposit has been applied). */
export function Progress({ value, className, tone = 'primary' }: { value: number; className?: string; tone?: 'primary' | 'success' | 'warning' }) {
    const pct = Math.max(0, Math.min(100, value));
    const bar = tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-primary';

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <div
                className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div className={cn('h-full rounded-full transition-all', bar)} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">{Math.round(pct)}%</span>
        </div>
    );
}
