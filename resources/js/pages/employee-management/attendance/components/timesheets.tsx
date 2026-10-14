import { router } from '@inertiajs/react';
import {
    CheckCheck,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    FilePenLine,
    Lock,
    MapPinCheck,
    MoreHorizontal,
    Pencil,
    Undo2,
} from 'lucide-react';
import * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
    ATTENDANCE_STATUS,
    ATTENDANCE_URL,
    DAY_TYPE,
    fmtDate,
    fmtHours,
    fmtMinutes,
    fmtTime,
    firstError,
    fullName,
    periodPresets,
    recordIssues,
    RECORD_STATUS,
    TONE,
    weekday,
    type Approval,
    type DtrRow,
    type Filters,
    type Kpis,
    type Paginated,
    type Person,
    type Perspective,
} from '../lib';

type Props = {
    entries: Paginated<DtrRow>;
    kpis: Kpis;
    approval: Approval;
    filters: Filters;
    employees: Person[];
    perspective: Perspective;
    today: string;
    onFilter: (changes: Partial<Filters>) => void;
    onEdit: (entry: DtrRow) => void;
    onApprove: (entry: DtrRow) => void;
    onRequest: (entry: DtrRow, type: 'correction') => void;
};

const ALL = 'all';

export function Timesheets({ entries, kpis, approval, filters, employees, perspective, today, onFilter, onEdit, onApprove, onRequest }: Props) {
    const { canManage, canViewTeam } = perspective;
    const [selected, setSelected] = React.useState<number[]>([]);
    const [bulkBusy, setBulkBusy] = React.useState(false);
    const presets = React.useMemo(() => periodPresets(today), [today]);
    const activePreset = presets.find((p) => p.from === filters.date_from && p.to === filters.date_to)?.id;

    React.useEffect(() => setSelected([]), [entries]);

    const approvable = entries.data.filter((e) => e.status === 'open' && e.attendance_status !== 'incomplete');
    const allSelected = approvable.length > 0 && approvable.every((e) => selected.includes(e.id));
    const totalInPeriod = approval.open + approval.approved + approval.locked;

    const bulkApprove = (ids: number[]) => {
        if (ids.length === 0) return;
        setBulkBusy(true);
        router.post(
            `${ATTENDANCE_URL}/approve-bulk`,
            { ids },
            { preserveScroll: true, onError: (e) => toast.error(firstError(e)), onFinish: () => setBulkBusy(false) },
        );
    };

    const post = (url: string) => router.post(url, {}, { preserveScroll: true, onError: (e) => toast.error(firstError(e)) });

    const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    return (
        <div className="space-y-4">
            {/* Period + filters */}
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex flex-wrap rounded-md border bg-muted p-0.5">
                        {presets.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => onFilter({ date_from: p.from, date_to: p.to })}
                                className={cn(
                                    'rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
                                    activePreset === p.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Input
                            type="date"
                            value={filters.date_from}
                            onChange={(e) => e.target.value && onFilter({ date_from: e.target.value })}
                            className="h-8 w-[140px] text-xs"
                            aria-label="From"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                            type="date"
                            value={filters.date_to}
                            onChange={(e) => e.target.value && onFilter({ date_to: e.target.value })}
                            className="h-8 w-[140px] text-xs"
                            aria-label="To"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {canViewTeam && (
                        <Select value={filters.employee_id ? String(filters.employee_id) : ALL} onValueChange={(v) => onFilter({ employee_id: v === ALL ? null : Number(v) })}>
                            <SelectTrigger className="h-8 w-[220px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>All employees</SelectItem>
                                {employees.map((e) => (
                                    <SelectItem key={e.id} value={String(e.id)}>
                                        {fullName(e)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <div className="inline-flex rounded-md border bg-muted p-0.5">
                        {[
                            { v: '', l: 'All' },
                            { v: 'open', l: 'For review' },
                            { v: 'approved', l: 'Approved' },
                            { v: 'locked', l: 'Locked' },
                        ].map((s) => (
                            <button
                                key={s.v || ALL}
                                type="button"
                                onClick={() => onFilter({ status: s.v })}
                                className={cn(
                                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                                    filters.status === s.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {s.l}
                            </button>
                        ))}
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                        <Switch checked={filters.exceptions_only} onCheckedChange={(v) => onFilter({ exceptions_only: v })} />
                        Issues only
                        {kpis.exceptions > 0 && (
                            <Badge variant="outline" className={TONE.rose}>
                                {kpis.exceptions}
                            </Badge>
                        )}
                    </label>
                </div>
            </div>

            {/* Period summary */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat label="Regular hours" value={fmtHours(kpis.regularHours)} hint={`${kpis.daysWorked} days worked`} />
                <Stat
                    label="Payable overtime"
                    value={fmtHours(kpis.otApproved)}
                    hint={
                        kpis.otRendered > kpis.otApproved
                            ? `of ${fmtHours(kpis.otRendered)} rendered · ${fmtHours(kpis.otRendered - kpis.otApproved)} not pre-approved`
                            : kpis.otRendered > 0
                              ? 'All rendered OT approved'
                              : 'No overtime rendered'
                    }
                    tone={kpis.otRendered > kpis.otApproved ? 'text-amber-600 dark:text-amber-400' : undefined}
                />
                <Stat label="Late" value={fmtMinutes(kpis.tardinessMinutes)} hint={`${kpis.lateDays} late ${kpis.lateDays === 1 ? 'day' : 'days'}`} tone={kpis.lateDays ? 'text-amber-600 dark:text-amber-400' : undefined} />
                <Stat label="Undertime" value={fmtMinutes(kpis.undertimeMinutes)} hint="Left before shift end" />
                <Stat
                    label="Absent / missing"
                    value={`${kpis.absences} / ${kpis.incomplete}`}
                    hint="Absences / missing punches"
                    tone={kpis.absences + kpis.incomplete ? 'text-rose-600 dark:text-rose-400' : undefined}
                />
            </div>

            {/* Approval progress (timekeeper) */}
            {canManage && totalInPeriod > 0 && (
                <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm md:flex-row md:items-center">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                            <ClipboardCheck className="size-4 text-muted-foreground" />
                            Payroll readiness
                            <span className="text-muted-foreground">
                                · {approval.approved + approval.locked} of {totalInPeriod} approved
                            </span>
                        </div>
                        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
                            <div className="bg-slate-400" style={{ width: `${(approval.locked / totalInPeriod) * 100}%` }} title="Locked" />
                            <div className="bg-emerald-500" style={{ width: `${(approval.approved / totalInPeriod) * 100}%` }} title="Approved" />
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                            {approval.open === 0
                                ? 'Everything in this period is approved.'
                                : `${approval.readyToApprove} ready to approve · ${approval.open - approval.readyToApprove} need a fix first (missing punch).`}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {selected.length > 0 && (
                            <Button variant="outline" onClick={() => setSelected([])}>
                                Clear ({selected.length})
                            </Button>
                        )}
                        <Button disabled={bulkBusy || (selected.length === 0 && approvable.length === 0)} onClick={() => bulkApprove(selected.length ? selected : approvable.map((e) => e.id))}>
                            <CheckCheck className="size-4" />
                            {selected.length ? `Approve ${selected.length} selected` : `Approve ${approvable.length} on this page`}
                        </Button>
                    </div>
                </div>
            )}

            {/* Records */}
            <TableShell>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                {canManage && (
                                    <TableHead className="w-10">
                                        <Checkbox
                                            checked={allSelected}
                                            onCheckedChange={(v) => setSelected(v ? approvable.map((e) => e.id) : [])}
                                            aria-label="Select all ready records"
                                            disabled={approvable.length === 0}
                                        />
                                    </TableHead>
                                )}
                                <TableHead className="w-12">
                                    <span className="sr-only">Actions</span>
                                </TableHead>
                                <TableHead>Date</TableHead>
                                {canViewTeam && <TableHead className="min-w-[200px]">Employee</TableHead>}
                                <TableHead className="hidden lg:table-cell">Schedule</TableHead>
                                <TableHead>In</TableHead>
                                <TableHead className="hidden md:table-cell">Break</TableHead>
                                <TableHead>Out</TableHead>
                                <TableHead className="text-right">Hours</TableHead>
                                <TableHead>Issues</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {entries.data.length === 0 ? (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={11} className="h-40 text-center text-sm text-muted-foreground">
                                        {filters.exceptions_only ? 'No issues in this period — nice.' : 'No time records in this period.'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                entries.data.map((e) => {
                                    const issues = recordIssues(e);
                                    const att = ATTENDANCE_STATUS[e.attendance_status] ?? { label: e.attendance_status, tone: 'slate' as const };
                                    const rec = RECORD_STATUS[e.status];
                                    const locked = e.status === 'locked';
                                    const canSelect = canManage && e.status === 'open' && e.attendance_status !== 'incomplete';
                                    const otPending = Number(e.ot_hours) > Number(e.ot_hours_approved);
                                    return (
                                        <TableRow key={e.id} className={cn(selected.includes(e.id) && 'bg-primary/5')}>
                                            {canManage && (
                                                <TableCell>
                                                    <Checkbox checked={selected.includes(e.id)} disabled={!canSelect} onCheckedChange={() => toggle(e.id)} aria-label="Select record" />
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="size-8" aria-label="Record actions">
                                                            <MoreHorizontal className="size-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start">
                                                        {canManage ? (
                                                            <>
                                                                {e.status === 'open' && (
                                                                    <DropdownMenuItem onClick={() => onApprove(e)} disabled={e.attendance_status === 'incomplete'}>
                                                                        <CheckCheck className="size-4" /> Approve day
                                                                    </DropdownMenuItem>
                                                                )}
                                                                <DropdownMenuItem onClick={() => onEdit(e)} disabled={locked}>
                                                                    <Pencil className="size-4" /> Edit punches
                                                                </DropdownMenuItem>
                                                                {e.status === 'approved' && (
                                                                    <DropdownMenuItem onClick={() => post(`${ATTENDANCE_URL}/${e.id}/reopen`)}>
                                                                        <Undo2 className="size-4" /> Reopen for review
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {e.location_status === 'out_of_bounds' && !locked && (
                                                                    <>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem onClick={() => post(`${ATTENDANCE_URL}/${e.id}/verify`)}>
                                                                            <MapPinCheck className="size-4" /> Accept location
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <DropdownMenuItem onClick={() => onRequest(e, 'correction')} disabled={locked}>
                                                                    <FilePenLine className="size-4" /> Request correction
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                <div className="text-sm font-medium">{fmtDate(e.work_date)}</div>
                                                <div className="text-[11px] text-muted-foreground">
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
                                                            <div className="truncate text-[11px] text-muted-foreground">{e.employee?.position}</div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            )}
                                            <TableCell className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
                                                {e.scheduled_in ? `${fmtTime(e.scheduled_in)} – ${fmtTime(e.scheduled_out)}` : '—'}
                                            </TableCell>
                                            <TableCell className={cn('font-mono text-xs whitespace-nowrap', Number(e.tardiness_minutes) > 0 && 'font-semibold text-amber-600 dark:text-amber-400')}>
                                                {e.time_in ? fmtTime(e.time_in) : <Missing show={e.attendance_status === 'incomplete'} />}
                                            </TableCell>
                                            <TableCell className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                                                {e.break_out ? `${fmtTime(e.break_out)} – ${fmtTime(e.break_in)}` : '—'}
                                            </TableCell>
                                            <TableCell className={cn('font-mono text-xs whitespace-nowrap', Number(e.undertime_minutes) > 0 && 'font-semibold text-amber-600 dark:text-amber-400')}>
                                                {e.time_out ? fmtTime(e.time_out) : <Missing show={e.attendance_status === 'incomplete'} />}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs whitespace-nowrap tabular-nums">
                                                <div className="font-semibold">{fmtHours(e.regular_hours)}</div>
                                                {Number(e.ot_hours) > 0 && (
                                                    <div className={cn('text-[11px]', otPending ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>
                                                        +{fmtHours(e.ot_hours_approved)}/{fmtHours(e.ot_hours)} OT
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex max-w-[220px] flex-wrap gap-1">
                                                    {issues.length === 0 ? (
                                                        <Badge variant="outline" className={TONE[att.tone]}>
                                                            {att.label}
                                                        </Badge>
                                                    ) : (
                                                        issues.map((i) => (
                                                            <Badge key={i} variant="outline" className={cn('text-[11px]', i.startsWith('OT') || i.startsWith('Late') || i.startsWith('Under') ? TONE.amber : TONE.rose)}>
                                                                {i}
                                                            </Badge>
                                                        ))
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={cn('gap-1', TONE[rec.tone])}
                                                    title={e.approver ? `Approved by ${e.approver.firstname} ${e.approver.lastname}` : undefined}
                                                >
                                                    {locked && <Lock className="size-3" />}
                                                    {rec.label}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{entries.total === 0 ? 'No records' : `Showing ${entries.from}–${entries.to} of ${entries.total}`}</span>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={!entries.prev_page_url}
                            onClick={() => entries.prev_page_url && router.get(entries.prev_page_url, {}, { preserveScroll: true, preserveState: true })}
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <span className="min-w-[64px] text-center tabular-nums">
                            {entries.current_page} / {entries.last_page}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-8"
                            disabled={!entries.next_page_url}
                            onClick={() => entries.next_page_url && router.get(entries.next_page_url, {}, { preserveScroll: true, preserveState: true })}
                            aria-label="Next page"
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                </div>
            </TableShell>
        </div>
    );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) {
    return (
        <div className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className={cn('mt-1 text-xl font-bold tabular-nums', tone)}>{value}</div>
            <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
        </div>
    );
}

function Missing({ show }: { show: boolean }) {
    return show ? <span className="font-sans font-medium text-rose-600 dark:text-rose-400">Missing</span> : <span className="text-muted-foreground">—</span>;
}
