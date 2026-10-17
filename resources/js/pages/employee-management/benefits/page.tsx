import { ConfirmDialog, useConfirm } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SegmentedControl, segmentedControlBadgeClass, SegmentedControlItem } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { hasAnyPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    AlertTriangle,
    Archive,
    ArchiveRestore,
    CalendarX,
    Gift,
    HeartHandshake,
    Landmark,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    Trash2,
    UserPlus,
    Users,
} from 'lucide-react';
import * as React from 'react';
import { EndEnrollmentDialog, EnrollDialog, EnrollmentDialog, ModeBadge, ProgramDialog } from './components';
import {
    BENEFITS_URL,
    CATEGORY_LABEL,
    fmtDate,
    MODE,
    peso,
    programAmounts,
    STATUS,
    TONE,
    type ContributionMode,
    type EmployeeRow,
    type Enrollment,
    type EnrollmentStatus,
    type Program,
} from './lib';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management' },
    { title: 'Benefits Admin', href: BENEFITS_URL },
];

type Props = {
    today: string;
    programs: Program[];
    enrollments: Enrollment[];
    employees: EmployeeRow[];
    categories: string[];
};

type Tab = 'enrollments' | 'programs' | 'statutory';
const TABS: Tab[] = ['enrollments', 'programs', 'statutory'];

const readTab = (): Tab => {
    try {
        const t = new URLSearchParams(window.location.search).get('tab');
        return TABS.includes(t as Tab) ? (t as Tab) : 'enrollments';
    } catch {
        return 'enrollments';
    }
};

