import { Head, router } from '@inertiajs/react';
import { CalendarRange, Download, FilePlus2, FileX2, History, Layers, LogIn, PencilLine, ShieldCheck, Terminal, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { FilterChips, ListTable, ServerPagination, TableCard, TableEmpty, TableSearch, TableToolbar } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { AuditTrail, BreadcrumbItem } from '@/types';
import { DetailDialog } from './components/detail-dialog';
import { ChangePreview, dayKey, dayLabel, EVENT, EventBadge, fmtDateTime, fmtRelative, fmtTime, UserAvatar } from './components/shared';

const URL_BASE = '/admin/audit-trails';
const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Administration', href: '/admin/users' },
    { title: 'Audit Trail', href: URL_BASE },
];

type Filters = {
    search: string;
    event: string | null;
    user_id: number | null;
    subject_type: string | null;
    subject_id: string | null;
    entity_id: number | null;
    batch_id: string | null;
    from: string | null;
    to: string | null;
};

type Props = {
    filters: Filters;
    items: AuditTrail[];
    pagination: { page: number; lastPage: number; perPage: number; total: number; from: number | null; to: number | null };
    summary: { today: number; usersToday: number; week: { created: number; updated: number; deleted: number; other: number; logins: number } };
    options: { users: { id: number; name: string }[]; types: { value: string; label: string }[]; entities: { id: number; code: string; name: string }[] };
    subject: string | null;
};

const ALL = 'all';

const EVENT_LABEL: Record<string, string> = { created: 'Created', updated: 'Updated', deleted: 'Deleted', restored: 'Restored', request: 'Other actions', login: 'Sign-ins', logout: 'Sign-outs' };

