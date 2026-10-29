import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Eye, MoreHorizontal, Paperclip, Search, Undo2, X } from 'lucide-react';
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
    type View,
} from '../lib';
import { fmtRange, RequestCard, What } from './request-card';

type Props = {
    view: View;
    feed: FeedPage;
    filters: Filters;
    perspective: Perspective;
    selfId: number | null;
    statusCounts: Record<Status, number> | null;
    /** Kinds offered in the type filter. */
    kinds: Kind[];
    employees: Person[];
    onFilter: (changes: Partial<Filters>) => void;
    onDecide: (item: RequestItem, decision: 'approved' | 'declined') => void;
    onCancel: (item: RequestItem) => void;
    emptyHint?: React.ReactNode;
};

const PER_PAGE = [10, 15, 25, 50];

/**
 * Request history as a datatable: search, status and type filters, sortable dates, row actions and
 * a details view. Filtering, sorting and paging run on the server.
 */
export function RequestTable({
    view,
    feed,
    filters,
    perspective,
    selfId,
    statusCounts,
    kinds,
    employees,
    onFilter,
    onDecide,
    onCancel,
    emptyHint,
}: Props) {
    const showEmployee = view !== 'mine';
    const total = statusCounts ? Object.values(statusCounts).reduce((a, b) => a + b, 0) : 0;
    const [open, setOpen] = React.useState<RequestItem | null>(null);
    const columns = 7 + (showEmployee ? 1 : 0);

    const rights = (item: RequestItem) => {
        const own = selfId !== null && item.employee?.id === selfId;
        const decider = canDecide(perspective, item.kind) && !own;
        return { decider, canCancel: (own || (decider && item.status === 'approved' && item.kind === 'leave')) && item.cancellable };
    };

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
                <SearchBox
                    value={filters.q}
                    onSearch={(q) => onFilter({ q })}
                    placeholder={showEmployee ? 'Search reason, type or employee' : 'Search reason or type'}
                />
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
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 text-[10px] leading-4 tabular-nums',
                                        s === 'pending' && n > 0
                                            ? 'bg-amber-500 text-white'
                                            : 'bg-background text-muted-foreground ring-border ring-1',
                                    )}
                                >
                                    {n}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex w-full flex-wrap gap-2 lg:ml-auto lg:w-auto">
                    <Select value={filters.kind || 'all'} onValueChange={(v) => onFilter({ kind: v === 'all' ? '' : (v as Kind) })}>
                        <SelectTrigger className="h-8 w-full text-xs sm:w-44" aria-label="Request type">
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
                        <Select
                            value={filters.employee_id ? String(filters.employee_id) : 'all'}
                            onValueChange={(v) => onFilter({ employee_id: v === 'all' ? null : Number(v) })}
                        >
                            <SelectTrigger className="h-8 w-full text-xs sm:w-52" aria-label="Employee">
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
            </div>

            <TableShell>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                {showEmployee && <TableHead className="min-w-[200px]">Employee</TableHead>}
                                <TableHead className="min-w-[180px]">Request</TableHead>
                                <SortHead label="Date" column="date" filters={filters} onFilter={onFilter} />
                                <TableHead className="min-w-[180px]">Details</TableHead>
                                <TableHead className="min-w-[200px]">Reason</TableHead>
                                <SortHead label="Filed" column="filed" filters={filters} onFilter={onFilter} className="hidden lg:table-cell" />
                                <TableHead>Status</TableHead>
                                <TableHead className="w-10">
                                    <span className="sr-only">Actions</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {feed.data.length === 0 ? (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={columns} className="text-muted-foreground h-40 text-center text-sm whitespace-normal">
                                        <p className="text-foreground font-medium">
                                            {filters.q ? `No requests match “${filters.q}”.` : 'No requests here yet.'}
                                        </p>
                                        {!filters.q && emptyHint && <div className="mt-1 text-xs">{emptyHint}</div>}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                feed.data.map((item) => {
                                    const meta = KINDS[item.kind];
                                    const st = STATUS[item.status];
                                    const pending = item.status === 'pending';
                                    const { decider, canCancel } = rights(item);
                                    return (
                                        <TableRow
                                            key={item.key}
                                            className={cn('cursor-pointer align-top', decider && pending && 'bg-amber-50/40 dark:bg-amber-950/10')}
                                            onClick={() => setOpen(item)}
                                        >
                                            {showEmployee && (
                                                <TableCell>
                                                    <div className="flex items-center gap-2.5">
                                                        <PersonAvatar
                                                            src={item.employee?.avatar_url}
                                                            seed={item.employee?.employee_code ?? item.key}
                                                            className="size-8"
                                                        />
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-medium">{fullName(item.employee)}</div>
                                                            <div className="text-muted-foreground truncate text-[11px]">
                                                                {item.employee?.position}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                <div className="flex items-center gap-2.5">
                                                    <span
                                                        className={cn(
                                                            'inline-flex size-8 shrink-0 items-center justify-center rounded-md border',
                                                            TONE[meta.tone],
                                                        )}
                                                    >
                                                        <meta.icon className="size-4" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-medium">{item.title}</div>
                                                        {item.title !== meta.label && (
                                                            <div className="text-muted-foreground text-[11px]">{meta.label}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm whitespace-nowrap">{fmtRange(item.date_from, item.date_to)}</TableCell>
                                            <TableCell className="text-sm whitespace-normal">
                                                <What item={item} />
                                            </TableCell>
                                            <TableCell className="max-w-[280px] whitespace-normal">
                                                <p className="text-muted-foreground line-clamp-2 text-sm" title={item.reason ?? undefined}>
                                                    {item.reason || '—'}
                                                </p>
                                                {item.details.attachment_url && (
                                                    <span className="text-primary mt-0.5 inline-flex items-center gap-1 text-[11px]">
                                                        <Paperclip className="size-3" /> Attachment
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground hidden text-xs whitespace-nowrap lg:table-cell">
                                                {timeAgo(item.filed_at)}
                                                {item.filed_by && <div className="text-[11px]">by {item.filed_by}</div>}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <Badge variant="outline" className={TONE[st.tone]}>
                                                    {st.label}
                                                </Badge>
                                                {!pending && item.decided_by && (
                                                    <div className="text-muted-foreground mt-1 text-[11px]">by {item.decided_by}</div>
                                                )}
                                            </TableCell>
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="size-8" aria-label="Request actions">
                                                            <MoreHorizontal className="size-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
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
                                                                    <Undo2 className="size-4" />{' '}
                                                                    {pending
                                                                        ? 'Withdraw request'
                                                                        : item.status === 'noted'
                                                                          ? 'Withdraw notice'
                                                                          : 'Cancel leave'}
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
                <Footer feed={feed} perPage={filters.per_page} onPerPage={(per_page) => onFilter({ per_page })} />
            </TableShell>

            <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Request details</DialogTitle>
                    </DialogHeader>
                    {open && (
                        <ul>
                            <RequestCard
                                item={open}
                                showEmployee={showEmployee}
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
        </div>
    );
}

/** Search that waits for a pause in typing before asking the server. */
function SearchBox({ value, onSearch, placeholder }: { value: string; onSearch: (q: string) => void; placeholder: string }) {
    const [text, setText] = React.useState(value);
    const latest = React.useRef(onSearch);
    latest.current = onSearch;

    React.useEffect(() => setText(value), [value]);
    React.useEffect(() => {
        if (text.trim() === value) return;
        const t = setTimeout(() => latest.current(text.trim()), 350);
        return () => clearTimeout(t);
    }, [text, value]);

    return (
        <div className="relative w-full sm:w-64">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                className="h-8 pl-8 text-xs"
                aria-label="Search requests"
            />
        </div>
    );
}

/** Sortable header: newest first, then oldest first, then back to the default order. */
function SortHead({
    label,
    column,
    filters,
    onFilter,
    className,
}: {
    label: string;
    column: 'date' | 'filed';
    filters: Filters;
    onFilter: (changes: Partial<Filters>) => void;
    className?: string;
}) {
    const active = filters.sort === column;
    const Icon = !active ? ArrowUpDown : filters.dir === 'asc' ? ArrowUp : ArrowDown;
    const next = (): Partial<Filters> =>
        !active ? { sort: column, dir: 'desc' } : filters.dir === 'desc' ? { sort: column, dir: 'asc' } : { sort: '', dir: 'desc' };

    return (
        <TableHead className={className} aria-sort={active ? (filters.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button
                type="button"
                onClick={() => onFilter(next())}
                className={cn('hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5', active && 'text-foreground')}
            >
                {label}
                <Icon className={cn('size-3.5', !active && 'opacity-50')} />
            </button>
        </TableHead>
    );
}

function Footer({ feed, perPage, onPerPage }: { feed: FeedPage; perPage: number; onPerPage: (n: number) => void }) {
    const go = (url: string | null) => url && router.get(url, {}, { preserveScroll: true, preserveState: true });

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{feed.total === 0 ? 'No requests' : `Showing ${feed.from}–${feed.to} of ${feed.total}`}</span>
            <div className="flex items-center gap-3">
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    Rows
                    <Select value={String(perPage)} onValueChange={(v) => onPerPage(Number(v))}>
                        <SelectTrigger className="h-8 w-[70px] text-xs" aria-label="Rows per page">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PER_PAGE.map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                    {n}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={!feed.prev_page_url}
                        onClick={() => go(feed.prev_page_url)}
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span className="min-w-[64px] text-center tabular-nums">
                        {feed.current_page} / {Math.max(1, feed.last_page)}
                    </span>
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={!feed.next_page_url}
                        onClick={() => go(feed.next_page_url)}
                        aria-label="Next page"
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