export default function BenefitsAdministrationPage({ today, programs, enrollments, employees, categories }: Props) {
    const { auth } = usePage<SharedData>().props;
    const canManage = hasAnyPermission(auth, ['payroll.manage', 'libraries.employees.manage']);

    const [tab, setTabState] = React.useState<Tab>(readTab);
    const [programFilter, setProgramFilter] = React.useState('all');
    const [enrollFor, setEnrollFor] = React.useState<{ programId: number | null } | null>(null);
    const [editing, setEditing] = React.useState<Enrollment | null>(null);
    const [ending, setEnding] = React.useState<Enrollment | null>(null);
    const [removing, setRemoving] = React.useState<Enrollment | null>(null);
    const [programDialog, setProgramDialog] = React.useState<{ program: Program | null } | null>(null);

    const setTab = (t: Tab) => {
        setTabState(t);
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', t);
            window.history.replaceState(window.history.state, '', url);
        } catch {
            /* ignore */
        }
    };

    const programById = React.useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs]);
    const employeeById = React.useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
    const companyPrograms = programs.filter((p) => p.payroll_mode !== 'statutory');
    const statutoryPrograms = programs.filter((p) => p.payroll_mode === 'statutory');

    // Monthly figures for enrollments in force today.
    const active = enrollments.filter((e) => e.status === 'active');
    const sumBy = (rows: Enrollment[], mode: string, key: 'employee_share' | 'employer_share') =>
        rows.filter((e) => programById.get(e.program_id)?.payroll_mode === mode).reduce((a, e) => a + e[key], 0);
    const kpi = {
        allowances: sumBy(active, 'earning', 'employer_share'),
        employeeShare: sumBy(active, 'contribution', 'employee_share'),
        employerShare: sumBy(active, 'contribution', 'employer_share'),
        statutoryEmployer: employees.reduce(
            (a, e) => a + e.statutory.sss.employer + e.statutory.sss.ec + e.statutory.philhealth.employer + e.statutory.pagibig.employer,
            0,
        ),
        enrolledEmployees: new Set(active.map((e) => e.employee_id)).size,
    };
    const pendingCount = enrollments.filter((e) => e.status === 'pending').length;
    const reviewCount = enrollments.filter((e) => e.needs_review).length;

    const openEnroll = (programId: number | null = null) => setEnrollFor({ programId });
    const viewEnrollees = (programId: number) => {
        setProgramFilter(String(programId));
        setTab('enrollments');
    };
    const quickStatus = (e: Enrollment, participation_status: Enrollment['participation_status']) =>
        router.put(
            `${BENEFITS_URL}/enrollments/${e.id}`,
            {
                employee_share: e.employee_share,
                employer_share: e.employer_share,
                participation_status,
                effective_date: e.effective_date,
                end_date: e.end_date,
                notes: e.notes,
            },
            { preserveScroll: true },
        );

    const label = (e: Enrollment | null) =>
        e ? `${employeeById.get(e.employee_id)?.name ?? 'Employee'} · ${programById.get(e.program_id)?.name ?? 'Program'}` : '';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Benefits Administration" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading
                        title="Benefits Administration"
                        description="Company benefit programs and who is enrolled. Active enrollments are applied automatically every time a payroll is computed."
                    />
                    {canManage && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" onClick={() => setProgramDialog({ program: null })}>
                                <Gift className="size-4" /> New program
                            </Button>
                            <Button onClick={() => openEnroll()} disabled={companyPrograms.every((p) => !p.is_active)}>
                                <UserPlus className="size-4" /> Enroll employees
                            </Button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Tile label="Allowances / month" value={peso(kpi.allowances)} hint="Paid on payslips" />
                    <Tile label="Employee contributions / month" value={peso(kpi.employeeShare)} hint="Deducted from pay" />
                    <Tile label="Employer premiums / month" value={peso(kpi.employerShare)} hint="Company-paid, booked to 6020" />
                    <Tile
                        label="Statutory employer share / month"
                        value={peso(kpi.statutoryEmployer)}
                        hint="SSS + EC, PhilHealth, Pag-IBIG (estimate)"
                    />
                </div>

                <div
                    className={cn(
                        'flex flex-col gap-2 rounded-lg border px-3.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between',
                        TONE.sky,
                    )}
                >
                    <p>
                        <span className="font-semibold">How this reaches payroll:</span> amounts are monthly — semi-monthly payrolls apply half on
                        each cut-off. Changes take effect the next time a payroll is computed; recompute a draft to pick them up.
                    </p>
                    <Link href="/payroll/runs" className="shrink-0 text-xs font-semibold underline underline-offset-2">
                        Go to Payroll
                    </Link>
                </div>

                {reviewCount > 0 && (
                    <div className={cn('flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm', TONE.amber)}>
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <p>
                            <span className="font-semibold">
                                {reviewCount} {reviewCount === 1 ? 'share needs' : 'shares need'} review.
                            </span>{' '}
                            A salary changed and these shares were worked out from salary. They stay as they are until you edit and save them — the
                            edit form shows the amount at the new salary.
                        </p>
                    </div>
                )}

                <SegmentedControl aria-label="Benefits views">
                    <SegmentedControlItem active={tab === 'enrollments'} onClick={() => setTab('enrollments')}>
                        <Users className="size-4" /> Enrollments
                        <span className={segmentedControlBadgeClass(tab === 'enrollments')}>{enrollments.length}</span>
                    </SegmentedControlItem>
                    <SegmentedControlItem active={tab === 'programs'} onClick={() => setTab('programs')}>
                        <HeartHandshake className="size-4" /> Programs
                        <span className={segmentedControlBadgeClass(tab === 'programs')}>{companyPrograms.length}</span>
                    </SegmentedControlItem>
                    <SegmentedControlItem active={tab === 'statutory'} onClick={() => setTab('statutory')}>
                        <Landmark className="size-4" /> Statutory
                    </SegmentedControlItem>
                </SegmentedControl>

                {tab === 'enrollments' && (
                    <EnrollmentsView
                        enrollments={enrollments}
                        programs={companyPrograms}
                        programById={programById}
                        employeeById={employeeById}
                        programFilter={programFilter}
                        onProgramFilter={setProgramFilter}
                        pendingCount={pendingCount}
                        enrolledEmployees={kpi.enrolledEmployees}
                        totalEmployees={employees.length}
                        canManage={canManage}
                        onEnroll={() => openEnroll(programFilter !== 'all' ? Number(programFilter) : null)}
                        onEdit={setEditing}
                        onEnd={setEnding}
                        onRemove={setRemoving}
                        onStatus={quickStatus}
                    />
                )}

                {tab === 'programs' && (
                    <ProgramsView
                        programs={companyPrograms}
                        canManage={canManage}
                        onNew={() => setProgramDialog({ program: null })}
                        onEdit={(p) => setProgramDialog({ program: p })}
                        onEnroll={(p) => openEnroll(p.id)}
                        onView={(p) => viewEnrollees(p.id)}
                    />
                )}

                {tab === 'statutory' && <StatutoryView employees={employees} programs={statutoryPrograms} />}
            </div>

            {canManage && (
                <>
                    <EnrollDialog
                        open={enrollFor !== null}
                        onOpenChange={(o) => !o && setEnrollFor(null)}
                        programs={programs}
                        employees={employees}
                        enrollments={enrollments}
                        programId={enrollFor?.programId ?? null}
                        today={today}
                    />
                    <EnrollmentDialog
                        enrollment={editing}
                        program={editing ? programById.get(editing.program_id) : undefined}
                        employee={editing ? employeeById.get(editing.employee_id) : undefined}
                        onClose={() => setEditing(null)}
                    />
                    <EndEnrollmentDialog enrollment={ending} label={label(ending)} today={today} onClose={() => setEnding(null)} />
                    <ProgramDialog
                        open={programDialog !== null}
                        program={programDialog?.program ?? null}
                        categories={categories}
                        onClose={() => setProgramDialog(null)}
                    />
                    <ConfirmDialog
                        open={removing !== null}
                        onOpenChange={(o) => !o && setRemoving(null)}
                        title="Remove enrollment?"
                        description={`${label(removing)}. Use this for mistakes only — payslips already computed keep their amounts. To stop a real enrollment, end it instead so the history stays.`}
                        confirmLabel="Remove"
                        variant="destructive"
                        onConfirm={() => removing && router.delete(`${BENEFITS_URL}/enrollments/${removing.id}`, { preserveScroll: true })}
                    />
                </>
            )}
        </AppLayout>
    );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="bg-card rounded-xl border p-3.5 shadow-sm">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">{label}</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
            {hint && <p className="text-muted-foreground mt-0.5 text-[11px]">{hint}</p>}
        </div>
    );
}

