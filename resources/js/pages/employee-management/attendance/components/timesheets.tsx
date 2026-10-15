import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { Check, CheckCheck, ChevronLeft, ChevronRight, FilePenLine, Lock, MapPinCheck, MoreHorizontal, Pencil, Undo2, X } from 'lucide-react';
import * as React from 'react';
import {
    ATTENDANCE_URL,
    DAY_TYPE,
    firstError,
    fmtDate,
    fmtHours,
    fmtTime,
    fullName,
    periodOptions,
    RECORD_STATUS,
    TONE,
    weekday,
    type Approval,
    type DtrRow,
    type Filters,
    type Paginated,
    type PayPeriodOption,
    type Person,
    type Perspective,
    type SummaryRow,
} from '../lib';

type Props = {
    entries: Paginated<DtrRow>;
    approval: Approval;
    summary: SummaryRow[];
    periods: PayPeriodOption[];
    filters: Filters;
    employees: Person[];
    perspective: Perspective;
    today: string;
    onFilter: (changes: Partial<Filters>) => void;
    onEdit: (entry: DtrRow) => void;
    onReject: (entry: DtrRow) => void;
    onRequest: (entry: DtrRow, type: 'correction') => void;
};

const ALL = 'all';
const CUSTOM = 'custom';

const STATUS_FILTERS = [
    { v: '', l: 'All' },
    { v: 'open', l: 'Pending' },
    { v: 'approved', l: 'Approved' },
    { v: 'rejected', l: 'Rejected' },
];

/** A day can be approved when it has both punches, or a pending correction that may supply them. */
const canApproveDay = (e: DtrRow) => e.status === 'open' && (e.attendance_status !== 'incomplete' || !!e.pending_correction);

