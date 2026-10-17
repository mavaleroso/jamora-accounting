import { PersonAvatar } from '@/components/person-avatar';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Briefcase,
    CalendarClock,
    Check,
    CheckCheck,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Coffee,
    FilePenLine,
    Hourglass,
    ListChecks,
    Lock,
    MapPin,
    MapPinCheck,
    Palmtree,
    SearchX,
    Timer,
    Undo2,
    Users,
    X,
    type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import {
    ATTENDANCE_URL,
    DAY_TYPE,
    firstError,
    fmtDate,
    fmtMinutes,
    fmtTime,
    fullName,
    htmlToText,
    periodOptions,
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

type View = 'entries' | 'approvals';
type SortDir = 'asc' | 'desc';
type Confirm = { title: string; description: React.ReactNode; action: string; run: () => void } | null;

const ALL = 'all';
const CUSTOM = 'custom';

const STATUS_OPTIONS = [
    { v: 'all', l: 'All' },
    { v: 'open', l: 'Unapproved' },
    { v: 'approved', l: 'Approved' },
    { v: 'rejected', l: 'Declined' },
];

/** Status pills, worded the way a timekeeper reads them. */
const STATUS_PILL: Record<DtrRow['status'] | 'working', { label: string; icon: LucideIcon; className: string }> = {
    open: { label: 'Unapproved', icon: Clock, className: 'border-border bg-muted text-muted-foreground' },
    working: {
        label: 'In progress',
        icon: Timer,
        className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300',
    },
    approved: {
        label: 'Approved',
        icon: Check,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
    },
    rejected: {
        label: 'Declined',
        icon: X,
        className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
    },
    locked: {
        label: 'Locked',
        icon: Lock,
        className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300',
    },
};

/** A day can be approved when it has both punches, or a pending correction that may supply them. */
const canApproveDay = (e: DtrRow) => e.status === 'open' && (e.attendance_status !== 'incomplete' || !!e.pending_correction);
/** Bulk approval leaves out days with a correction — those are approved one at a time. */
const bulkReady = (e: DtrRow) => e.status === 'open' && e.attendance_status !== 'incomplete' && !e.pending_correction;

const hours = (n: number | string | null | undefined) => Number(n ?? 0).toFixed(2);
const dayHours = (e: DtrRow) => Number(e.regular_hours ?? 0) + Number(e.ot_hours_approved ?? 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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
    const [view, setView] = React.useState<View>('entries');
    const [selectedDays, setSelectedDays] = React.useState<number[]>([]);
    const [selectedStaff, setSelectedStaff] = React.useState<number[]>([]);
    const [busy, setBusy] = React.useState(false);
    const [confirm, setConfirm] = React.useState<Confirm>(null);
    const options = React.useMemo(() => periodOptions(periods, today), [periods, today]);
    const periodIndex = options.findIndex((p) => p.from === filters.date_from && p.to === filters.date_to);
    const activePeriod = periodIndex >= 0 ? options[periodIndex].id : CUSTOM;

    React.useEffect(() => setSelectedDays([]), [entries]);
    React.useEffect(() => setSelectedStaff([]), [summary]);

    const post = (url: string, data: Record<string, unknown> = {}) => {
        setBusy(true);
        router.post(url, data as never, { preserveScroll: true, onError: (e) => toast.error(firstError(e)), onFinish: () => setBusy(false) });
    };
    const period = { date_from: filters.date_from, date_to: filters.date_to };
    const stepPeriod = (offset: number) => {
        const p = options[periodIndex + offset]; // options run newest first
        if (p) onFilter({ date_from: p.from, date_to: p.to });
    };

    const pageReady = entries.data.filter(bulkReady);
    const totalInPeriod = approval.open + approval.approved + approval.rejected + approval.locked;
    const missingPunches = Math.max(0, approval.open - approval.readyToApprove);
    const filtered = !!filters.employee_id || (view === 'entries' && filters.status !== ALL && !!filters.status);
    const clearFilters = () => onFilter({ employee_id: null, status: ALL });

    const skippedNote = (
        <>
            {missingPunches > 0 && <> {plural(missingPunches, 'day')} with a missing punch</>}
            {missingPunches > 0 && approval.corrections > 0 && ' and'}
            {approval.corrections > 0 && <> {plural(approval.corrections, 'day')} with a correction to check</>}
            {(missingPunches > 0 || approval.corrections > 0) && ' stay unapproved for you to review one by one.'}
        </>
    );

    // The one primary action, depending on the view and what is selected.
    const approveDays = (ids: number[]) =>
        setConfirm({
            title: `Approve ${plural(ids.length, 'day')}?`,
            description: 'The selected days are marked approved and counted for payroll. You can unapprove them until payroll is computed.',
            action: 'Approve',
            run: () => post(`${ATTENDANCE_URL}/approve-bulk`, { ids }),
        });
    const primary =
        view === 'approvals'
            ? selectedStaff.length
                ? {
                      label: `Approve selected (${selectedStaff.length})`,
                      disabled: false,
                      run: () => {
                          const days = summary.filter((r) => selectedStaff.includes(r.employee.id)).reduce((t, r) => t + r.ready, 0);
                          setConfirm({
                              title: `Approve ${plural(selectedStaff.length, 'employee')}?`,
                              description: `Up to ${plural(days, 'day')} in this period are approved for the selected employees. Days with a missing punch or a correction to check are skipped.`,
                              action: 'Approve',
                              run: () => post(`${ATTENDANCE_URL}/approve-bulk`, { ...period, employee_ids: selectedStaff }),
                          });
                      },
                  }
                : {
                      label: `Approve all (${approval.readyToApprove})`,
                      disabled: approval.readyToApprove === 0,
                      run: () =>
                          setConfirm({
                              title: 'Approve every ready day in this period?',
                              description: (
                                  <>
                                      Up to {plural(approval.readyToApprove, 'day')}
                                      {filters.employee_id
                                          ? ' for this employee'
                                          : ` for ${plural(summary.filter((r) => r.ready > 0).length, 'employee')}`}{' '}
                                      are approved.
                                      {skippedNote}
                                  </>
                              ),
                              action: 'Approve all',
                              run: () =>
                                  post(`${ATTENDANCE_URL}/approve-bulk`, {
                                      ...period,
                                      ...(filters.employee_id ? { employee_id: filters.employee_id } : {}),
                                  }),
                          }),
                  }
            : selectedDays.length
              ? { label: `Approve selected (${selectedDays.length})`, disabled: false, run: () => approveDays(selectedDays) }
              : { label: `Approve page (${pageReady.length})`, disabled: pageReady.length === 0, run: () => approveDays(pageReady.map((e) => e.id)) };

    return (
        <div className="space-y-4">
            {/* Sub-views: every entry by date, or the per-employee approval sheet */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="bg-muted inline-flex rounded-lg border p-1" role="tablist" aria-label="Timesheet views">
                    {(
                        [
                            { id: 'entries', label: 'Time entries', icon: Clock },
                            { id: 'approvals', label: 'Approvals', icon: CheckCheck, badge: canManage ? approval.open : 0 },
                        ] as { id: View; label: string; icon: LucideIcon; badge?: number }[]
                    ).map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            role="tab"
                            aria-selected={view === t.id}
                            onClick={() => setView(t.id)}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                                view === t.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <t.icon className="size-4" />
                            {t.label}
                            {!!t.badge && (
                                <span className="rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums">
                                    {t.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                {canManage && totalInPeriod > 0 && <ApprovalProgress approval={approval} total={totalInPeriod} />}
            </div>

            {/* Filters, labelled, with the primary action on the right */}
            <div className="flex flex-wrap items-end gap-3">
                <Field label="Date range">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-9"
                            disabled={periodIndex < 0 || periodIndex >= options.length - 1}
                            onClick={() => stepPeriod(1)}
                            aria-label="Previous pay period"
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <Select
                            value={activePeriod}
                            onValueChange={(v) => {
                                const p = options.find((o) => o.id === v);
                                if (p) onFilter({ date_from: p.from, date_to: p.to });
                            }}
                        >
                            <SelectTrigger className="h-9 w-[190px]" aria-label="Date range">
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
                        <Button
                            variant="outline"
                            size="icon"
                            className="size-9"
                            disabled={periodIndex <= 0}
                            onClick={() => stepPeriod(-1)}
                            aria-label="Next pay period"
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                        {activePeriod === CUSTOM && (
                            <>
                                <Input
                                    type="date"
                                    value={filters.date_from}
                                    onChange={(e) => e.target.value && onFilter({ date_from: e.target.value })}
                                    className="ml-1 h-9 w-[140px]"
                                    aria-label="From"
                                />
                                <span className="text-muted-foreground text-xs">to</span>
                                <Input
                                    type="date"
                                    value={filters.date_to}
                                    onChange={(e) => e.target.value && onFilter({ date_to: e.target.value })}
                                    className="h-9 w-[140px]"
                                    aria-label="To"
                                />
                            </>
                        )}
                    </div>
                </Field>
                {view === 'entries' && (
                    <Field label="Status">
                        <Select value={filters.status || ALL} onValueChange={(v) => onFilter({ status: v })}>
                            <SelectTrigger className="h-9 w-[150px]" aria-label="Status">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_OPTIONS.map((o) => (
                                    <SelectItem key={o.v} value={o.v}>
                                        {o.l}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
                {canViewTeam && (
                    <Field label="Team member">
                        <Combobox
                            // id 0 stands for "All staff" so the filter can be cleared from the list.
                            options={[{ id: 0, name: 'All staff' }, ...employees.map((e) => ({ id: e.id, name: fullName(e) }))]}
                            value={filters.employee_id ?? 0}
                            onValueChange={(v) => onFilter({ employee_id: v ? Number(v) : null })}
                            placeholder="Search team members"
                            className="w-[230px]"
                        />
                    </Field>
                )}
                {filtered && (
                    <Button variant="link" className="h-9 px-1" onClick={clearFilters}>
                        Clear filters
                    </Button>
                )}
                {canManage && (
                    <div className="ml-auto flex items-end gap-2">
                        {(view === 'approvals' ? selectedStaff.length : selectedDays.length) > 0 && (
                            <Button variant="outline" onClick={() => (view === 'approvals' ? setSelectedStaff([]) : setSelectedDays([]))}>
                                Clear selection
                            </Button>
                        )}
                        <Button disabled={busy || primary.disabled} onClick={primary.run}>
                            <CheckCheck className="size-4" /> {primary.label}
                        </Button>
                    </div>
                )}
            </div>

            {view === 'approvals' ? (
                <Approvals
                    rows={summary}
                    readyDays={approval.readyToApprove}
                    canManage={canManage}
                    canViewTeam={canViewTeam}
                    busy={busy}
                    selected={selectedStaff}
                    onSelect={setSelectedStaff}
                    onApprove={(id) => {
                        const r = summary.find((s) => s.employee.id === id);
                        setConfirm({
                            title: `Approve ${r ? fullName(r.employee) : 'this employee'}?`,
                            description: `${plural(r?.ready ?? 0, 'ready day')} in this period are approved and counted for payroll. Days with a missing punch or a correction to check are skipped.`,
                            action: 'Approve',
                            run: () => post(`${ATTENDANCE_URL}/approve-bulk`, { ...period, employee_id: id }),
                        });
                    }}
                    onUnapprove={(r) =>
                        setConfirm({
                            title: `Unapprove ${fullName(r.employee)}?`,
                            description: `${plural(r.approved, 'approved day')} in this period go back to unapproved. Days already locked by payroll are not changed.`,
                            action: 'Unapprove',
                            run: () => post(`${ATTENDANCE_URL}/reopen-bulk`, { ...period, employee_ids: [r.employee.id] }),
                        })
                    }
                    onOpen={(id) => {
                        setView('entries');
                        onFilter({ employee_id: id, status: ALL });
                    }}
                />
            ) : (
                <TimeEntries
                    entries={entries}
                    perspective={perspective}
                    today={today}
                    busy={busy}
                    filtered={filtered}
                    onClearFilters={clearFilters}
                    selected={selectedDays}
                    onSelect={setSelectedDays}
                    onApproveDay={(ids) => approveDays(ids)}
                    onApprove={(e) => post(`${ATTENDANCE_URL}/${e.id}/approve`)}
                    onReject={onReject}
                    onReopen={(e) =>
                        setConfirm({
                            title: 'Unapprove this day?',
                            description: 'The day goes back to unapproved and is not counted for payroll until it is approved again.',
                            action: 'Unapprove',
                            run: () => post(`${ATTENDANCE_URL}/${e.id}/reopen`),
                        })
                    }
                    onVerify={(e) => post(`${ATTENDANCE_URL}/${e.id}/verify`)}
                    onEdit={onEdit}
                    onRequest={(e) => onRequest(e, 'correction')}
                />
            )}

            <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                confirm?.run();
                                setConfirm(null);
                            }}
                        >
                            {confirm?.action}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Shared building blocks
 * -------------------------------------------------------------------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <Label className="text-muted-foreground block text-xs font-normal">{label}</Label>
            {children}
        </div>
    );
}

/** Where the period stands, as one bar: approved, unapproved, declined. */
function ApprovalProgress({ approval, total }: { approval: Approval; total: number }) {
    const approved = approval.approved + approval.locked;
    const pct = (n: number) => `${(n / total) * 100}%`;
    return (
        <div className="flex min-w-[260px] flex-1 items-center gap-3 sm:max-w-md">
            <div className="bg-muted flex h-2 flex-1 overflow-hidden rounded-full" aria-hidden>
                <div className="bg-emerald-500" style={{ width: pct(approved) }} />
                <div className="bg-rose-400" style={{ width: pct(approval.rejected) }} />
            </div>
            <p className="text-muted-foreground text-xs whitespace-nowrap">
                <span className="text-foreground font-semibold tabular-nums">
                    {approved}/{total}
                </span>{' '}
                approved
                {approval.open > 0 && <span className="text-amber-600 dark:text-amber-400"> · {approval.open} to go</span>}
                {approval.corrections > 0 && <span className="text-sky-700 dark:text-sky-300"> · {plural(approval.corrections, 'correction')}</span>}
            </p>
        </div>
    );
}

function SortHead({
    label,
    active,
    dir,
    onSort,
    className,
}: {
    label: string;
    active: boolean;
    dir: SortDir;
    onSort: () => void;
    className?: string;
}) {
    const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
    return (
        <TableHead className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
            <button
                type="button"
                onClick={onSort}
                className={cn('hover:text-foreground inline-flex items-center gap-1', active && 'text-foreground')}
            >
                {label}
                <Icon className={cn('size-3.5', !active && 'opacity-40')} />
            </button>
        </TableHead>
    );
}

function StatusPill({ status, title }: { status: keyof typeof STATUS_PILL; title?: string }) {
    const pill = STATUS_PILL[status];
    return (
        <span
            className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', pill.className)}
            title={title}
        >
            <pill.icon className="size-3" /> {pill.label}
        </span>
    );
}

/** Split-style action: a text link for the usual action, a chevron for the rest. */
function SplitAction({
    label,
    onClick,
    disabled,
    children,
}: {
    label?: string;
    onClick?: () => void;
    disabled?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <div className="inline-flex items-center justify-end">
            {label && (
                <button
                    type="button"
                    onClick={onClick}
                    disabled={disabled}
                    className="text-primary px-1.5 text-sm font-medium hover:underline disabled:pointer-events-none disabled:opacity-50"
                >
                    {label}
                </button>
            )}
            {children && (
                <>
                    {label && <span className="bg-border h-4 w-px" aria-hidden />}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-primary size-7" aria-label="More actions">
                                <ChevronDown className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">{children}</DropdownMenuContent>
                    </DropdownMenu>
                </>
            )}
        </div>
    );
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint?: string; tone?: 'amber' }) {
    return (
        <div className="bg-card rounded-xl border p-3.5 shadow-sm">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Icon className="size-3.5" /> {label}
            </p>
            <p className={cn('mt-1 text-xl font-semibold tabular-nums', tone === 'amber' && 'text-amber-600 dark:text-amber-400')}>{value}</p>
            {hint && <p className="text-muted-foreground mt-0.5 text-[11px]">{hint}</p>}
        </div>
    );
}

function EmptyState({ title, hint, onClear }: { title: string; hint?: string; onClear?: () => void }) {
    return (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
            <SearchX className="text-muted-foreground/50 size-8" />
            <p className="text-sm font-medium">{title}</p>
            {hint && <p className="text-muted-foreground max-w-sm text-xs">{hint}</p>}
            {onClear && (
                <Button variant="outline" size="sm" className="mt-1" onClick={onClear}>
                    Clear filters
                </Button>
            )}
        </div>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Approvals: the per-employee approval sheet
 * -------------------------------------------------------------------------------------------- */

function Approvals({
    rows,
    readyDays,
    canManage,
    canViewTeam,
    busy,
    selected,
    onSelect,
    onApprove,
    onUnapprove,
    onOpen,
}: {
    rows: SummaryRow[];
    readyDays: number;
    canManage: boolean;
    canViewTeam: boolean;
    busy: boolean;
    selected: number[];
    onSelect: (ids: number[]) => void;
    onApprove: (employeeId: number) => void;
    onUnapprove: (row: SummaryRow) => void;
    onOpen: (employeeId: number) => void;
}) {
    const needing = rows.filter((r) => r.pending > 0);
    const [show, setShow] = React.useState<'needs' | 'all'>(needing.length > 0 ? 'needs' : 'all');
    const [sort, setSort] = React.useState<{ key: 'name' | 'total' | 'regular' | 'overtime' | 'leave'; dir: SortDir }>({ key: 'name', dir: 'asc' });

    const visible = show === 'needs' ? needing : rows;
    const sorted = React.useMemo(() => {
        const value = (r: SummaryRow) =>
            sort.key === 'name'
                ? fullName(r.employee).toLowerCase()
                : sort.key === 'total'
                  ? r.total_hours
                  : sort.key === 'regular'
                    ? r.regular_hours
                    : sort.key === 'overtime'
                      ? r.ot_hours
                      : r.leave_days;
        return [...visible].sort((a, b) => {
            const [x, y] = [value(a), value(b)];
            return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
        });
    }, [visible, sort]);
    const toggleSort = (key: typeof sort.key) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));

    const total = rows.reduce(
        (t, r) => ({ all: t.all + r.total_hours, regular: t.regular + r.regular_hours, ot: t.ot + r.ot_hours, leave: t.leave + r.leave_days }),
        { all: 0, regular: 0, ot: 0, leave: 0 },
    );
    const shown = sorted.reduce(
        (t, r) => ({ all: t.all + r.total_hours, regular: t.regular + r.regular_hours, ot: t.ot + r.ot_hours, leave: t.leave + r.leave_days }),
        { all: 0, regular: 0, ot: 0, leave: 0 },
    );
    const readyStaff = sorted.filter((r) => r.ready > 0).map((r) => r.employee.id);
    const allSelected = readyStaff.length > 0 && readyStaff.every((id) => selected.includes(id));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <Kpi
                    icon={Users}
                    label="Employees"
                    value={String(rows.length)}
                    hint={needing.length ? `${needing.length} with days to approve` : 'All decided'}
                />
                <Kpi icon={Clock} label="Total hours" value={hours(total.all)} hint={`${hours(total.regular)} regular`} />
                <Kpi icon={Hourglass} label="Overtime" value={total.ot ? hours(total.ot) : '0.00'} hint="Approved requests only" />
                <Kpi icon={Palmtree} label="Paid time off" value={plural(total.leave, 'day')} />
                <Kpi icon={CheckCheck} label="Ready to approve" value={plural(readyDays, 'day')} tone={readyDays ? 'amber' : undefined} />
            </div>

            <div className="flex items-center gap-2">
                {(
                    [
                        { id: 'needs', label: 'Needs approval', n: needing.length },
                        { id: 'all', label: 'All employees', n: rows.length },
                    ] as const
                ).map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setShow(c.id)}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                            show === c.id
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'bg-card text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {c.label}
                        <span
                            className={cn(
                                'rounded-full px-1.5 text-[10px] leading-4 tabular-nums',
                                show === c.id ? 'bg-primary-foreground/20' : 'bg-muted',
                            )}
                        >
                            {c.n}
                        </span>
                    </button>
                ))}
            </div>

            <div className="bg-card overflow-x-auto rounded-xl border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            {canManage && (
                                <TableHead className="w-10 pl-4">
                                    <Checkbox
                                        checked={allSelected}
                                        onCheckedChange={(v) => onSelect(v ? readyStaff : [])}
                                        disabled={readyStaff.length === 0}
                                        aria-label="Select everyone with days to approve"
                                    />
                                </TableHead>
                            )}
                            <SortHead
                                label="Name"
                                active={sort.key === 'name'}
                                dir={sort.dir}
                                onSort={() => toggleSort('name')}
                                className="min-w-[220px]"
                            />
                            <SortHead
                                label="Total"
                                active={sort.key === 'total'}
                                dir={sort.dir}
                                onSort={() => toggleSort('total')}
                                className="text-right"
                            />
                            <SortHead
                                label="Regular"
                                active={sort.key === 'regular'}
                                dir={sort.dir}
                                onSort={() => toggleSort('regular')}
                                className="text-right"
                            />
                            <SortHead
                                label="Overtime"
                                active={sort.key === 'overtime'}
                                dir={sort.dir}
                                onSort={() => toggleSort('overtime')}
                                className="text-right"
                            />
                            <SortHead
                                label="Paid time off"
                                active={sort.key === 'leave'}
                                dir={sort.dir}
                                onSort={() => toggleSort('leave')}
                                className="text-right"
                            />
                            <TableHead className="min-w-[170px]">Progress</TableHead>
                            <TableHead className="pr-4 text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {sorted.length === 0 ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={canManage ? 8 : 7}>
                                    {rows.length === 0 ? (
                                        <EmptyState
                                            title="No time records in this period."
                                            hint="Pick another pay period, or check that staff are clocking in."
                                        />
                                    ) : (
                                        <EmptyState
                                            title="Everyone is approved for this period."
                                            hint="Switch to All employees to review or unapprove."
                                        />
                                    )}
                                </TableCell>
                            </TableRow>
                        ) : (
                            sorted.map((r) => {
                                const id = r.employee.id;
                                const daysTotal = r.approved + r.locked + r.pending + r.rejected;
                                const missing = Math.max(0, r.pending - r.ready);
                                return (
                                    <TableRow key={id} data-state={selected.includes(id) ? 'selected' : undefined}>
                                        {canManage && (
                                            <TableCell className="pl-4">
                                                <Checkbox
                                                    checked={selected.includes(id)}
                                                    disabled={r.ready === 0}
                                                    onCheckedChange={(v) => onSelect(v ? [...selected, id] : selected.filter((x) => x !== id))}
                                                    aria-label={`Select ${fullName(r.employee)}`}
                                                />
                                            </TableCell>
                                        )}
                                        <TableCell>
                                            <button
                                                type="button"
                                                className="group flex items-center gap-2.5 text-left"
                                                onClick={() => onOpen(id)}
                                                disabled={!canViewTeam}
                                            >
                                                <PersonAvatar src={r.employee.avatar_url} seed={r.employee.employee_code} className="size-8" />
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-medium group-hover:underline">
                                                        {fullName(r.employee)}
                                                    </span>
                                                    <span className="text-muted-foreground block truncate text-[11px]">
                                                        {r.employee.position}
                                                        {r.days_worked > 0 && ` · ${plural(r.days_worked, 'day')} worked`}
                                                    </span>
                                                </span>
                                            </button>
                                        </TableCell>
                                        <TableCell className="text-right text-sm font-semibold tabular-nums">{hours(r.total_hours)}</TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">
                                            {r.regular_hours ? hours(r.regular_hours) : '--'}
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">{r.ot_hours ? hours(r.ot_hours) : '--'}</TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">
                                            {r.leave_days ? plural(r.leave_days, 'day') : '--'}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="bg-muted flex h-1.5 w-20 overflow-hidden rounded-full" aria-hidden>
                                                    <div
                                                        className="bg-emerald-500"
                                                        style={{ width: `${daysTotal ? ((r.approved + r.locked) / daysTotal) * 100 : 0}%` }}
                                                    />
                                                    <div
                                                        className="bg-rose-400"
                                                        style={{ width: `${daysTotal ? (r.rejected / daysTotal) * 100 : 0}%` }}
                                                    />
                                                </div>
                                                <span className="text-muted-foreground text-xs tabular-nums">
                                                    {r.approved + r.locked}/{daysTotal}
                                                </span>
                                                {r.pending === 0 && (
                                                    <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-label="All decided" />
                                                )}
                                            </div>
                                            {missing > 0 && (
                                                <p className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                                                    {plural(missing, 'missing punch')}
                                                </p>
                                            )}
                                            {r.rejected > 0 && <p className="text-muted-foreground mt-0.5 text-[11px]">{r.rejected} declined</p>}
                                        </TableCell>
                                        <TableCell className="pr-4 text-right">
                                            {canManage ? (
                                                <SplitAction
                                                    label={r.ready > 0 ? 'Approve' : r.approved > 0 ? 'Unapprove' : undefined}
                                                    disabled={busy}
                                                    onClick={() => (r.ready > 0 ? onApprove(id) : onUnapprove(r))}
                                                >
                                                    <DropdownMenuItem onClick={() => onOpen(id)}>
                                                        <ListChecks className="size-4" /> View time entries
                                                    </DropdownMenuItem>
                                                    {(r.ready > 0 || r.approved > 0) && <DropdownMenuSeparator />}
                                                    {r.ready > 0 && (
                                                        <DropdownMenuItem disabled={busy} onClick={() => onApprove(id)}>
                                                            <Check className="size-4" /> Approve {plural(r.ready, 'day')}
                                                        </DropdownMenuItem>
                                                    )}
                                                    {r.approved > 0 && (
                                                        <DropdownMenuItem disabled={busy} onClick={() => onUnapprove(r)}>
                                                            <Undo2 className="size-4" /> Unapprove {plural(r.approved, 'day')}
                                                        </DropdownMenuItem>
                                                    )}
                                                </SplitAction>
                                            ) : (
                                                <SplitAction label="View" onClick={() => onOpen(id)} />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                    {sorted.length > 0 && (
                        <TableFooter className="bg-muted/40">
                            <TableRow className="hover:bg-transparent">
                                {canManage && <TableCell />}
                                <TableCell className="font-semibold">{show === 'needs' ? 'Shown hours' : 'All hours'}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{hours(shown.all)}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{hours(shown.regular)}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">{shown.ot ? hours(shown.ot) : '--'}</TableCell>
                                <TableCell className="text-right font-semibold tabular-nums">
                                    {shown.leave ? plural(shown.leave, 'day') : '--'}
                                </TableCell>
                                <TableCell colSpan={2} />
                            </TableRow>
                        </TableFooter>
                    )}
                </Table>
            </div>
            <p className="text-muted-foreground text-[11px]">
                Declined days are not counted. Overtime is only the hours covered by an approved overtime request; paid time off counts approved leave
                days.
            </p>
        </div>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Time entries: grouped under each day
 * -------------------------------------------------------------------------------------------- */

type RowActions = {
    onApprove: (e: DtrRow) => void;
    onReject: (e: DtrRow) => void;
    onReopen: (e: DtrRow) => void;
    onVerify: (e: DtrRow) => void;
    onEdit: (e: DtrRow) => void;
    onRequest: (e: DtrRow) => void;
};

function TimeEntries({
    entries,
    perspective,
    today,
    busy,
    filtered,
    onClearFilters,
    selected,
    onSelect,
    onApproveDay,
    ...actions
}: {
    entries: Paginated<DtrRow>;
    perspective: Perspective;
    today: string;
    busy: boolean;
    filtered: boolean;
    onClearFilters: () => void;
    selected: number[];
    onSelect: (ids: number[]) => void;
    onApproveDay: (ids: number[]) => void;
} & RowActions) {
    const { canManage, canViewTeam } = perspective;
    const [collapsed, setCollapsed] = React.useState<string[]>([]);
    const [sort, setSort] = React.useState<{ key: 'name' | 'time' | 'hours'; dir: SortDir }>({ key: 'time', dir: 'desc' });
    const toggleSort = (key: typeof sort.key) =>
        setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

    // Days in the order the server sends them; entries sorted within each day.
    const groups = React.useMemo(() => {
        const byDay = new Map<string, DtrRow[]>();
        entries.data.forEach((e) => byDay.set(e.work_date, [...(byDay.get(e.work_date) ?? []), e]));
        const value = (e: DtrRow) =>
            sort.key === 'name' ? fullName(e.employee).toLowerCase() : sort.key === 'hours' ? dayHours(e) : (e.time_in ?? '');
        return [...byDay.entries()].map(([date, rows]) => ({
            date,
            rows: [...rows].sort((a, b) => {
                const [x, y] = [value(a), value(b)];
                return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1);
            }),
        }));
    }, [entries.data, sort]);

    const columns = 6 + (canManage ? 1 : 0) + (canViewTeam ? 1 : 0);
    const toggleIds = (ids: number[], on: boolean) => onSelect(on ? [...new Set([...selected, ...ids])] : selected.filter((id) => !ids.includes(id)));

    return (
        <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            {canManage && <TableHead className="w-10 pl-4" />}
                            {canViewTeam && (
                                <SortHead
                                    label="Name"
                                    active={sort.key === 'name'}
                                    dir={sort.dir}
                                    onSort={() => toggleSort('name')}
                                    className="min-w-[200px]"
                                />
                            )}
                            <SortHead label="Time" active={sort.key === 'time'} dir={sort.dir} onSort={() => toggleSort('time')} />
                            <SortHead label="Hours" active={sort.key === 'hours'} dir={sort.dir} onSort={() => toggleSort('hours')} />
                            <TableHead>Details</TableHead>
                            <TableHead className="min-w-[220px]">Notes</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="pr-4 text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {groups.length === 0 ? (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={columns}>
                                    <EmptyState
                                        title={filtered ? 'No time entries match these filters.' : 'No time entries in this period.'}
                                        hint={filtered ? undefined : 'Entries appear here as staff clock in, or when you add a time record.'}
                                        onClear={filtered ? onClearFilters : undefined}
                                    />
                                </TableCell>
                            </TableRow>
                        ) : (
                            groups.map(({ date, rows }) => {
                                const open = !collapsed.includes(date);
                                const ready = rows.filter(bulkReady).map((e) => e.id);
                                const unapproved = rows.filter((e) => e.status === 'open').length;
                                const allOn = ready.length > 0 && ready.every((id) => selected.includes(id));
                                return (
                                    <React.Fragment key={date}>
                                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                                            {canManage && (
                                                <TableCell className="py-2 pl-4">
                                                    <Checkbox
                                                        checked={allOn}
                                                        disabled={ready.length === 0}
                                                        onCheckedChange={(v) => toggleIds(ready, !!v)}
                                                        aria-label={`Select ${fmtDate(date)}`}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell colSpan={columns - (canManage ? 1 : 0)} className="py-2 pr-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setCollapsed((c) => (open ? [...c, date] : c.filter((d) => d !== date)))}
                                                        className="inline-flex items-center gap-1.5 text-sm font-semibold"
                                                        aria-expanded={open}
                                                    >
                                                        <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
                                                        {date === today ? 'Today, ' : ''}
                                                        {fmtDate(date, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                                                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                                                            {rows.length} {rows.length === 1 ? 'entry' : 'entries'} ·{' '}
                                                            {hours(rows.reduce((t, e) => t + dayHours(e), 0))} h
                                                            {unapproved > 0 && (
                                                                <span className="text-amber-600 dark:text-amber-400"> · {unapproved} unapproved</span>
                                                            )}
                                                        </span>
                                                    </button>
                                                    {canManage && ready.length > 0 && (
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            onClick={() => onApproveDay(ready)}
                                                            className="text-primary text-xs font-medium hover:underline disabled:opacity-50"
                                                        >
                                                            Approve day ({ready.length})
                                                        </button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        {open &&
                                            rows.map((e) => (
                                                <EntryRow
                                                    key={e.id}
                                                    entry={e}
                                                    perspective={perspective}
                                                    today={today}
                                                    busy={busy}
                                                    selected={selected.includes(e.id)}
                                                    onToggle={(on) => toggleIds([e.id], on)}
                                                    {...actions}
                                                />
                                            ))}
                                    </React.Fragment>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
            <Pager page={entries} />
        </div>
    );
}

function EntryRow({
    entry: e,
    perspective,
    today,
    busy,
    selected,
    onToggle,
    onApprove,
    onReject,
    onReopen,
    onVerify,
    onEdit,
    onRequest,
}: { entry: DtrRow; perspective: Perspective; today: string; busy: boolean; selected: boolean; onToggle: (on: boolean) => void } & RowActions) {
    const { canManage, canViewTeam } = perspective;
    const fix = e.pending_correction;
    const locked = e.status === 'locked';
    // Clocked in today and not out yet: still working, not a missing punch.
    const working = e.work_date === today && !!e.time_in && !e.time_out;
    const incomplete = e.attendance_status === 'incomplete' && !working;
    const note = htmlToText(e.accomplishment) || e.notes || '';
    const late = Number(e.tardiness_minutes);
    const undertime = Number(e.undertime_minutes);

    return (
        <TableRow data-state={selected ? 'selected' : undefined} className={cn('align-top', e.status === 'rejected' && 'text-muted-foreground')}>
            {canManage && (
                <TableCell className="pl-4">
                    <Checkbox
                        checked={selected}
                        disabled={!bulkReady(e) || working}
                        onCheckedChange={(v) => onToggle(!!v)}
                        aria-label="Select entry"
                    />
                </TableCell>
            )}
            {canViewTeam && (
                <TableCell>
                    <div className="flex items-center gap-2">
                        <PersonAvatar src={e.employee?.avatar_url} seed={e.employee?.employee_code ?? String(e.employee_id)} className="size-7" />
                        <div className="min-w-0">
                            <div className="truncate text-sm">{fullName(e.employee)}</div>
                            <div className="text-muted-foreground truncate text-[11px]">{e.employee?.position}</div>
                        </div>
                    </div>
                </TableCell>
            )}
            <TableCell className="text-sm whitespace-nowrap tabular-nums">
                <span className={cn(fix && 'line-through opacity-60')}>
                    {e.time_in ? fmtTime(e.time_in) : <span className="text-rose-600 dark:text-rose-400">Missing</span>}
                    {' - '}
                    {e.time_out ? (
                        fmtTime(e.time_out)
                    ) : working ? (
                        <span className="text-sky-700 dark:text-sky-300">now</span>
                    ) : incomplete ? (
                        <span className="text-rose-600 dark:text-rose-400">Missing</span>
                    ) : (
                        '—'
                    )}
                </span>
                {fix && (fix.requested_time_in || fix.requested_time_out) && (
                    <div className="text-xs font-medium text-sky-700 dark:text-sky-300" title={`Correction: “${fix.reason}”`}>
                        → {fmtTime(fix.requested_time_in ?? e.time_in)} - {fmtTime(fix.requested_time_out ?? e.time_out)}
                    </div>
                )}
                {e.day_type !== 'regular' && (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-violet-700 dark:text-violet-300">
                        <CalendarClock className="size-3" /> {DAY_TYPE[e.day_type] ?? e.day_type}
                    </div>
                )}
            </TableCell>
            <TableCell className="text-sm whitespace-nowrap tabular-nums">
                {working ? <span className="text-muted-foreground">—</span> : hours(dayHours(e))}
                {Number(e.ot_hours_approved) > 0 && (
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400">incl. {hours(e.ot_hours_approved)} OT</div>
                )}
                {late > 0 && <div className="text-[11px] text-amber-600 dark:text-amber-400">Late {fmtMinutes(late)}</div>}
                {undertime > 0 && <div className="text-[11px] text-amber-600 dark:text-amber-400">UT {fmtMinutes(undertime)}</div>}
            </TableCell>
            <TableCell>
                <div className="text-muted-foreground flex items-center gap-2">
                    {e.location_status && (
                        <MapPin
                            className={cn('size-4', e.location_status === 'out_of_bounds' && 'text-amber-500')}
                            aria-label={e.location_status === 'out_of_bounds' ? 'Clocked outside the branch' : 'Clocked at the branch'}
                        >
                            <title>
                                {e.location_status === 'out_of_bounds'
                                    ? `Clocked outside the branch${e.distance_meters ? ` (${Math.round(Number(e.distance_meters))} m away)` : ''}`
                                    : 'Clocked at the branch'}
                            </title>
                        </MapPin>
                    )}
                    {e.break_out && (
                        <Coffee className="size-4" aria-label="Break">
                            <title>{`Break ${fmtTime(e.break_out)} - ${e.break_in ? fmtTime(e.break_in) : 'still on break'}`}</title>
                        </Coffee>
                    )}
                    {e.source === 'official_business' && (
                        <Briefcase className="size-4 text-emerald-600 dark:text-emerald-400" aria-label="Official business">
                            <title>Official business</title>
                        </Briefcase>
                    )}
                    {fix && (
                        <FilePenLine className="size-4 text-sky-600 dark:text-sky-400" aria-label="Correction requested">
                            <title>{`Correction requested: “${fix.reason}”`}</title>
                        </FilePenLine>
                    )}
                </div>
            </TableCell>
            <TableCell className="max-w-[320px] whitespace-normal">
                {note ? (
                    <p className="line-clamp-2 text-sm" title={note}>
                        {note}
                    </p>
                ) : (
                    <span className="text-muted-foreground/60 text-sm">—</span>
                )}
            </TableCell>
            <TableCell>
                <StatusPill
                    status={working && e.status === 'open' ? 'working' : e.status}
                    title={e.approver ? `${STATUS_PILL[e.status].label} by ${e.approver.firstname} ${e.approver.lastname}` : undefined}
                />
            </TableCell>
            <TableCell className="pr-4 text-right whitespace-nowrap">
                {locked ? (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        <Lock className="size-3" /> In payroll
                    </span>
                ) : canManage ? (
                    <SplitAction label="Edit" onClick={() => onEdit(e)}>
                        {e.status === 'open' && (
                            <>
                                <DropdownMenuItem disabled={busy || working || !canApproveDay(e)} onClick={() => onApprove(e)}>
                                    <Check className="size-4" /> {fix ? 'Approve with correction' : 'Approve'}
                                </DropdownMenuItem>
                                <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => onReject(e)}>
                                    <X className="size-4" /> Decline
                                </DropdownMenuItem>
                                {(working || !canApproveDay(e)) && (
                                    <p className="text-muted-foreground max-w-[220px] px-2 py-1 text-[11px]">
                                        {working ? 'Still clocked in: approve after check-out.' : 'Missing punch: edit the times before approving.'}
                                    </p>
                                )}
                            </>
                        )}
                        {(e.status === 'approved' || e.status === 'rejected') && (
                            <DropdownMenuItem disabled={busy} onClick={() => onReopen(e)}>
                                <Undo2 className="size-4" /> Back to unapproved
                            </DropdownMenuItem>
                        )}
                        {e.location_status === 'out_of_bounds' && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem disabled={busy} onClick={() => onVerify(e)}>
                                    <MapPinCheck className="size-4" /> Accept location
                                </DropdownMenuItem>
                            </>
                        )}
                    </SplitAction>
                ) : fix ? (
                    <span className="text-muted-foreground text-xs">Correction sent</span>
                ) : working ? (
                    <span className="text-muted-foreground text-xs">In progress</span>
                ) : (
                    <SplitAction label="Request fix" onClick={() => onRequest(e)} />
                )}
            </TableCell>
        </TableRow>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Shared pieces (also used by the Overtime tab)
 * -------------------------------------------------------------------------------------------- */

/** Small segmented filter; an option's optional count shows as a pill (amber when `alert`). */
export function Segmented({
    value,
    options,
    onChange,
}: {
    value: string;
    options: { v: string; l: string; n?: number; alert?: boolean }[];
    onChange: (v: string) => void;
}) {
    return (
        <div className="bg-muted inline-flex rounded-md border p-0.5">
            {options.map((o) => (
                <button
                    key={o.v || ALL}
                    type="button"
                    onClick={() => onChange(o.v)}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        value === o.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {o.l}
                    {o.n !== undefined && (
                        <span
                            className={cn(
                                'rounded-full px-1.5 text-[10px] leading-4 tabular-nums',
                                o.alert && o.n > 0 ? 'bg-amber-500 text-white' : 'bg-background text-muted-foreground ring-border ring-1',
                            )}
                        >
                            {o.n}
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
}

export function Pager({ page }: { page: Paginated<unknown> }) {
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
                    {page.current_page} / {Math.max(1, page.last_page)}
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