function StatusBadge({ status }: { status: EnrollmentStatus }) {
    const s = STATUS[status];
    return (
        <span title={s.hint} className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE[s.tone])}>
            {s.label}
        </span>
    );
}

const fmtDay = (d: string) => fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });

function coverage(e: Enrollment) {
    if (e.effective_date && e.end_date) return `${fmtDay(e.effective_date)} – ${fmtDay(e.end_date)}`;
    if (e.end_date) return `Until ${fmtDay(e.end_date)}`;
    if (e.effective_date) return `Since ${fmtDay(e.effective_date)}`;
    return '—';
}

/* ---------------------------------------------------------------------------------------------- */
/* Enrollments                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

const STATUS_FILTERS: { key: 'current' | EnrollmentStatus | 'all'; label: string }[] = [
    { key: 'current', label: 'Current' },
    { key: 'pending', label: 'Pending' },
    { key: 'waived', label: 'Waived' },
    { key: 'ended', label: 'Ended' },
    { key: 'all', label: 'All' },
];

function EnrollmentsView({
    enrollments,
    programs,
    programById,
    employeeById,
    programFilter,
    onProgramFilter,
    pendingCount,
    enrolledEmployees,
    totalEmployees,
    canManage,
    onEnroll,
    onEdit,
    onEnd,
    onRemove,
    onStatus,
}: {
    enrollments: Enrollment[];
    programs: Program[];
    programById: Map<number, Program>;
    employeeById: Map<number, EmployeeRow>;
    programFilter: string;
    onProgramFilter: (v: string) => void;
    pendingCount: number;
    enrolledEmployees: number;
    totalEmployees: number;
    canManage: boolean;
    onEnroll: () => void;
    onEdit: (e: Enrollment) => void;
    onEnd: (e: Enrollment) => void;
    onRemove: (e: Enrollment) => void;
    onStatus: (e: Enrollment, s: Enrollment['participation_status']) => void;
}) {
    const [query, setQuery] = React.useState('');
    const [status, setStatus] = React.useState<(typeof STATUS_FILTERS)[number]['key']>('current');

    const rows = enrollments.filter((e) => {
        const emp = employeeById.get(e.employee_id);
        const q = query.trim().toLowerCase();
        if (q && ![emp?.name, emp?.employee_code, emp?.department].some((v) => v?.toLowerCase().includes(q))) return false;
        if (programFilter !== 'all' && String(e.program_id) !== programFilter) return false;
        if (status === 'current') return e.status === 'active' || e.status === 'scheduled';
        return status === 'all' || e.status === status;
    });

    const num = 'text-right font-mono text-sm tabular-nums';
    const totals = rows.reduce(
        (a, e) => {
            const earning = programById.get(e.program_id)?.payroll_mode === 'earning';
            return { employee: a.employee + (earning ? 0 : e.employee_share), employer: a.employer + e.employer_share };
        },
        { employee: 0, employer: 0 },
    );

    return (
        <section className="bg-card rounded-xl border shadow-sm">
            <header className="flex flex-col gap-2 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search employee or department"
                            className="pl-8"
                        />
                    </div>
                    <Select value={programFilter} onValueChange={onProgramFilter}>
                        <SelectTrigger className="w-full sm:w-56">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All programs</SelectItem>
                            {programs.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                    {p.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-1">
                        {STATUS_FILTERS.map((f) => (
                            <Button
                                key={f.key}
                                size="sm"
                                variant={status === f.key ? 'default' : 'ghost'}
                                className="h-8"
                                onClick={() => setStatus(f.key)}
                            >
                                {f.label}
                                {f.key === 'pending' && pendingCount > 0 && (
                                    <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{pendingCount}</span>
                                )}
                            </Button>
                        ))}
                    </div>
                </div>
                <span className="text-muted-foreground text-xs">
                    {enrolledEmployees} of {totalEmployees} employees enrolled in at least one program
                </span>
            </header>

            {rows.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                    <Users className="text-muted-foreground/50 size-8" />
                    <div>
                        <p className="text-sm font-medium">
                            {enrollments.length === 0 ? 'No one is enrolled yet' : 'No enrollments match these filters'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                            {enrollments.length === 0
                                ? 'Enroll employees in a program to start applying it to payroll.'
                                : 'Try another status or program.'}
                        </p>
                    </div>
                    {canManage && programs.some((p) => p.is_active) && (
                        <Button size="sm" onClick={onEnroll}>
                            <UserPlus className="size-4" /> Enroll employees
                        </Button>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableHead>Employee</TableHead>
                                <TableHead>Program</TableHead>
                                <TableHead className="text-right">Employee / mo</TableHead>
                                <TableHead className="text-right">Employer / mo</TableHead>
                                <TableHead>Coverage</TableHead>
                                <TableHead>Status</TableHead>
                                {canManage && <TableHead className="w-10" />}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((e) => {
                                const emp = employeeById.get(e.employee_id);
                                const prog = programById.get(e.program_id);
                                const earning = prog?.payroll_mode === 'earning';
                                return (
                                    <TableRow key={e.id} className={cn((e.status === 'ended' || e.status === 'waived') && 'text-muted-foreground')}>
                                        <TableCell>
                                            <div className="flex items-center gap-2.5">
                                                <PersonAvatar
                                                    src={emp?.avatar_url}
                                                    seed={emp?.employee_code ?? String(e.employee_id)}
                                                    name={emp?.name}
                                                    className="size-8"
                                                />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">{emp?.name ?? '—'}</p>
                                                    <p className="text-muted-foreground truncate text-[11px]">
                                                        {emp?.employee_code} · {emp?.position ?? '—'}
                                                    </p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-sm">{prog?.name}</p>
                                            <div className="mt-0.5 flex items-center gap-1.5">
                                                {prog && <ModeBadge mode={prog.payroll_mode} />}
                                                {prog && !prog.is_active && <span className="text-muted-foreground text-[10px]">archived</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className={num}>
                                            {earning ? <span className="text-muted-foreground">—</span> : peso(e.employee_share)}
                                        </TableCell>
                                        <TableCell className={num}>
                                            {peso(e.employer_share)}
                                            {earning && <span className="text-muted-foreground block text-[10px]">allowance</span>}
                                        </TableCell>
                                        <TableCell className="text-sm whitespace-nowrap">
                                            {coverage(e)}
                                            {e.notes && (
                                                <p className="text-muted-foreground max-w-56 truncate text-[11px]" title={e.notes}>
                                                    {e.notes}
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={e.status} />
                                            {e.needs_review && (
                                                <Badge
                                                    variant="outline"
                                                    className={cn('mt-1 block w-fit text-[10px]', TONE.amber)}
                                                    title={e.review_note ?? undefined}
                                                >
                                                    Review share
                                                </Badge>
                                            )}
                                        </TableCell>
                                        {canManage && (
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="size-8"
                                                            aria-label={`Actions for ${emp?.name}`}
                                                        >
                                                            <MoreHorizontal className="size-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onSelect={() => onEdit(e)}>
                                                            <Pencil className="size-4" /> Edit
                                                        </DropdownMenuItem>
                                                        {e.participation_status === 'pending' && e.status !== 'ended' && (
                                                            <DropdownMenuItem onSelect={() => onStatus(e, 'active')}>
                                                                <Plus className="size-4" /> Activate
                                                            </DropdownMenuItem>
                                                        )}
                                                        {e.participation_status === 'waived' && e.status !== 'ended' && (
                                                            <DropdownMenuItem onSelect={() => onStatus(e, 'active')}>
                                                                <Plus className="size-4" /> Reactivate
                                                            </DropdownMenuItem>
                                                        )}
                                                        {e.participation_status !== 'waived' && e.status !== 'ended' && (
                                                            <DropdownMenuItem onSelect={() => onStatus(e, 'waived')}>
                                                                <Archive className="size-4" /> Mark waived
                                                            </DropdownMenuItem>
                                                        )}
                                                        {e.status !== 'ended' && (
                                                            <DropdownMenuItem onSelect={() => onEnd(e)}>
                                                                <CalendarX className="size-4" /> End enrollment…
                                                            </DropdownMenuItem>
                                                        )}
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(e)}>
                                                            <Trash2 className="size-4" /> Remove
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="font-semibold">
                                <TableCell colSpan={2}>
                                    {rows.length} enrollment{rows.length === 1 ? '' : 's'}
                                </TableCell>
                                <TableCell className={num}>{peso(totals.employee)}</TableCell>
                                <TableCell className={num}>{peso(totals.employer)}</TableCell>
                                <TableCell colSpan={canManage ? 3 : 2} />
                            </TableRow>
                        </TableFooter>
                    </Table>
                </div>
            )}
        </section>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Programs                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

function ProgramsView({
    programs,
    canManage,
    onNew,
    onEdit,
    onEnroll,
    onView,
}: {
    programs: Program[];
    canManage: boolean;
    onNew: () => void;
    onEdit: (p: Program) => void;
    onEnroll: (p: Program) => void;
    onView: (p: Program) => void;
}) {
    const [showArchived, setShowArchived] = React.useState(false);
    const confirm = useConfirm();
    const archived = programs.filter((p) => !p.is_active).length;

    const toggle = async (p: Program) => {
        const ok = await confirm(
            p.is_active
                ? {
                      title: `Archive ${p.name}?`,
                      description: 'It stops applying to payroll for every enrolled employee. You can restore it later.',
                      confirmLabel: 'Archive',
                      variant: 'destructive',
                  }
                : {
                      title: `Restore ${p.name}?`,
                      description: 'It applies to payroll again for its enrolled employees from the next computation.',
                      confirmLabel: 'Restore',
                  },
        );
        if (ok) router.post(`${BENEFITS_URL}/programs/${p.id}/toggle`, {}, { preserveScroll: true });
    };
    const shown = programs.filter((p) => showArchived || p.is_active);

    return (
        <div className="space-y-3">
            {archived > 0 && (
                <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>
                        {showArchived ? 'Hide archived' : `Show archived (${archived})`}
                    </Button>
                </div>
            )}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {shown.map((p) => (
                    <article key={p.id} className={cn('bg-card flex flex-col rounded-xl border p-4 shadow-sm', !p.is_active && 'opacity-70')}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h3 className="truncate font-semibold">{p.name}</h3>
                                <p className="text-muted-foreground font-mono text-[11px]">
                                    {p.code} · {CATEGORY_LABEL[p.category] ?? p.category}
                                    {!p.is_active && ' · archived'}
                                </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <ModeBadge mode={p.payroll_mode} />
                                {p.is_global && (
                                    <Badge variant="outline" className="text-[10px]" title="Shared by every branch">
                                        Shared
                                    </Badge>
                                )}
                                {canManage && p.editable && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button size="icon" variant="ghost" className="size-7" aria-label={`Actions for ${p.name}`}>
                                                <MoreHorizontal className="size-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={() => onEdit(p)}>
                                                <Pencil className="size-4" /> Edit program
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => toggle(p)}>
                                                {p.is_active ? <Archive className="size-4" /> : <ArchiveRestore className="size-4" />}
                                                {p.is_active ? 'Archive' : 'Restore'}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        </div>

                        <p className="text-muted-foreground mt-2 line-clamp-2 text-xs">{p.description || MODE[p.payroll_mode].effect}</p>

                        <dl className="bg-muted/40 mt-3 grid grid-cols-2 gap-2 rounded-lg p-2.5 text-xs">
                            <div className="col-span-2">
                                <dt className="text-muted-foreground">Default</dt>
                                <dd className="font-mono font-medium">
                                    {programAmounts(p)}
                                    {p.payroll_mode === 'earning' && (
                                        <span className="text-muted-foreground ml-1 font-sans">({p.is_taxable ? 'taxable' : 'non-taxable'})</span>
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Enrolled now</dt>
                                <dd className="font-medium">{p.enrolled}</dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">Monthly cost</dt>
                                <dd className="font-mono font-medium">{peso(p.monthly_employer)}</dd>
                            </div>
                        </dl>

                        <div className="mt-auto flex gap-2 pt-3">
                            {canManage && p.is_active && (
                                <Button size="sm" variant="outline" className="flex-1" onClick={() => onEnroll(p)}>
                                    <UserPlus className="size-3.5" /> Enroll
                                </Button>
                            )}
                            <Button size="sm" variant="ghost" className="flex-1" onClick={() => onView(p)} disabled={p.enrollments_total === 0}>
                                <Users className="size-3.5" /> View enrollees
                            </Button>
                        </div>
                    </article>
                ))}

                {canManage && (
                    <button
                        type="button"
                        onClick={onNew}
                        className="text-muted-foreground hover:border-primary hover:text-foreground flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm transition-colors"
                    >
                        <Gift className="size-6" />
                        <span className="font-medium">New program</span>
                        <span className="px-6 text-center text-xs">Allowance, HMO, insurance, savings plan…</span>
                    </button>
                )}
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Statutory                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

/** Marks a contribution set to "not deducted" on the employee record. */
function ModeTag({ mode }: { mode: ContributionMode }) {
    if (mode === 'auto') return null;
    return <span className="text-muted-foreground block font-sans text-[10px]">Not deducted</span>;
}