export default function AuditTrailPage({ filters, items, pagination, summary, options, subject }: Props) {
    const [selectedId, setSelectedId] = React.useState<number | null>(null);
    const [loading, setLoading] = React.useState(false);
    const rowRefs = React.useRef(new Map<string | number, HTMLElement>());

    const params = (next: Partial<Filters> & { page?: number; per_page?: number }) => {
        const merged: Record<string, unknown> = { ...filters, per_page: pagination.perPage, ...next };
        return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null && v !== '' && v !== undefined)) as Record<string, string | number>;
    };
    const apply = (next: Partial<Filters> & { page?: number; per_page?: number }) => {
        setSelectedId(null);
        router.get(URL_BASE, params({ page: 1, ...next }), { preserveState: true, preserveScroll: true, replace: true, onStart: () => setLoading(true), onFinish: () => setLoading(false) });
    };

    const selectedIndex = selectedId === null ? -1 : items.findIndex((i) => i.id === selectedId);
    const selected = selectedIndex >= 0 ? items[selectedIndex] : null;
    const select = (index: number) => {
        const item = items[index];
        if (!item) return;
        setSelectedId(item.id);
        rowRefs.current.get(item.id)?.scrollIntoView({ block: 'nearest' });
    };

    const exportUrl = `${URL_BASE}/export?${new URLSearchParams(Object.entries(params({})).filter(([k]) => k !== 'per_page' && k !== 'page').map(([k, v]) => [k, String(v)])).toString()}`;

    // Removable chips for every active filter
    const chips: { key: string; label: string; clear: Partial<Filters> }[] = [];
    if (filters.search) chips.push({ key: 'search', label: `“${filters.search}”`, clear: { search: '' } });
    if (filters.event) chips.push({ key: 'event', label: EVENT_LABEL[filters.event] ?? filters.event, clear: { event: null } });
    if (filters.user_id) chips.push({ key: 'user', label: options.users.find((u) => u.id === filters.user_id)?.name ?? `User #${filters.user_id}`, clear: { user_id: null } });
    if (filters.subject_type && !filters.subject_id) chips.push({ key: 'type', label: options.types.find((t) => t.value === filters.subject_type)?.label ?? filters.subject_type, clear: { subject_type: null } });
    if (filters.entity_id) chips.push({ key: 'entity', label: options.entities.find((e) => e.id === filters.entity_id)?.name ?? `Branch #${filters.entity_id}`, clear: { entity_id: null } });
    if (filters.from || filters.to) chips.push({ key: 'date', label: rangeLabel(filters.from, filters.to), clear: { from: null, to: null } });
    const anyFilter = chips.length > 0 || Boolean(filters.subject_id || filters.batch_id);

    const clearAll = () => {
        apply({ search: '', event: null, user_id: null, subject_type: null, subject_id: null, entity_id: null, batch_id: null, from: null, to: null });
    };
    const toggleEvent = (event: string) => apply({ event: filters.event === event ? null : event });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Audit Trail" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading title="Audit Trail" description="Every record created, changed or deleted — by whom, when, from where, and exactly what changed. Entries cannot be edited." />
                    <Button variant="outline" asChild>
                        <a href={exportUrl}>
                            <Download className="size-4" /> Export {anyFilter ? 'filtered' : 'all'} ({pagination.total.toLocaleString()})
                        </a>
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    <Stat label="Changes today" value={summary.today} hint={`${summary.usersToday} user${summary.usersToday === 1 ? '' : 's'} active`} icon={ShieldCheck} active={filters.from === today() && filters.to === today()} onClick={() => (filters.from === today() && filters.to === today() ? apply({ from: null, to: null }) : apply({ from: today(), to: today() }))} />
                    <Stat label="Created · 7 days" value={summary.week.created} icon={FilePlus2} tone="emerald" active={filters.event === 'created'} onClick={() => toggleEvent('created')} />
                    <Stat label="Updated · 7 days" value={summary.week.updated} icon={PencilLine} tone="sky" active={filters.event === 'updated'} onClick={() => toggleEvent('updated')} />
                    <Stat label="Deleted · 7 days" value={summary.week.deleted} icon={FileX2} tone="rose" emphasize={summary.week.deleted > 0} active={filters.event === 'deleted'} onClick={() => toggleEvent('deleted')} />
                    <Stat label="Other · 7 days" value={summary.week.other} icon={Zap} hint="Bulk updates, restores" active={filters.event === 'request'} onClick={() => toggleEvent('request')} />
                    <Stat label="Sign-ins · 7 days" value={summary.week.logins} icon={LogIn} tone="teal" active={filters.event === 'login'} onClick={() => toggleEvent('login')} />
                </div>

                {(filters.subject_id || filters.batch_id) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                        <span className="flex items-center gap-2">
                            {filters.batch_id ? <Layers className="size-4" /> : <History className="size-4" />}
                            <span>
                                {filters.batch_id ? (
                                    'Everything changed in one action'
                                ) : (
                                    <>
                                        History of <span className="font-semibold">{subject ?? `${filters.subject_type?.split('\\').pop()} #${filters.subject_id}`}</span>
                                    </>
                                )}
                                <span className="text-sky-700/70 dark:text-sky-400/70"> · {pagination.total.toLocaleString()} entr{pagination.total === 1 ? 'y' : 'ies'}, newest first</span>
                            </span>
                        </span>
                        <Button size="sm" variant="ghost" className="h-7 text-sky-800 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-900/40" onClick={() => apply({ subject_type: null, subject_id: null, batch_id: null })}>
                            <X className="size-3.5" /> Back to all
                        </Button>
                    </div>
                )}

                <TableCard>
                    <TableToolbar
                        loading={loading}
                        below={<FilterChips chips={chips.map((c) => ({ key: c.key, label: c.label, onRemove: () => apply(c.clear) }))} onClearAll={clearAll} />}
                    >
                        <TableSearch value={filters.search} onSearch={(search) => apply({ search })} placeholder="Search record, user, IP, route" />
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                            <FilterSelect value={filters.event ?? ALL} onChange={(v) => apply({ event: v === ALL ? null : v })} className="sm:w-36" all="Any action">
                                {(['created', 'updated', 'deleted', 'restored', 'request', 'login', 'logout'] as const).map((e) => (
                                    <SelectItem key={e} value={e}>
                                        <span className="flex items-center gap-2">
                                            <span className={cn('size-2 rounded-full', EVENT[e].dot)} />
                                            {EVENT_LABEL[e]}
                                        </span>
                                    </SelectItem>
                                ))}
                            </FilterSelect>
                            <FilterSelect value={filters.user_id ? String(filters.user_id) : ALL} onChange={(v) => apply({ user_id: v === ALL ? null : Number(v) })} className="sm:w-44" all="Any user">
                                {options.users.map((u) => (
                                    <SelectItem key={u.id} value={String(u.id)}>
                                        {u.name}
                                    </SelectItem>
                                ))}
                            </FilterSelect>
                            <FilterSelect value={filters.subject_type ?? ALL} onChange={(v) => apply({ subject_type: v === ALL ? null : v, subject_id: null })} className="sm:w-48" all="Any record type">
                                {options.types.map((t) => (
                                    <SelectItem key={t.value} value={t.value}>
                                        {t.label}
                                    </SelectItem>
                                ))}
                            </FilterSelect>
                            {options.entities.length > 1 && (
                                <FilterSelect value={filters.entity_id ? String(filters.entity_id) : ALL} onChange={(v) => apply({ entity_id: v === ALL ? null : Number(v) })} className="sm:w-44" all="Any branch">
                                    {options.entities.map((e) => (
                                        <SelectItem key={e.id} value={String(e.id)}>
                                            {e.name}
                                        </SelectItem>
                                    ))}
                                </FilterSelect>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <DatePresets from={filters.from} to={filters.to} onPick={(from, to) => apply({ from, to })} />
                            <Input type="date" value={filters.from ?? ''} max={filters.to ?? undefined} onChange={(e) => apply({ from: e.target.value || null })} className="h-9 min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none" aria-label="From date" />
                            <span className="text-xs text-muted-foreground">to</span>
                            <Input type="date" value={filters.to ?? ''} min={filters.from ?? undefined} onChange={(e) => apply({ to: e.target.value || null })} className="h-9 min-w-0 flex-1 sm:w-[9.5rem] sm:flex-none" aria-label="To date" />
                        </div>
                    </TableToolbar>

                    <ListTable
                        rows={items}
                        rowKey={(item) => item.id}
                        sequenceStart={pagination.from ?? 1}
                        loading={loading}
                        onRowClick={(_, index) => select(index)}
                        selectedKey={selectedId}
                        rowAccent={(item) => EVENT[item.event]?.dot}
                        rowClassName={() => 'align-top'}
                        rowRef={(key, el) => void (el ? rowRefs.current.set(key, el) : rowRefs.current.delete(key))}
                        groupBy={{
                            key: (item) => dayKey(item.created_at),
                            label: (key, rows) => (
                                <>
                                    {dayLabel(key)}
                                    <span className="ml-2 font-normal normal-case tabular-nums">· {rows.length}</span>
                                </>
                            ),
                        }}
                        columns={[
                            {
                                id: 'time',
                                header: 'Time',
                                headerClassName: 'w-28',
                                className: 'whitespace-nowrap',
                                cell: (item) => {
                                    const isToday = dayKey(item.created_at) === dayKey(new Date().toISOString());
                                    return (
                                        <>
                                            <span className="block tabular-nums" title={fmtDateTime(item.created_at)}>
                                                {isToday ? fmtRelative(item.created_at) : fmtTime(item.created_at)}
                                            </span>
                                            {isToday && <span className="block text-xs text-muted-foreground tabular-nums">{fmtTime(item.created_at)}</span>}
                                        </>
                                    );
                                },
                            },
                            {
                                id: 'user',
                                header: 'User',
                                cell: (item) => (
                                    <div className="flex items-center gap-2">
                                        <UserAvatar id={item.user?.id} name={item.user?.name} />
                                        <div className="min-w-0">
                                            <UserName item={item} onFilter={(id) => apply({ user_id: id })} />
                                            <span className="block truncate text-xs text-muted-foreground">{[item.entity?.code, item.request.ip].filter(Boolean).join(' · ') || '—'}</span>
                                        </div>
                                    </div>
                                ),
                            },
                            { id: 'action', header: 'Action', headerClassName: 'w-28', cell: (item) => <EventBadge event={item.event} /> },
                            {
                                id: 'record',
                                header: 'Record',
                                className: 'max-w-72',
                                cell: (item) => (
                                    <>
                                        <span className="block truncate font-medium" title={item.subject.label ?? item.description ?? undefined}>
                                            {item.subject.label ?? item.description ?? '—'}
                                        </span>
                                        <RecordMeta item={item} onType={(type) => apply({ subject_type: type, subject_id: null })} />
                                    </>
                                ),
                            },
                            {
                                id: 'changes',
                                header: 'Changes',
                                minScreen: 'lg',
                                className: 'max-w-md text-xs',
                                cell: (item) => <ChangePreview changes={item.changes} event={item.event} fallback={item.description} />,
                            },
                        ]}
                        mobileRow={(item) => (
                            <div className="flex gap-3">
                                <UserAvatar id={item.user?.id} name={item.user?.name} className="mt-0.5" />
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-medium">{item.subject.label ?? item.description ?? '—'}</span>
                                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{fmtTime(item.created_at)}</span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                        <EventBadge event={item.event} />
                                        <span>{item.user?.name ?? 'System'}</span>
                                        {item.subject.type_label && <span>· {item.subject.type_label}</span>}
                                    </div>
                                    {item.changes.length > 0 && item.event === 'updated' && (
                                        <div className="text-xs">
                                            <ChangePreview changes={item.changes} event={item.event} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        empty={
                            <TableEmpty
                                icon={ShieldCheck}
                                title={anyFilter ? 'No changes match these filters' : 'No changes recorded yet'}
                                description={anyFilter ? 'Try a wider date range or remove a filter.' : 'Creates, updates and deletes will appear here as people use the system.'}
                                action={
                                    anyFilter && (
                                        <Button size="sm" variant="outline" onClick={clearAll}>
                                            Clear filters
                                        </Button>
                                    )
                                }
                            />
                        }
                    />

                    <ServerPagination {...pagination} disabled={loading} onPage={(page) => apply({ page })} onPerPage={(per_page) => apply({ per_page })} />
                </TableCard>
            </div>

            <DetailDialog
                item={selected}
                position={selected ? { index: selectedIndex + 1, total: items.length } : null}
                onClose={() => setSelectedId(null)}
                onPrev={selectedIndex > 0 ? () => select(selectedIndex - 1) : null}
                onNext={selectedIndex >= 0 && selectedIndex < items.length - 1 ? () => select(selectedIndex + 1) : null}
                onHistory={(i) => apply({ subject_type: i.subject.type, subject_id: i.subject.id, batch_id: null, event: null, search: '' })}
                onBatch={(batch) => apply({ batch_id: batch, subject_type: null, subject_id: null, event: null, search: '' })}
                onUser={(id) => apply({ user_id: id, subject_type: null, subject_id: null, batch_id: null })}
            />
        </AppLayout>
    );
}

function UserName({ item, onFilter }: { item: AuditTrail; onFilter: (id: number) => void }) {
    if (!item.user) {
        return (
            <span className="flex items-center gap-1 font-medium">
                {item.source === 'console' && <Terminal className="size-3.5 text-muted-foreground" aria-label="Console" />}
                System
            </span>
        );
    }
    return (
        <button
            type="button"
            className="block max-w-full truncate text-left font-medium hover:text-primary hover:underline"
            title={`Show only ${item.user.name}`}
            onClick={(e) => (e.stopPropagation(), onFilter(item.user!.id))}
            onKeyDown={(e) => e.stopPropagation()}
        >
            {item.user.name}
        </button>
    );
}

function RecordMeta({ item, onType }: { item: AuditTrail; onType: (type: string) => void }) {
    if (!item.subject.type_label) return <span className="block truncate text-xs text-muted-foreground">{item.request.route ?? '—'}</span>;
    return (
        <span className="block truncate text-xs text-muted-foreground">
            <button type="button" className="hover:text-primary hover:underline" title={`Show only ${item.subject.type_label} records`} onClick={(e) => (e.stopPropagation(), onType(item.subject.type!))} onKeyDown={(e) => e.stopPropagation()}>
                {item.subject.type_label}
            </button>
            {item.subject.id && <span className="font-mono"> #{item.subject.id}</span>}
        </span>
    );
}

function isoDate(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function today() {
    return isoDate(new Date());
}
function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return isoDate(d);
}

function rangeLabel(from: string | null, to: string | null) {
    const fmt = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
    if (from) return `From ${fmt(from)}`;
    return `Until ${fmt(to!)}`;
}

function DatePresets({ from, to, onPick }: { from: string | null; to: string | null; onPick: (from: string | null, to: string | null) => void }) {
    const now = new Date();
    const presets: { label: string; from: string; to: string }[] = [
        { label: 'Today', from: today(), to: today() },
        { label: 'Yesterday', from: daysAgo(1), to: daysAgo(1) },
        { label: 'Last 7 days', from: daysAgo(6), to: today() },
        { label: 'Last 30 days', from: daysAgo(29), to: today() },
        { label: 'This month', from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today() },
        { label: 'Last month', from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) },
    ];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className={cn('size-9 shrink-0', (from || to) && 'border-primary/50 text-primary')} aria-label="Date presets" title="Date presets">
                    <CalendarRange className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
                {presets.map((p) => (
                    <DropdownMenuItem key={p.label} onSelect={() => onPick(p.from, p.to)} className={cn(p.from === from && p.to === to && 'font-semibold text-primary')}>
                        {p.label}
                    </DropdownMenuItem>
                ))}
                {(from || to) && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onPick(null, null)}>Any time</DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

const STAT_TONE = {
    emerald: { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', active: 'border-emerald-500 ring-emerald-500/30', value: 'text-emerald-600 dark:text-emerald-400' },
    sky: { icon: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', active: 'border-sky-500 ring-sky-500/30', value: 'text-sky-600 dark:text-sky-400' },
    rose: { icon: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', active: 'border-rose-500 ring-rose-500/30', value: 'text-rose-600 dark:text-rose-400' },
    teal: { icon: 'bg-teal-500/10 text-teal-600 dark:text-teal-400', active: 'border-teal-500 ring-teal-500/30', value: 'text-teal-600 dark:text-teal-400' },
    default: { icon: 'bg-primary/10 text-primary', active: 'border-primary ring-primary/30', value: '' },
} as const;

function Stat({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'default',
    emphasize,
    active,
    onClick,
}: {
    label: string;
    value: number;
    hint?: string;
    icon: LucideIcon;
    tone?: keyof typeof STAT_TONE;
    emphasize?: boolean;
    active?: boolean;
    onClick: () => void;
}) {
    const t = STAT_TONE[tone];
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'rounded-xl border bg-card p-3.5 text-left shadow-sm transition-all hover:border-foreground/20 hover:shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                active && cn('ring-2', t.active),
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
                <span className={cn('rounded-md p-1', t.icon)}>
                    <Icon className="size-3.5" />
                </span>
            </div>
            <p className={cn('mt-1 font-mono text-2xl font-semibold tabular-nums', emphasize && t.value)}>{value.toLocaleString()}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{active ? 'Filtering · click to clear' : (hint ?? 'Click to filter')}</p>
        </button>
    );
}

function FilterSelect({ value, onChange, all, className, children }: { value: string; onChange: (v: string) => void; all: string; className?: string; children: React.ReactNode }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={cn('h-9 w-full', value !== ALL && 'border-primary/50', className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{all}</SelectItem>
                {children}
            </SelectContent>
        </Select>
    );
}
