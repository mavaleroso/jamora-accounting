import { DataTable } from '@/components/data-table';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Eye, MoreHorizontal, Paperclip, Undo2, X } from 'lucide-react';
import * as React from 'react';
import {
    canDecide,
    fullName,
    KIND_ORDER,
    KINDS,
    STATUS,
    timeAgo,
    TONE,
    type FeedPage,
    type Filters,
    type Kind,
    type Person,
    type Perspective,
    type RequestItem,
    type Status,
} from '../lib';
import { fmtRange, RequestCard, What } from './request-card';

export type FeedChange = Partial<Filters> & { page?: number };

type Props = {
    view: 'inbox' | 'all';
    feed: FeedPage;
    filters: Filters;
    perspective: Perspective;
    selfId: number | null;
    statusCounts: Record<Status, number> | null;
    /** Pending count per kind, for the approvals type chips. */
    kindCounts?: Partial<Record<Kind, number>>;
    /** Kinds offered in the type filter. */
    kinds: Kind[];
    employees: Person[];
    onFilter: (changes: FeedChange) => void;
    onDecide: (item: RequestItem, decision: 'approved' | 'declined') => void;
    onCancel: (item: RequestItem) => void;
};

const COLUMN_LABELS: Record<string, string> = {
    employee: 'Employee',
    request: 'Request',
    date: 'Date',
    details: 'Details',
    reason: 'Reason',
    filed: 'Filed',
    status: 'Status',
};

const chip = (active: boolean) =>
    cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground',
    );

const count = (active: boolean, n: number, alert = true) => (
    <span
        className={cn(
            'rounded-full px-1.5 text-[10px] leading-4 tabular-nums',
            active ? 'bg-primary-foreground/20' : alert && n > 0 ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
        )}
    >
        {n}
    </span>
);

/**
 * Approvals queue and team request history as a datatable. Search, filters, sorting and paging run on
 * the server; a row opens its full details.
 */