function StatutoryView({ employees, programs }: { employees: EmployeeRow[]; programs: Program[] }) {
    const num = 'text-right font-mono text-sm tabular-nums';
    const totals = employees.reduce(
        (a, e) => {
            const s = e.statutory;
            return {
                sssEe: a.sssEe + s.sss.employee,
                sssEr: a.sssEr + s.sss.employer + s.sss.ec,
                phEe: a.phEe + s.philhealth.employee,
                phEr: a.phEr + s.philhealth.employer,
                hdmfEe: a.hdmfEe + s.pagibig.employee,
                hdmfEr: a.hdmfEr + s.pagibig.employer,
            };
        },
        { sssEe: 0, sssEr: 0, phEe: 0, phEr: 0, hdmfEe: 0, hdmfEr: 0 },
    );
    const missing = employees.filter((e) => e.missing_ids.length > 0).length;

    return (
        <div className="space-y-3">
            <div className="bg-card rounded-xl border p-4 text-sm shadow-sm">
                <p className="font-semibold">{programs.map((p) => p.name).join(' · ') || 'SSS · PhilHealth · Pag-IBIG'}</p>
                <p className="text-muted-foreground mt-1">
                    Mandatory for every employee and computed by payroll each cut-off — nothing to enroll. The figures below are a monthly estimate
                    from each employee’s rate. Daily and hourly-paid staff are estimated at a full month; payroll uses what they actually earned.
                    Contributions set to not deducted on the employee’s record in the Employee Directory are marked.
                </p>
                {missing > 0 && (
                    <p className={cn('mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs', TONE.amber)}>
                        <AlertTriangle className="size-3.5" /> {missing} employee{missing === 1 ? ' is' : 's are'} missing a government ID needed for
                        remittance.
                    </p>
                )}
            </div>

            <div className="bg-card overflow-x-auto rounded-xl border shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead rowSpan={2}>Employee</TableHead>
                            <TableHead rowSpan={2} className="text-right">
                                Monthly basis
                            </TableHead>
                            <TableHead colSpan={2} className="border-l text-center">
                                SSS
                            </TableHead>
                            <TableHead colSpan={2} className="border-l text-center">
                                PhilHealth
                            </TableHead>
                            <TableHead colSpan={2} className="border-l text-center">
                                Pag-IBIG
                            </TableHead>
                        </TableRow>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            {['', '', ''].map((_, i) => (
                                <React.Fragment key={i}>
                                    <TableHead className="border-l text-right">EE</TableHead>
                                    <TableHead className="text-right">ER</TableHead>
                                </React.Fragment>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {employees.map((e) => (
                            <TableRow key={e.id}>
                                <TableCell>
                                    <p className="text-sm font-medium">{e.name}</p>
                                    <p className="text-muted-foreground text-[11px]">
                                        {e.employee_code}
                                        {e.missing_ids.length > 0 && (
                                            <span className="ml-1.5 text-amber-700 dark:text-amber-400">No {e.missing_ids.join(', ')}</span>
                                        )}
                                    </p>
                                </TableCell>
                                <TableCell className={num}>
                                    {peso(e.monthly_rate)}
                                    {e.pay_type !== 'monthly' && (
                                        <span className="text-muted-foreground block text-[10px]">
                                            {peso(e.basic_pay)} {e.pay_type === 'daily' ? '/ day' : '/ hr'}
                                        </span>
                                    )}
                                </TableCell>
                                <TableCell className={cn(num, 'border-l')}>
                                    {peso(e.statutory.sss.employee)}
                                    <ModeTag mode={e.statutory.sss.mode} />
                                </TableCell>
                                <TableCell className={num} title={`Incl. EC ${peso(e.statutory.sss.ec)}`}>
                                    {peso(e.statutory.sss.employer + e.statutory.sss.ec)}
                                </TableCell>
                                <TableCell className={cn(num, 'border-l')}>
                                    {peso(e.statutory.philhealth.employee)}
                                    <ModeTag mode={e.statutory.philhealth.mode} />
                                </TableCell>
                                <TableCell className={num}>{peso(e.statutory.philhealth.employer)}</TableCell>
                                <TableCell className={cn(num, 'border-l')}>
                                    {peso(e.statutory.pagibig.employee)}
                                    <ModeTag mode={e.statutory.pagibig.mode} />
                                </TableCell>
                                <TableCell className={num}>{peso(e.statutory.pagibig.employer)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="font-semibold">
                            <TableCell colSpan={2}>Monthly total · {employees.length} employees</TableCell>
                            <TableCell className={cn(num, 'border-l')}>{peso(totals.sssEe)}</TableCell>
                            <TableCell className={num}>{peso(totals.sssEr)}</TableCell>
                            <TableCell className={cn(num, 'border-l')}>{peso(totals.phEe)}</TableCell>
                            <TableCell className={num}>{peso(totals.phEr)}</TableCell>
                            <TableCell className={cn(num, 'border-l')}>{peso(totals.hdmfEe)}</TableCell>
                            <TableCell className={num}>{peso(totals.hdmfEr)}</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
            <p className="text-muted-foreground text-[11px]">SSS employer share includes EC. Rates and ceilings are set in config/people.php.</p>
        </div>
    );
}
