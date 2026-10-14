import { Head, router } from '@inertiajs/react';
import { ChevronLeft, ChevronRight, Download, History, Layers, Loader2, Search, ShieldCheck, Terminal, X } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { AuditTrail, BreadcrumbItem } from '@/types';
import { DetailSheet } from './components/detail-sheet';
import { EventBadge, summarize } from './components/shared';

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
    summary: { today: number; usersToday: number; week: { created: number; updated: number; deleted: number; other: number } };
    options: { users: { id: number; name: string }[]; types: { value: string; label: string }[]; entities: { id: number; code: string; name: string }[] };
    subject: string | null;
};

const ALL = 'all';

export default function AuditTrailPage({ filters, items, pagination, summary, options, subject }: Props) {
    const [search, setSearch] = React.useState(filters.search);
    const [selected, setSelected] = React.useState<AuditTrail | null>(null);
    const [loading, setLoading] = React.useState(false);

    const params = (next: Partial<Filters> & { page?: number; per_page?: number }) => {
        const merged: Record<string, unknown> = { ...filters, per_page: pagination.perPage, ...next };
        return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null && v !== '' && v !== undefined)) as Record<string, string | number>;
    };
    const apply = (next: Partial<Filters> & { page?: number; per_page?: number }) => {
        setSelected(null);
        router.get(URL_BASE, params({ page: 1, ...next }), { preserveState: true, preserveScroll: true, replace: true, onStart: () => setLoading(true), onFinish: () => setLoading(false) });
    };

    // Debounced search
    React.useEffect(() => {
        if (search === filters.search) return;
        const t = window.setTimeout(() => apply({ search }), 350);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const exportUrl = `${URL_BASE}/export?${new URLSearchParams(Object.entries(params({})).filter(([k]) => k !== 'per_page' && k !== 'page').map(([k, v]) => [k, String(v)])).toString()}`;
    const anyFilter = Boolean(filters.search || filters.event || filters.user_id || filters.subject_type || filters.entity_id || filters.batch_id || filters.from || filters.to);
    const clearAll = () => {
        setSearch('');
        apply({ search: '', event: null, user_id: null, subject_type: null, subject_id: null, entity_id: null, batch_id: null, from: null, to: null });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Audit Trail" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading title="Audit Trail" description="Every record created, changed or deleted — by whom, when, from where, and exactly what changed. Entries cannot be edited." />
                    <Button variant="outline" asChild>
                        <a href={exportUrl}>
                            <Download className="size-4" /> Export CSV
                        </a>
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <Stat label="Changes today" value={summary.today} hint={`${summary.usersToday} user${summary.usersToday === 1 ? '' : 's'} active`} />
                    <Stat label="Created · 7 days" value={summary.week.created} onClick={() => apply({ event: 'created' })} />
                    <Stat label="Updated · 7 days" value={summary.week.updated} onClick={() => apply({ event: 'updated' })} />
                    <Stat label="Deleted · 7 days" value={summary.week.deleted} tone={summary.week.deleted ? 'rose' : undefined} onClick={() => apply({ event: 'deleted' })} />
                    <Stat label="Other actions · 7 days" value={summary.week.other} hint="Bulk updates, restores" onClick={() => apply({ event: 'request' })} />
                </div>

                {(filters.subject_id || filters.batch_id) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3.5 py-2 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                        <span className="flex items-center gap-2">
                            {filters.batch_id ? <Layers className="size-4" /> : <History className="size-4" />}
                            {filters.batch_id ? 'Showing everything changed in one action' : `History of ${subject ?? `${filters.subject_type?.split('\\').pop()} #${filters.subject_id}`}`}
                        </span>
                        <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2" onClick={() => apply({ subject_type: null, subject_id: null, batch_id: null })}>
                            <X className="size-3.5" /> Show all
                        </button>
                    </div>
                )}

                <section className="rounded-xl border bg-card shadow-sm">
                    {/* Filters */}
                    <div className="flex flex-col gap-2 border-b p-3 xl:flex-row xl:flex-wrap xl:items-center">
                        <div className="relative w-full xl:w-64">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search record, user, IP, route" className="h-9 pl-8" aria-label="Search" />
                        </div>
                        <FilterSelect value={filters.event ?? ALL} onChange={(v) => apply({ event: v === ALL ? null : v })} className="xl:w-36" all="Any action">
                            <SelectItem value="created">Created</SelectItem>
                            <SelectItem value="updated">Updated</SelectItem>
                            <SelectItem value="deleted">Deleted</SelectItem>
                            <SelectItem value="restored">Restored</SelectItem>
                            <SelectItem value="request">Other actions</SelectItem>
                        </FilterSelect>
                        <FilterSelect value={filters.user_id ? String(filters.user_id) : ALL} onChange={(v) => apply({ user_id: v === ALL ? null : Number(v) })} className="xl:w-44" all="Any user">
                            {options.users.map((u) => (
                                <SelectItem key={u.id} value={String(u.id)}>
                                    {u.name}
                                </SelectItem>
                            ))}
                        </FilterSelect>
                        <FilterSelect value={filters.subject_type ?? ALL} onChange={(v) => apply({ subject_type: v === ALL ? null : v, subject_id: null })} className="xl:w-48" all="Any record type">
                            {options.types.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                </SelectItem>
                            ))}
                        </FilterSelect>
                        <FilterSelect value={filters.entity_id ? String(filters.entity_id) : ALL} onChange={(v) => apply({ entity_id: v === ALL ? null : Number(v) })} className="xl:w-44" all="Any branch">
                            {options.entities.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)}>
                                    {e.name}
                                </SelectItem>
                            ))}
                        </FilterSelect>
                        <div className="flex items-center gap-1.5">
                            <Input type="date" value={filters.from ?? ''} onChange={(e) => apply({ from: e.target.value || null })} className="h-9 w-[9.5rem]" aria-label="From date" />
                            <span className="text-xs text-muted-foreground">to</span>
                            <Input type="date" value={filters.to ?? ''} onChange={(e) => apply({ to: e.target.value || null })} className="h-9 w-[9.5rem]" aria-label="To date" />
                        </div>
                        {anyFilter && (
                            <Button variant="ghost" size="sm" onClick={clearAll}>
                                Clear
                            </Button>
                        )}
                        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground xl:ml-auto" />}
                    </div>

                    {/* List */}
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                            <ShieldCheck className="size-8 text-muted-foreground/50" />
                            <p className="text-sm font-medium">No changes match these filters</p>
                        </div>
                    ) : (
                        <div className={cn('overflow-x-auto transition-opacity', loading && 'opacity-60')}>
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-xs text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium whitespace-nowrap">When</th>
                                        <th className="px-3 py-2 text-left font-medium">User</th>
                                        <th className="px-3 py-2 text-left font-medium">Action</th>
                                        <th className="px-3 py-2 text-left font-medium">Record</th>
                                        <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Changes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {items.map((item) => (
                                        <tr
                                            key={item.id}
                                            className="cursor-pointer align-top hover:bg-muted/30"
                                            onClick={() => setSelected(item)}
                                            tabIndex={0}
                                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(item))}
                                        >
                                            <td className="px-4 py-2.5 whitespace-nowrap">
                                                <span className="block">{when(item.created_at).date}</span>
                                                <span className="block text-xs text-muted-foreground">{when(item.created_at).time}</span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className="flex items-center gap-1.5 font-medium">
                                                    {item.source === 'console' && <Terminal className="size-3.5 text-muted-foreground" aria-label="Console" />}
                                                    {item.user?.name ?? 'System'}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">{[item.entity?.code, item.request.ip].filter(Boolean).join(' · ') || '—'}</span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <EventBadge event={item.event} />
                                            </td>
                                            <td className="max-w-80 px-3 py-2.5">
                                                <span className="block truncate font-medium">{item.subject.label ?? item.description ?? '—'}</span>
                                                <span className="block truncate text-xs text-muted-foreground">
                                                    {item.subject.type_label ? `${item.subject.type_label}${item.subject.id ? ` #${item.subject.id}` : ''}` : item.request.route}
                                                </span>
                                            </td>
                                            <td className="hidden max-w-md px-3 py-2.5 text-xs text-muted-foreground lg:table-cell">
                                                <span className="line-clamp-2">{summarize(item.changes, item.event) || item.description || '—'}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    <div className="flex flex-col gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>
                            {pagination.total === 0 ? 'No entries' : `${pagination.from?.toLocaleString()}–${pagination.to?.toLocaleString()} of ${pagination.total.toLocaleString()} entries`}
                        </span>
                        <div className="flex items-center gap-2">
                            <Select value={String(pagination.perPage)} onValueChange={(v) => apply({ per_page: Number(v) })}>
                                <SelectTrigger className="h-8 w-[6.5rem]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[25, 50, 100].map((n) => (
                                        <SelectItem key={n} value={String(n)}>
                                            {n} / page
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button variant="outline" size="icon" className="size-8" disabled={pagination.page <= 1 || loading} onClick={() => apply({ page: pagination.page - 1 })} aria-label="Previous page">
                                <ChevronLeft className="size-4" />
                            </Button>
                            <span className="tabular-nums">
                                {pagination.page} / {pagination.lastPage}
                            </span>
                            <Button variant="outline" size="icon" className="size-8" disabled={pagination.page >= pagination.lastPage || loading} onClick={() => apply({ page: pagination.page + 1 })} aria-label="Next page">
                                <ChevronRight className="size-4" />
                            </Button>
                        </div>
                    </div>
                </section>
            </div>

            <DetailSheet
                item={selected}
                onClose={() => setSelected(null)}
                onHistory={(i) => apply({ subject_type: i.subject.type, subject_id: i.subject.id, batch_id: null, event: null, search: '' })}
                onBatch={(batch) => apply({ batch_id: batch, subject_type: null, subject_id: null, event: null, search: '' })}
            />
        </AppLayout>
    );
}

function when(iso: string | null) {
    if (!iso) return { date: '—', time: '' };
    const d = new Date(iso);
    return {
        date: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
    };
}

function Stat({ label, value, hint, tone, onClick }: { label: string; value: number; hint?: string; tone?: 'rose'; onClick?: () => void }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={cn('rounded-xl border bg-card p-3.5 text-left shadow-sm', onClick && 'transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none')}
        >
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className={cn('mt-1 font-mono text-2xl font-semibold tabular-nums', tone === 'rose' && 'text-rose-600 dark:text-rose-400')}>{value.toLocaleString()}</p>
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </Tag>
    );
}

function FilterSelect({ value, onChange, all, className, children }: { value: string; onChange: (v: string) => void; all: string; className?: string; children: React.ReactNode }) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={cn('h-9 w-full', className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{all}</SelectItem>
                {children}
            </SelectContent>
        </Select>
    );
}
