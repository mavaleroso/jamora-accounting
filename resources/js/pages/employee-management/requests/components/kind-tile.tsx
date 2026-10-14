import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KINDS, TONE, type Kind } from '../lib';

/** One entry of the request catalogue. `compact` drops the description for dense rows. */
export function KindTile({ kind, onClick, compact = false, count }: { kind: Kind; onClick: () => void; compact?: boolean; count?: number }) {
    const meta = KINDS[kind];
    return (
        <button
            type="button"
            onClick={onClick}
            className="group flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
            <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-md border', TONE[meta.tone])}>
                <meta.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                    {meta.label}
                    {!!count && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums">{count}</span>}
                </span>
                {!compact && <span className="mt-0.5 block text-xs text-muted-foreground">{meta.description}</span>}
                {!compact && <span className="mt-1 block text-[11px] text-muted-foreground/80">{meta.when}</span>}
            </span>
            <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
        </button>
    );
}