export function RequestDataTable({
    view,
    feed,
    filters,
    perspective,
    selfId,
    statusCounts,
    kindCounts,
    kinds,
    employees,
    onFilter,
    onDecide,
    onCancel,
}: Props) {
    const [open, setOpen] = React.useState<RequestItem | null>(null);
    const inbox = view === 'inbox';

    const rights = (item: RequestItem) => {
        const own = selfId !== null && item.employee?.id === selfId;
        const decider = canDecide(perspective, item.kind) && !own;
        return { decider, canCancel: (own || (decider && item.status === 'approved' && item.kind === 'leave')) && item.cancellable };
    };

    const columns: ColumnDef<RequestItem>[] = [
        {
            id: 'actions',
            cell: ({ row: { original: item } }) => {
                const { decider, canCancel } = rights(item);
                const pending = item.status === 'pending';
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label="Request actions">
                                <MoreHorizontal className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => setOpen(item)}>
                                <Eye className="size-4" /> View details
                            </DropdownMenuItem>
                            {decider && pending && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => onDecide(item, 'approved')}>
                                        <Check className="size-4" /> Approve
                                    </DropdownMenuItem>
                                    <DropdownMenuItem variant="destructive" onClick={() => onDecide(item, 'declined')}>
                                        <X className="size-4" /> Decline
                                    </DropdownMenuItem>
                                </>
                            )}
                            {canCancel && (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onClick={() => onCancel(item)}>
                                        <Undo2 className="size-4" /> {pending ? 'Withdraw request' : 'Cancel leave'}
                                    </DropdownMenuItem>
                                </>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
        },
        {
            id: 'employee',
            header: 'Employee',
            enableHiding: false,
            cell: ({ row: { original: item } }) => (
                <div className="flex min-w-[180px] items-center gap-2.5">
                    <PersonAvatar src={item.employee?.avatar_url} seed={item.employee?.employee_code ?? item.key} className="size-8" />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{fullName(item.employee)}</div>
                        <div className="text-muted-foreground truncate text-[11px]">{item.employee?.position}</div>
                    </div>
                </div>
            ),
        },
        {
            id: 'request',
            header: 'Request',
            cell: ({ row: { original: item } }) => {
                const meta = KINDS[item.kind];
                return (
                    <div className="flex min-w-[160px] items-center gap-2.5">
                        <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-md border', TONE[meta.tone])}>
                            <meta.icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{item.title}</div>
                            {item.title !== meta.label && <div className="text-muted-foreground text-[11px]">{meta.label}</div>}
                        </div>
                    </div>
                );
            },
        },
        {
            id: 'date',
            header: () => <SortHeader label="Date" column="date" filters={filters} inbox={inbox} onFilter={onFilter} />,
            cell: ({ row: { original: item } }) => <span className="text-sm whitespace-nowrap">{fmtRange(item.date_from, item.date_to)}</span>,
        },
        {
            id: 'details',
            header: 'Details',
            cell: ({ row: { original: item } }) => (
                <div className="min-w-[160px] text-sm whitespace-normal">
                    <What item={item} />
                </div>
            ),
        },
        {
            id: 'reason',
            header: 'Reason',
            cell: ({ row: { original: item } }) => (
                <div className="max-w-[280px] min-w-[180px] whitespace-normal">
                    <p className="text-muted-foreground line-clamp-2 text-sm" title={item.reason ?? undefined}>
                        {item.reason || '—'}
                    </p>
                    {item.details.attachment_url && (
                        <span className="text-primary mt-0.5 inline-flex items-center gap-1 text-[11px]">
                            <Paperclip className="size-3" /> Attachment
                        </span>
                    )}
                </div>
            ),
        },
        {
            id: 'filed',
            header: () => <SortHeader label="Filed" column="filed" filters={filters} inbox={inbox} onFilter={onFilter} />,
            cell: ({ row: { original: item } }) => (
                <div className="text-muted-foreground text-xs whitespace-nowrap">
                    {timeAgo(item.filed_at)}
                    {item.filed_by && <div className="text-[11px]">by {item.filed_by}</div>}
                </div>
            ),
        },
        {
            id: 'status',
            header: inbox ? 'Decision' : 'Status',
            cell: ({ row: { original: item } }) => {
                const st = STATUS[item.status];
                const { decider } = rights(item);
                if (decider && item.status === 'pending') {
                    // Decide straight from the row; the click does not also open the details.
                    return (
                        <div className="flex items-center gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 border-emerald-300 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                                onClick={() => onDecide(item, 'approved')}
                            >
                                <Check className="size-3.5" /> Approve
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive h-7 gap-1 px-2"
                                onClick={() => onDecide(item, 'declined')}
                            >
                                <X className="size-3.5" /> Decline
                            </Button>
                        </div>
                    );
                }
                return (
                    <div className="whitespace-nowrap">
                        <Badge variant="outline" className={TONE[st.tone]}>
                            {st.label}
                        </Badge>
                        {item.status !== 'pending' && item.decided_by && (
                            <div className="text-muted-foreground mt-1 text-[11px]">by {item.decided_by}</div>
                        )}
                    </div>
                );
            },
        },
    ];
    // Order comes from the server; Date and Filed sort through their own header buttons.
    columns.forEach((c) => (c.enableSorting = false));

    const total = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : 0;
    const toolbarFilters = inbox ? (
        <div className="flex flex-wrap items-center gap-1.5">
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
    ) : (
        <>
            <div className="bg-muted inline-flex flex-wrap rounded-md border p-0.5">
                {(['all', ...Object.keys(STATUS)] as (Status | 'all')[]).map((s) => {
                    const active = filters.status === s;
                    const n = s === 'all' ? total : (statusCounts?.[s] ?? 0);
                    return (
                        <button
                            key={s}
                            type="button"
                            onClick={() => onFilter({ status: s })}
                            className={cn(
                                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {s === 'all' ? 'All' : STATUS[s].label}
                            {count(false, n, s === 'pending')}
                        </button>
                    );
                })}
            </div>
            <Select value={filters.kind || 'all'} onValueChange={(v) => onFilter({ kind: v === 'all' ? '' : (v as Kind) })}>
                <SelectTrigger className="h-9 w-full lg:w-44" aria-label="Request type">
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
            {employees.length > 0 && (
                <Select
                    value={filters.employee_id ? String(filters.employee_id) : 'all'}
                    onValueChange={(v) => onFilter({ employee_id: v === 'all' ? null : Number(v) })}
                >
                    <SelectTrigger className="h-9 w-full lg:w-52" aria-label="Employee">
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
        </>
    );

    return (
        <>
            <DataTable
                columns={columns}
                data={feed.data}
                filterableColumns={{ employee: 'Employee' }}
                filterPlaceholder="Search reason, type or employee"
                columnLabels={COLUMN_LABELS}
                enableRowSelection={false}
                toolbarFilterExtra={toolbarFilters}
                onRowClick={setOpen}
                getRowClassName={(item) =>
                    cn('align-top', !inbox && rights(item).decider && item.status === 'pending' && 'bg-amber-50/40 dark:bg-amber-950/10')
                }
                serverSidePagination={{
                    totalRowCount: feed.total,
                    pageIndex: Math.max(0, feed.current_page - 1),
                    pageSize: feed.per_page,
                    search: filters.q,
                    onPaginationChange: ({ pageIndex, pageSize, search }) =>
                        onFilter({ page: pageIndex + 1, per_page: pageSize, q: search ?? filters.q }),
                }}
                emptyTitle={
                    filters.q ? `No requests match “${filters.q}”.` : inbox ? 'Inbox zero — nothing is waiting on you.' : 'No requests here yet.'
                }
            />

            <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Request details</DialogTitle>
                    </DialogHeader>
                    {open && (
                        <ul>
                            <RequestCard
                                item={open}
                                showEmployee
                                canDecide={rights(open).decider}
                                canCancel={rights(open).canCancel}
                                onDecide={(item, d) => {
                                    setOpen(null);
                                    onDecide(item, d);
                                }}
                                onCancel={(item) => {
                                    setOpen(null);
                                    onCancel(item);
                                }}
                            />
                        </ul>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

/** Sortable header: newest first, then oldest first, then back to the default order (approvals: oldest first). */
function SortHeader({
    label,
    column,
    filters,
    inbox,
    onFilter,
}: {
    label: string;
    column: 'date' | 'filed';
    filters: Filters;
    inbox: boolean;
    onFilter: (changes: FeedChange) => void;
}) {
    const active = filters.sort === column;
    const Icon = !active ? ArrowUpDown : filters.dir === 'asc' ? ArrowUp : ArrowDown;
    const next = (): Partial<Filters> =>
        !active ? { sort: column, dir: 'desc' } : filters.dir === 'desc' ? { sort: column, dir: 'asc' } : { sort: '', dir: 'desc' };

    return (
        <button
            type="button"
            onClick={() => onFilter(next())}
            aria-label={`Sort by ${label.toLowerCase()}${!active && inbox ? ' (default: oldest filed first)' : ''}`}
            className={cn('hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5', active && 'text-foreground')}
        >
            {label}
            <Icon className={cn('size-3.5', !active && 'opacity-50')} />
        </button>
    );
}