export function Timesheets({
    entries,
    approval,
    summary,
    periods,
    filters,
    employees,
    perspective,
    today,
    onFilter,
    onEdit,
    onReject,
    onRequest,
}: Props) {
    const { canManage, canViewTeam } = perspective;
    const [layout, setLayout] = React.useState<'days' | 'summary'>('days');
    const [selected, setSelected] = React.useState<number[]>([]);
    const [busy, setBusy] = React.useState(false);
    const options = React.useMemo(() => periodOptions(periods, today), [periods, today]);
    const activePeriod = options.find((p) => p.from === filters.date_from && p.to === filters.date_to)?.id ?? CUSTOM;

    React.useEffect(() => setSelected([]), [entries]);

    // Bulk approval leaves out days with a correction — those are approved one at a time.
    const bulkable = entries.data.filter((e) => e.status === 'open' && e.attendance_status !== 'incomplete' && !e.pending_correction);
    const allSelected = bulkable.length > 0 && bulkable.every((e) => selected.includes(e.id));
    const totalInPeriod = approval.open + approval.approved + approval.rejected + approval.locked;

    const post = (url: string, data: Record<string, unknown> = {}) => {
        setBusy(true);
        router.post(url, data as never, { preserveScroll: true, onError: (e) => toast.error(firstError(e)), onFinish: () => setBusy(false) });
    };

    const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    return (
        <div className="space-y-4">
            {/* Period, people, status */}
            <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-sm">
                <Select
                    value={activePeriod}
                    onValueChange={(v) => {
                        const p = options.find((o) => o.id === v);
                        if (p) onFilter({ date_from: p.from, date_to: p.to });
                    }}
                >
                    <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Pay period">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.label}
                                {p.current && <span className="text-muted-foreground"> · current</span>}
                            </SelectItem>
                        ))}
                        {activePeriod === CUSTOM && <SelectItem value={CUSTOM}>Custom range</SelectItem>}
                    </SelectContent>
                </Select>
                {activePeriod === CUSTOM && (
                    <div className="flex items-center gap-1.5">
                        <Input
                            type="date"
                            value={filters.date_from}
                            onChange={(e) => e.target.value && onFilter({ date_from: e.target.value })}
                            className="h-8 w-[140px] text-xs"
                            aria-label="From"
                        />
                        <span className="text-muted-foreground text-xs">to</span>
                        <Input
                            type="date"
                            value={filters.date_to}
                            onChange={(e) => e.target.value && onFilter({ date_to: e.target.value })}
                            className="h-8 w-[140px] text-xs"
                            aria-label="To"
                        />
                    </div>
                )}
                {canViewTeam && (
                    <Select
                        value={filters.employee_id ? String(filters.employee_id) : ALL}
                        onValueChange={(v) => onFilter({ employee_id: v === ALL ? null : Number(v) })}
                    >
                        <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Employee">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL}>All staff</SelectItem>
                            {employees.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)}>
                                    {fullName(e)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {layout === 'days' && <Segmented value={filters.status} options={STATUS_FILTERS} onChange={(v) => onFilter({ status: v })} />}
                <div className="ml-auto">
                    <Segmented
                        value={layout}
                        options={[
                            { v: 'days', l: 'Days' },
                            { v: 'summary', l: 'Summary' },
                        ]}
                        onChange={(v) => setLayout(v as 'days' | 'summary')}
                    />
                </div>
            </div>

            {/* Approval progress (approver) */}
            {canManage && layout === 'days' && totalInPeriod > 0 && (
                <div className="bg-card flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm sm:flex-row sm:items-center">
                    <div className="flex-1 text-sm">
                        <span className="font-medium">
                            {approval.approved + approval.locked} of {totalInPeriod} days approved
                        </span>
                        <span className="text-muted-foreground">
                            {approval.open > 0 && ` · ${approval.open} pending`}
                            {approval.rejected > 0 && ` · ${approval.rejected} rejected`}
                        </span>
                        {approval.corrections > 0 && (
                            <span className="text-sky-700 dark:text-sky-300"> · {approval.corrections} with a correction to check</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {selected.length > 0 && (
                            <Button variant="outline" size="sm" onClick={() => setSelected([])}>
                                Clear ({selected.length})
                            </Button>
                        )}
                        <Button
                            size="sm"
                            disabled={busy || (selected.length === 0 && bulkable.length === 0)}
                            onClick={() => post(`${ATTENDANCE_URL}/approve-bulk`, { ids: selected.length ? selected : bulkable.map((e) => e.id) })}
                        >
                            <CheckCheck className="size-4" />
                            {selected.length ? `Approve ${selected.length} selected` : `Approve ${bulkable.length} on this page`}
                        </Button>
                    </div>
                </div>
            )}

            {layout === 'summary' ? (
                <Summary
                    rows={summary}
                    canViewTeam={canViewTeam}
                    onOpen={(id) => {
                        setLayout('days');
                        onFilter({ employee_id: id });
                    }}
                />
            ) : (
                <TableShell>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    {canManage && (
                                        <TableHead className="w-10">
                                            <Checkbox
                                                checked={allSelected}
                                                onCheckedChange={(v) => setSelected(v ? bulkable.map((e) => e.id) : [])}
                                                aria-label="Select all days ready to approve"
                                                disabled={bulkable.length === 0}
                                            />
                                        </TableHead>
                                    )}
                                    <TableHead>Date</TableHead>
                                    {canViewTeam && <TableHead className="min-w-[200px]">Employee</TableHead>}
                                    <TableHead>In</TableHead>
                                    <TableHead className="hidden md:table-cell">Break</TableHead>
                                    <TableHead>Out</TableHead>
                                    <TableHead className="text-right">Hours</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-10">
                                        <span className="sr-only">More</span>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {entries.data.length === 0 ? (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={9} className="text-muted-foreground h-40 text-center text-sm">
                                            No time records in this period.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    entries.data.map((e) => (
                                        <DayRow
                                            key={e.id}
                                            entry={e}
                                            perspective={perspective}
                                            selected={selected.includes(e.id)}
                                            selectable={bulkable.includes(e)}
                                            busy={busy}
                                            onToggle={() => toggle(e.id)}
                                            onApprove={() => post(`${ATTENDANCE_URL}/${e.id}/approve`)}
                                            onReject={() => onReject(e)}
                                            onReopen={() => post(`${ATTENDANCE_URL}/${e.id}/reopen`)}
                                            onVerify={() => post(`${ATTENDANCE_URL}/${e.id}/verify`)}
                                            onEdit={() => onEdit(e)}
                                            onRequest={() => onRequest(e, 'correction')}
                                        />
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <Pager page={entries} />
                </TableShell>
            )}
        </div>
    );
}

type DayRowProps = {
    entry: DtrRow;
    perspective: Perspective;
    selected: boolean;
    selectable: boolean;
    busy: boolean;
    onToggle: () => void;
    onApprove: () => void;
    onReject: () => void;
    onReopen: () => void;
    onVerify: () => void;
    onEdit: () => void;
    onRequest: () => void;
};

function DayRow({
    entry: e,
    perspective,
    selected,
    selectable,
    busy,
    onToggle,
    onApprove,
    onReject,
    onReopen,
    onVerify,
    onEdit,
    onRequest,
}: DayRowProps) {
    const { canManage, canViewTeam } = perspective;
    const fix = e.pending_correction;
    const locked = e.status === 'locked';
    const incomplete = e.attendance_status === 'incomplete';
    const rec = RECORD_STATUS[e.status];

    return (
        <TableRow className={cn(selected && 'bg-primary/5', e.status === 'rejected' && 'text-muted-foreground')}>
            {canManage && (
                <TableCell>
                    <Checkbox checked={selected} disabled={!selectable} onCheckedChange={onToggle} aria-label="Select day" />
                </TableCell>
            )}
            <TableCell className="whitespace-nowrap">
                <div className="text-sm font-medium">{fmtDate(e.work_date)}</div>
                <div className="text-muted-foreground text-[11px]">
                    {weekday(e.work_date)}
                    {e.day_type !== 'regular' && <> · {DAY_TYPE[e.day_type] ?? e.day_type}</>}
                </div>
            </TableCell>
            {canViewTeam && (
                <TableCell>
                    <div className="flex items-center gap-2.5">
                        <PersonAvatar src={e.employee?.avatar_url} seed={e.employee?.employee_code ?? String(e.employee_id)} className="size-8" />
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{fullName(e.employee)}</div>
                            <div className="text-muted-foreground truncate text-[11px]">{e.employee?.position}</div>
                        </div>
                    </div>
                </TableCell>
            )}
            <Punch
                value={e.time_in}
                requested={fix?.requested_time_in}
                reason={fix?.reason}
                incomplete={incomplete}
                warn={Number(e.tardiness_minutes) > 0}
            />
            <TableCell className="text-muted-foreground hidden font-mono text-xs whitespace-nowrap md:table-cell">
                {e.break_out ? `${fmtTime(e.break_out)} – ${fmtTime(e.break_in)}` : '—'}
                {fix && (fix.requested_break_out || fix.requested_break_in) && (
                    <div className="text-sky-700 dark:text-sky-300" title={`Correction: “${fix.reason}”`}>
                        → {fmtTime(fix.requested_break_out ?? e.break_out)} – {fmtTime(fix.requested_break_in ?? e.break_in)}
                    </div>
                )}
            </TableCell>
            <Punch
                value={e.time_out}
                requested={fix?.requested_time_out}
                reason={fix?.reason}
                incomplete={incomplete}
                warn={Number(e.undertime_minutes) > 0}
            />
            <TableCell className="text-right font-mono text-xs whitespace-nowrap tabular-nums">
                <div className="font-semibold">{fmtHours(e.regular_hours)}</div>
                {Number(e.ot_hours_approved) > 0 && (
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400">+{fmtHours(e.ot_hours_approved)} OT</div>
                )}
            </TableCell>
            <TableCell className="whitespace-nowrap">
                {canManage && e.status === 'open' ? (
                    <div className="flex items-center gap-1.5">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 border-emerald-300 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                            disabled={busy || !canApproveDay(e)}
                            title={
                                !canApproveDay(e)
                                    ? 'Missing punch — edit the times or reject the day'
                                    : fix
                                      ? 'Applies the requested correction and approves the day'
                                      : undefined
                            }
                            onClick={onApprove}
                        >
                            <Check className="size-3.5" /> Approve
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive h-7 gap-1 px-2"
                            disabled={busy}
                            onClick={onReject}
                        >
                            <X className="size-3.5" /> Reject
                        </Button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1">
                        <Badge
                            variant="outline"
                            className={cn('gap-1', TONE[rec.tone])}
                            title={e.approver ? `${rec.label} by ${e.approver.firstname} ${e.approver.lastname}` : undefined}
                        >
                            {locked && <Lock className="size-3" />}
                            {rec.label}
                        </Badge>
                        {!canManage && fix && (
                            <Badge variant="outline" className={cn('gap-1', TONE.sky)} title={`“${fix.reason}”`}>
                                <FilePenLine className="size-3" /> Correction sent
                            </Badge>
                        )}
                        {canManage && (e.status === 'approved' || e.status === 'rejected') && (
                            <Button
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground size-7"
                                disabled={busy}
                                onClick={onReopen}
                                title={e.status === 'approved' ? 'Unapprove (back to pending)' : 'Undo reject (back to pending)'}
                                aria-label="Back to pending"
                            >
                                <Undo2 className="size-3.5" />
                            </Button>
                        )}
                    </div>
                )}
            </TableCell>
            <TableCell>
                {!locked && (canManage || !fix) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
                                <MoreHorizontal className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {canManage ? (
                                <>
                                    <DropdownMenuItem onClick={onEdit}>
                                        <Pencil className="size-4" /> Edit times
                                    </DropdownMenuItem>
                                    {e.location_status === 'out_of_bounds' && (
                                        <DropdownMenuItem onClick={onVerify}>
                                            <MapPinCheck className="size-4" /> Accept location
                                        </DropdownMenuItem>
                                    )}
                                </>
                            ) : (
                                <DropdownMenuItem onClick={onRequest}>
                                    <FilePenLine className="size-4" /> Request correction
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </TableCell>
        </TableRow>
    );
}

/** A punch cell: the recorded time (or "Missing"), plus the employee's requested correction if any. */
function Punch({
    value,
    requested,
    reason,
    incomplete,
    warn,
}: {
    value: string | null;
    requested?: string | null;
    reason?: string;
    incomplete: boolean;
    warn: boolean;
}) {
    return (
        <TableCell className={cn('font-mono text-xs whitespace-nowrap', warn && 'font-semibold text-amber-600 dark:text-amber-400')}>
            {value ? (
                <span className={cn(requested && 'line-through opacity-60')}>{fmtTime(value)}</span>
            ) : incomplete ? (
                <span className={cn('font-sans font-medium text-rose-600 dark:text-rose-400', requested && 'line-through opacity-60')}>Missing</span>
            ) : (
                <span className="text-muted-foreground">—</span>
            )}
            {requested && (
                <div className="font-semibold text-sky-700 dark:text-sky-300" title={reason ? `Correction: “${reason}”` : undefined}>
                    → {fmtTime(requested)}
                </div>
            )}
        </TableCell>
    );
}

function Summary({ rows, canViewTeam, onOpen }: { rows: SummaryRow[]; canViewTeam: boolean; onOpen: (employeeId: number) => void }) {
    const total = rows.reduce(
        (t, r) => ({
            days: t.days + r.days_worked,
            regular: t.regular + r.regular_hours,
            ot: t.ot + r.ot_hours,
            all: t.all + r.total_hours,
            pending: t.pending + r.pending,
        }),
        { days: 0, regular: 0, ot: 0, all: 0, pending: 0 },
    );

    return (
        <TableShell>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="min-w-[220px]">Staff</TableHead>
                            <TableHead className="text-right">Days</TableHead>
                            <TableHead className="text-right">Total hours</TableHead>
                            <TableHead className="text-right">Regular</TableHead>
                            <TableHead className="text-right">Overtime</TableHead>
                            <TableHead>Approval</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={6} className="text-muted-foreground h-40 text-center text-sm">
                                    No time records in this period.
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((r) => (
                                <TableRow key={r.employee.id}>
                                    <TableCell>
                                        <button
                                            type="button"
                                            className="flex items-center gap-2.5 text-left hover:underline"
                                            onClick={() => onOpen(r.employee.id)}
                                            disabled={!canViewTeam}
                                        >
                                            <PersonAvatar src={r.employee.avatar_url} seed={r.employee.employee_code} className="size-8" />
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium">{fullName(r.employee)}</span>
                                                <span className="text-muted-foreground block truncate text-[11px]">{r.employee.position}</span>
                                            </span>
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs tabular-nums">{r.days_worked}</TableCell>
                                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                                        {fmtHours(r.total_hours)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs tabular-nums">{fmtHours(r.regular_hours)}</TableCell>
                                    <TableCell className="text-right font-mono text-xs tabular-nums">
                                        {r.ot_hours > 0 ? fmtHours(r.ot_hours) : '—'}
                                    </TableCell>
                                    <TableCell>
                                        {r.pending > 0 ? (
                                            <Badge variant="outline" className={TONE.amber}>
                                                {r.pending} pending
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className={TONE.emerald}>
                                                All decided
                                            </Badge>
                                        )}
                                        {r.rejected > 0 && <span className="text-muted-foreground ml-1.5 text-[11px]">{r.rejected} rejected</span>}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                    {rows.length > 1 && (
                        <TableFooter>
                            <TableRow>
                                <TableCell className="font-medium">{rows.length} staff</TableCell>
                                <TableCell className="text-right font-mono text-xs tabular-nums">{total.days}</TableCell>
                                <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{fmtHours(total.all)}</TableCell>
                                <TableCell className="text-right font-mono text-xs tabular-nums">{fmtHours(total.regular)}</TableCell>
                                <TableCell className="text-right font-mono text-xs tabular-nums">{fmtHours(total.ot)}</TableCell>
                                <TableCell className="text-muted-foreground text-xs">
                                    {total.pending > 0 ? `${total.pending} days pending` : 'Ready for payroll'}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    )}
                </Table>
            </div>
            <p className="text-muted-foreground border-t px-4 py-2.5 text-[11px]">
                Rejected days are not counted. Overtime is only the hours covered by an approved overtime request.
            </p>
        </TableShell>
    );
}

function Segmented({ value, options, onChange }: { value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
    return (
        <div className="bg-muted inline-flex rounded-md border p-0.5">
            {options.map((o) => (
                <button
                    key={o.v || ALL}
                    type="button"
                    onClick={() => onChange(o.v)}
                    className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        value === o.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {o.l}
                </button>
            ))}
        </div>
    );
}

function Pager({ page }: { page: Paginated<unknown> }) {
    const go = (url: string | null) => url && router.get(url, {}, { preserveScroll: true, preserveState: true });

    return (
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <span className="text-muted-foreground">{page.total === 0 ? 'No records' : `Showing ${page.from}–${page.to} of ${page.total}`}</span>
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={!page.prev_page_url}
                    onClick={() => go(page.prev_page_url)}
                    aria-label="Previous page"
                >
                    <ChevronLeft className="size-4" />
                </Button>
                <span className="min-w-[64px] text-center tabular-nums">
                    {page.current_page} / {page.last_page}
                </span>
                <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    disabled={!page.next_page_url}
                    onClick={() => go(page.next_page_url)}
                    aria-label="Next page"
                >
                    <ChevronRight className="size-4" />
                </Button>
            </div>
        </div>
    );
}
