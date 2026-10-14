import { router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { canDecide, fullName, KIND_ORDER, KINDS, STATUS, type FeedPage, type Filters, type Kind, type Perspective, type Person, type RequestItem, type Status, type View } from '../lib';
import { RequestCard } from './request-card';

type Props = {
    view: View;
    feed: FeedPage;
    filters: Filters;
    perspective: Perspective;
    selfId: number | null;
    statusCounts: Record<Status, number> | null;
    /** Pending count per kind, for the inbox chips. */
    kindCounts?: Partial<Record<Kind, number>>;
    /** Kinds offered in the kind filter. */
    kinds: Kind[];
    employees: Person[];
    onFilter: (changes: Partial<Filters>) => void;
    onDecide: (item: RequestItem, decision: 'approved' | 'declined') => void;
    onCancel: (item: RequestItem) => void;
    emptyHint?: React.ReactNode;
};

const chip = (active: boolean) =>
    cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
    );

const count = (active: boolean, n: number, attention = false) => (
    <span
        className={cn(
            'rounded-full px-1.5 text-[10px] leading-4 tabular-nums',
            active ? 'bg-primary-foreground/20' : attention && n > 0 ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
        )}
    >
        {n}
    </span>
);

export function RequestFeed({ view, feed, filters, perspective, selfId, statusCounts, kindCounts, kinds, employees, onFilter, onDecide, onCancel, emptyHint }: Props) {
    const inbox = view === 'inbox';
    const showEmployee = view !== 'mine';
    const total = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : 0;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {inbox ? (
                    <>
                        <button type="button" className={chip(filters.kind === '')} onClick={() => onFilter({ kind: '' })}>
                            All types {count(filters.kind === '', Object.values(kindCounts ?? {}).reduce((a, b) => a + (b ?? 0), 0), true)}
                        </button>
                        {kinds.map((k) => {
                            const n = kindCounts?.[k] ?? 0;
                            const Icon = KINDS[k].icon;
                            return (
                                <button key={k} type="button" className={chip(filters.kind === k)} onClick={() => onFilter({ kind: k })}>
                                    <Icon className="size-3" /> {KINDS[k].label} {count(filters.kind === k, n, true)}
                                </button>
                            );
                        })}
                    </>
                ) : (
                    <>
                        <button type="button" className={chip(filters.status === 'all')} onClick={() => onFilter({ status: 'all' })}>
                            All {count(filters.status === 'all', total)}
                        </button>
                        {(Object.keys(STATUS) as Status[]).map((s) => (
                            <button key={s} type="button" className={chip(filters.status === s)} onClick={() => onFilter({ status: s })}>
                                {STATUS[s].label} {count(filters.status === s, statusCounts?.[s] ?? 0, s === 'pending')}
                            </button>
                        ))}
                        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
                            <Select value={filters.kind || 'all'} onValueChange={(v) => onFilter({ kind: v === 'all' ? '' : (v as Kind) })}>
                                <SelectTrigger className="h-8 w-full text-xs sm:w-44">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All request types</SelectItem>
                                    {KIND_ORDER.filter((k) => kinds.includes(k)).map((k) => (
                                        <SelectItem key={k} value={k}>
                                            {KINDS[k].label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {view === 'all' && employees.length > 0 && (
                                <Select value={filters.employee_id ? String(filters.employee_id) : 'all'} onValueChange={(v) => onFilter({ employee_id: v === 'all' ? null : Number(v) })}>
                                    <SelectTrigger className="h-8 w-full text-xs sm:w-52">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Everyone</SelectItem>
                                        {employees.map((e) => (
                                            <SelectItem key={e.id} value={String(e.id)}>
                                                {fullName(e)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </>
                )}
            </div>

            {feed.data.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
                    <Inbox className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">{inbox ? 'Inbox zero — nothing is waiting on you.' : 'No requests here yet.'}</p>
                    {emptyHint && <div className="text-xs text-muted-foreground">{emptyHint}</div>}
                </div>
            ) : (
                <ul className="space-y-3">
                    {feed.data.map((item) => {
                        const own = selfId !== null && item.employee?.id === selfId;
                        const decider = canDecide(perspective, item.kind) && !own;
                        return (
                            <RequestCard
                                key={item.key}
                                item={item}
                                showEmployee={showEmployee}
                                canDecide={decider}
                                canCancel={own || (decider && item.status === 'approved' && item.kind === 'leave')}
                                emphasize={inbox || decider}
                                onDecide={onDecide}
                                onCancel={onCancel}
                            />
                        );
                    })}
                </ul>
            )}

            {feed.last_page > 1 && (
                <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-xs text-muted-foreground">
                        {feed.from}–{feed.to} of {feed.total}
                    </span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={!feed.prev_page_url}
                            onClick={() => feed.prev_page_url && router.get(feed.prev_page_url, {}, { preserveScroll: true, preserveState: true })}
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <span className="min-w-[64px] text-center tabular-nums">
                            {feed.current_page} / {feed.last_page}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={!feed.next_page_url}
                            onClick={() => feed.next_page_url && router.get(feed.next_page_url, {}, { preserveScroll: true, preserveState: true })}
                            aria-label="Next page"
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
