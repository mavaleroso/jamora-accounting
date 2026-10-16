import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type * as React from 'react';
import {
    canDecide,
    KINDS,
    type FeedPage,
    type Filters,
    type Kind,
    type Person,
    type Perspective,
    type RequestItem,
    type Status,
    type View,
} from '../lib';
import { RequestCard } from './request-card';
import { RequestTable } from './request-table';

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

const count = (active: boolean, n: number) => (
    <span
        className={cn(
            'rounded-full px-1.5 text-[10px] leading-4 tabular-nums',
            active ? 'bg-primary-foreground/20' : n > 0 ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
        )}
    >
        {n}
    </span>
);

/** History views are a datatable; the approvals inbox stays a queue of cards to decide. */
export function RequestFeed(props: Props) {
    if (props.view !== 'inbox') return <RequestTable {...props} />;
    return <InboxFeed {...props} />;
}

/** Approvals queue: oldest first, each request as a card with its decision buttons. */
function InboxFeed({ feed, filters, perspective, selfId, kindCounts, kinds, onFilter, onDecide, onCancel, emptyHint }: Props) {
    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={chip(filters.kind === '')} onClick={() => onFilter({ kind: '' })}>
                    All types{' '}
                    {count(
                        filters.kind === '',
                        Object.values(kindCounts ?? {}).reduce((a, b) => a + (b ?? 0), 0),
                    )}
                </button>
                {kinds.map((k) => {
                    const Icon = KINDS[k].icon;
                    return (
                        <button key={k} type="button" className={chip(filters.kind === k)} onClick={() => onFilter({ kind: k })}>
                            <Icon className="size-3" /> {KINDS[k].label} {count(filters.kind === k, kindCounts?.[k] ?? 0)}
                        </button>
                    );
                })}
            </div>

            {feed.data.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
                    <Inbox className="text-muted-foreground/50 size-8" />
                    <p className="text-sm font-medium">Inbox zero — nothing is waiting on you.</p>
                    {emptyHint && <div className="text-muted-foreground text-xs">{emptyHint}</div>}
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
                                showEmployee
                                canDecide={decider}
                                canCancel={own || (decider && item.status === 'approved' && item.kind === 'leave')}
                                emphasize
                                onDecide={onDecide}
                                onCancel={onCancel}
                            />
                        );
                    })}
                </ul>
            )}

            {feed.last_page > 1 && (
                <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground text-xs">
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
