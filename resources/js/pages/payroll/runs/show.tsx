import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    AlertCircle,
    AlertTriangle,
    BookCheck,
    Check,
    ChevronDown,
    Download,
    FileSpreadsheet,
    Info,
    Landmark,
    Plus,
    RotateCcw,
    Search,
    ShieldCheck,
    Undo2,
    XCircle,
} from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { hasAnyPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';
import { AdjustmentDialog, PayslipDialog, ReleaseDialog } from './components';
import { fmtDate, fmtRange, PAYROLL_URL, peso, remittanceDue, RUN_STATUS, stepIndex, STEPS, TONE, type AdjustmentCategory, type Check as CheckItem, type PayslipRow, type RunStatus } from './lib';

type Stamp = { at: string | null; by: string | null };
type EntryRef = { id: number; entry_no: string; status: string } | null;

type Props = {
    run: {
        id: number;
        run_no: string;
        status: RunStatus;
        headcount: number;
        notes: string | null;
        gross_total: number;
        deduction_total: number;
        net_total: number;
        employer_total: number;
        contribution_share: number;
        period: { id: number; code: string; frequency: string; status: string; start_date: string; end_date: string; pay_date: string | null; second_cutoff: boolean };
        timeline: {
            computed: Stamp;
            approved: Stamp;
            posted: Stamp & { entry: EntryRef };
            paid: Stamp & { on: string | null; bank: string | null; entry: EntryRef };
        };
    };
    checks: CheckItem[];
    payslips: PayslipRow[];
    totals: Record<
        | 'basic_pay'
        | 'deductions_from_basic'
        | 'ot_pay'
        | 'holiday_pay'
        | 'allowances'
        | 'gross_pay'
        | 'contributions'
        | 'withholding_tax'
        | 'other_deductions'
        | 'benefit_deductions'
        | 'net_pay'
        | 'employer'
        | 'employer_benefits'
        | 'thirteenth_month',
        number
    >;
    remittances: { agency: string; form: string; employee: number; employer: number; ec: number }[];
    adjustmentCategories: AdjustmentCategory[];
    bankAccounts: { id: number; name: string; bank_name: string | null; account_number: string | null }[];
};

type Confirm = { title: string; description: string; label: string; url: string; destructive?: boolean } | null;

export default function PayrollRunPage({ run, checks, payslips, totals, remittances, adjustmentCategories, bankAccounts }: Props) {
    const { auth } = usePage<SharedData>().props;
    const canManage = hasAnyPermission(auth, ['payroll.manage']);
    const canRun = hasAnyPermission(auth, ['payroll.run']);
    const { period } = run;
    const isDraft = run.status === 'draft';

    const [tab, setTab] = React.useState<'register' | 'remittances' | 'accounting'>('register');
    const [query, setQuery] = React.useState('');
    const [selected, setSelected] = React.useState<PayslipRow | null>(null);
    const [adjustFor, setAdjustFor] = React.useState<number | null | undefined>(undefined); // undefined = closed
    const [releaseOpen, setReleaseOpen] = React.useState(false);
    const [confirm, setConfirm] = React.useState<Confirm>(null);
    const [busy, setBusy] = React.useState(false);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Payroll', href: `${PAYROLL_URL}?year=${period.start_date.slice(0, 4)}` },
        { title: period.code, href: `${PAYROLL_URL}/${run.id}` },
    ];

    const act = (url: string, method: 'post' | 'delete' = 'post') => {
        setBusy(true);
        router.visit(url, { method, preserveScroll: true, onFinish: () => setBusy(false), onSuccess: () => setConfirm(null) });
    };

    const needle = query.trim().toLowerCase();
    const rows = needle
        ? payslips.filter((p) => `${p.employee?.name} ${p.employee?.employee_code} ${p.employee?.position ?? ''} ${p.employee?.department ?? ''}`.toLowerCase().includes(needle))
        : payslips;
    const errors = checks.filter((c) => c.level === 'error').length;
    const employerCost = run.gross_total + run.employer_total;

    // Keep the open payslip in sync after a recompute.
    const current = selected ? (payslips.find((p) => p.id === selected.id) ?? payslips.find((p) => p.employee?.id === selected.employee?.id) ?? null) : null;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Payroll ${period.code}`} />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                {/* Header */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-xl font-semibold tracking-tight">Payroll · {fmtRange(period.start_date, period.end_date)}</h1>
                            <Badge variant="outline" className={TONE[RUN_STATUS[run.status].tone]}>
                                {RUN_STATUS[run.status].label}
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            <span className="font-mono">{run.run_no}</span>
                            {period.pay_date && ` · pay day ${fmtDate(period.pay_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
                            {` · ${period.frequency === 'monthly' ? 'monthly' : period.second_cutoff ? '2nd cut-off' : '1st cut-off'}`}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline">
                                    <Download className="size-4" /> Export <ChevronDown className="size-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                    <a href={`${PAYROLL_URL}/${run.id}/export/register`}>
                                        <FileSpreadsheet className="size-4" /> Payroll register (CSV)
                                    </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <a href={`${PAYROLL_URL}/${run.id}/export/bank`}>
                                        <Landmark className="size-4" /> Bank disbursement list (CSV)
                                    </a>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {isDraft && canManage && (
                            <>
                                <Button
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() =>
                                        setConfirm({
                                            title: 'Void this draft?',
                                            description: 'The draft and its adjustments are discarded and the period can be computed again from scratch.',
                                            label: 'Void draft',
                                            url: `${PAYROLL_URL}/${run.id}/void`,
                                            destructive: true,
                                        })
                                    }
                                >
                                    <XCircle className="size-4" /> Void
                                </Button>
                                <Button variant="outline" disabled={busy} onClick={() => act(`${PAYROLL_URL}/${run.id}/recompute`)}>
                                    <RotateCcw className={cn('size-4', busy && 'animate-spin')} /> Recompute
                                </Button>
                            </>
                        )}
                        {isDraft && canRun && (
                            <Button
                                disabled={busy || errors > 0}
                                title={errors > 0 ? 'Fix the blocking issues first' : undefined}
                                onClick={() =>
                                    setConfirm({
                                        title: `Approve payroll for ${run.headcount} employees?`,
                                        description: `Net pay ${peso(run.net_total)}. Time records from ${fmtRange(period.start_date, period.end_date)} will be locked so they cannot change.`,
                                        label: 'Approve payroll',
                                        url: `${PAYROLL_URL}/${run.id}/approve`,
                                    })
                                }
                            >
                                <ShieldCheck className="size-4" /> Approve
                            </Button>
                        )}
                        {run.status === 'approved' && canRun && (
                            <>
                                <Button variant="outline" disabled={busy} onClick={() => act(`${PAYROLL_URL}/${run.id}/reopen`)}>
                                    <Undo2 className="size-4" /> Return to draft
                                </Button>
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        setConfirm({
                                            title: 'Post payroll to the general ledger?',
                                            description: `Creates a journal entry for gross pay ${peso(run.gross_total)} and employer contributions ${peso(run.employer_total)}, crediting SSS, PhilHealth, Pag-IBIG, withholding tax and salaries payable.`,
                                            label: 'Post to GL',
                                            url: `${PAYROLL_URL}/${run.id}/post`,
                                        })
                                    }
                                >
                                    <BookCheck className="size-4" /> Post to GL
                                </Button>
                            </>
                        )}
                        {run.status === 'posted' && canRun && (
                            <Button onClick={() => setReleaseOpen(true)}>
                                <Landmark className="size-4" /> Release pay
                            </Button>
                        )}
                    </div>
                </div>

                <Stepper run={run} />

                {/* Totals */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                    <Tile label="Employees" value={String(run.headcount)} />
                    <Tile label="Gross pay" value={peso(run.gross_total)} />
                    <Tile label="Deductions" value={peso(run.deduction_total)} hint={`Contributions ${peso(totals.contributions)} · tax ${peso(totals.withholding_tax)}`} />
                    <Tile label="Net pay" value={peso(run.net_total)} emphasis />
                    <Tile label="Total employer cost" value={peso(employerCost)} hint={`Gross + ${peso(run.employer_total)} employer contributions`} />
                </div>

                {checks.length > 0 && <Checks checks={checks} isDraft={isDraft} />}

                {/* Tabs */}
                <div className="border-b">
                    <nav className="-mb-px flex gap-1 overflow-x-auto">
                        {(
                            [
                                ['register', 'Payroll register'],
                                ['remittances', 'Remittances'],
                                ['accounting', 'Accounting'],
                            ] as const
                        ).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setTab(id)}
                                className={cn(
                                    'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                                    tab === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </nav>
                </div>

                {tab === 'register' && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full sm:w-72">
                                <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee…" className="pl-8" />
                            </div>
                            <p className="text-xs text-muted-foreground">Click a row for the full payslip.</p>
                            {isDraft && canManage && (
                                <Button variant="outline" className="sm:ml-auto" onClick={() => setAdjustFor(null)}>
                                    <Plus className="size-4" /> Add adjustment
                                </Button>
                            )}
                        </div>
                        <Register rows={rows} totals={totals} filtered={!!needle} onOpen={setSelected} />
                    </div>
                )}

                {tab === 'remittances' && <Remittances remittances={remittances} period={period} share={run.contribution_share} />}

                {tab === 'accounting' && <Accounting run={run} totals={totals} />}
            </div>

            <PayslipDialog
                payslip={current}
                period={period}
                editable={isDraft && canManage}
                onClose={() => setSelected(null)}
                onAdd={(employeeId) => setAdjustFor(employeeId)}
                onRemoveAdjustment={(id) => act(`${PAYROLL_URL}/${run.id}/adjustments/${id}`, 'delete')}
            />
            <AdjustmentDialog
                open={adjustFor !== undefined}
                onOpenChange={(o) => !o && setAdjustFor(undefined)}
                runId={run.id}
                employeeId={adjustFor ?? null}
                payslips={payslips}
                categories={adjustmentCategories}
            />
            <ReleaseDialog open={releaseOpen} onOpenChange={setReleaseOpen} runId={run.id} net={run.net_total} payDate={period.pay_date} bankAccounts={bankAccounts} />
            <ConfirmDialog
                open={confirm !== null}
                onOpenChange={(o) => !o && setConfirm(null)}
                title={confirm?.title ?? ''}
                description={confirm?.description ?? ''}
                confirmLabel={confirm?.label}
                variant={confirm?.destructive ? 'destructive' : 'default'}
                loading={busy}
                onConfirm={() => confirm && act(confirm.url)}
            />
        </AppLayout>
    );
}

function Tile({ label, value, hint, emphasis }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
    return (
        <div className={cn('rounded-xl border bg-card p-3.5 shadow-sm', emphasis && 'border-emerald-300 dark:border-emerald-800')}>
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className={cn('mt-1 font-mono text-lg font-semibold tabular-nums', emphasis && 'text-emerald-700 dark:text-emerald-400')}>{value}</p>
            {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}

function Stepper({ run }: { run: Props['run'] }) {
    const done = stepIndex(run.status);
    const stamp = (key: (typeof STEPS)[number]['key']) => run.timeline[key];
    const when = (at: string | null) => (at ? new Date(at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null);

    return (
        <ol className="grid gap-2 rounded-xl border bg-card p-3 shadow-sm sm:grid-cols-4">
            {STEPS.map((s, i) => {
                const st = stamp(s.key);
                const complete = i < done;
                const current = i === done;
                return (
                    <li key={s.key} className="flex items-start gap-2.5">
                        <span
                            className={cn(
                                'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                                complete ? 'border-primary bg-primary text-primary-foreground' : current ? 'border-primary text-primary' : 'text-muted-foreground',
                            )}
                        >
                            {complete ? <Check className="size-3.5" /> : i + 1}
                        </span>
                        <div className="min-w-0">
                            <p className={cn('text-sm font-medium', !complete && !current && 'text-muted-foreground')}>{s.label}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                                {complete && st.at ? `${when(st.at)}${st.by ? ` · ${st.by}` : ''}` : current ? 'Next' : '—'}
                            </p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

const CHECK_ICON = { error: AlertCircle, warning: AlertTriangle, info: Info } as const;
const CHECK_TONE = { error: TONE.rose, warning: TONE.amber, info: 'bg-muted/40' } as const;
const CHECK_LINK: Record<string, [string, string]> = {
    open_records: ['/employee-management/attendance?view=timesheets', 'Open timesheets'],
    incomplete: ['/employee-management/attendance?view=timesheets&exceptions_only=1', 'Fix missing punches'],
    pending_requests: ['/employee-management/requests?view=inbox', 'Open approvals'],
    no_record_days: ['/employee-management/attendance?view=timesheets', 'Open timesheets'],
    no_bank: ['/libraries/employees', 'Employee Directory'],
    missing_ids: ['/libraries/employees', 'Employee Directory'],
};

function Checks({ checks, isDraft }: { checks: CheckItem[]; isDraft: boolean }) {
    return (
        <section className="space-y-2">
            <h2 className="text-sm font-semibold">{isDraft ? 'Before you approve' : 'Notes from review'}</h2>
            <ul className="grid gap-2 lg:grid-cols-2">
                {checks.map((c) => {
                    const Icon = CHECK_ICON[c.level];
                    const link = CHECK_LINK[c.key];
                    return (
                        <li key={c.key} className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm', CHECK_TONE[c.level])}>
                            <Icon className="mt-0.5 size-4 shrink-0" />
                            <p className="flex-1">
                                <span className="font-semibold">{c.count}</span> {c.message}
                            </p>
                            {link && isDraft && (
                                <Link href={link[0]} className="shrink-0 text-xs font-medium underline-offset-2 hover:underline">
                                    {link[1]}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ul>
            {isDraft && <p className="text-[11px] text-muted-foreground">After fixing time records or deciding requests, Recompute to pick up the changes.</p>}
        </section>
    );
}

function Register({ rows, totals, filtered, onOpen }: { rows: PayslipRow[]; totals: Props['totals']; filtered: boolean; onOpen: (p: PayslipRow) => void }) {
    const num = 'text-right font-mono text-xs tabular-nums whitespace-nowrap';
    const dash = (n: number, negative = false) => (n ? `${negative ? '−' : ''}${peso(n)}` : <span className="text-muted-foreground/50">—</span>);

    return (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="min-w-56">Employee</TableHead>
                        <TableHead className="text-right">Basic</TableHead>
                        <TableHead className="text-right" title="Absences, late, undertime, unpaid leave">Less: absences / late</TableHead>
                        <TableHead className="text-right" title="Overtime, holiday & rest-day premiums, night differential, allowances">Other earnings</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right" title="SSS, PhilHealth, Pag-IBIG (employee share)">Contributions</TableHead>
                        <TableHead className="text-right">W/tax</TableHead>
                        <TableHead className="text-right" title="Loans, cash advances, other">Other ded.</TableHead>
                        <TableHead className="text-right">Net pay</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                                No employees match.
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((p) => {
                            const lessBasic = p.absences + p.tardiness + p.unpaid_leave;
                            const other = p.ot_pay + p.holiday_pay + p.night_diff_pay + p.taxable_allowances + p.non_taxable_allowances;
                            const warnings = p.meta.warnings ?? [];
                            return (
                                <TableRow key={p.id} className="cursor-pointer" onClick={() => onOpen(p)}>
                                    <TableCell>
                                        <div className="flex items-center gap-2.5">
                                            <PersonAvatar src={p.employee?.avatar_url} seed={p.employee?.employee_code ?? String(p.id)} name={p.employee?.name} className="size-8" />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5 text-sm font-medium">
                                                    <span className="truncate">{p.employee?.name}</span>
                                                    {p.is_mwe && (
                                                        <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-800 dark:bg-sky-950 dark:text-sky-300" title="Minimum wage earner — tax exempt">
                                                            MWE
                                                        </span>
                                                    )}
                                                    {warnings.length > 0 && (
                                                        <span title={warnings.join('\n')}>
                                                            <AlertTriangle className={cn('size-3.5', p.net_pay < 0 ? 'text-rose-600' : 'text-amber-500')} />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="truncate text-[11px] text-muted-foreground">
                                                    {p.employee?.employee_code} · {p.employee?.pay_type === 'monthly' ? 'monthly' : p.employee?.pay_type === 'daily' ? 'daily' : 'hourly'}
                                                    {p.meta.days && ` · ${p.meta.days.worked} day${p.meta.days.worked === 1 ? '' : 's'} worked`}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className={num}>{peso(p.basic_pay)}</TableCell>
                                    <TableCell className={cn(num, lessBasic && 'text-rose-600 dark:text-rose-400')}>{dash(lessBasic, true)}</TableCell>
                                    <TableCell className={num}>{dash(other)}</TableCell>
                                    <TableCell className={cn(num, 'font-semibold')}>{peso(p.gross_pay)}</TableCell>
                                    <TableCell className={num}>{dash(p.sss + p.philhealth + p.pagibig)}</TableCell>
                                    <TableCell className={num}>{dash(p.withholding_tax)}</TableCell>
                                    <TableCell className={num}>{dash(p.other_deductions)}</TableCell>
                                    <TableCell className={cn(num, 'font-semibold', p.net_pay < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400')}>{peso(p.net_pay)}</TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
                {!filtered && rows.length > 0 && (
                    <TableFooter>
                        <TableRow className="font-semibold">
                            <TableCell>Total · {rows.length} employees</TableCell>
                            <TableCell className={num}>{peso(totals.basic_pay)}</TableCell>
                            <TableCell className={num}>{dash(totals.deductions_from_basic, true)}</TableCell>
                            <TableCell className={num}>{dash(totals.ot_pay + totals.holiday_pay + totals.allowances)}</TableCell>
                            <TableCell className={num}>{peso(totals.gross_pay)}</TableCell>
                            <TableCell className={num}>{peso(totals.contributions)}</TableCell>
                            <TableCell className={num}>{peso(totals.withholding_tax)}</TableCell>
                            <TableCell className={num}>{dash(totals.other_deductions)}</TableCell>
                            <TableCell className={num}>{peso(totals.net_pay)}</TableCell>
                        </TableRow>
                    </TableFooter>
                )}
            </Table>
        </div>
    );
}

function Remittances({ remittances, period, share }: { remittances: Props['remittances']; period: Props['run']['period']; share: number }) {
    const num = 'text-right font-mono text-sm tabular-nums';
    const total = remittances.reduce((a, r) => a + r.employee + r.employer + r.ec, 0);
    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                What this payroll adds to the monthly remittances for {fmtDate(period.end_date, { month: 'long', year: 'numeric' })}.{' '}
                {share === 0.5
                    ? 'Contributions are split across both cut-offs, so the month’s total is this cut-off plus the other.'
                    : share === 1
                      ? 'This cut-off carries the full monthly contribution.'
                      : 'No contributions are deducted on this cut-off.'}
            </p>
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>Agency</TableHead>
                            <TableHead className="text-right">Employee share</TableHead>
                            <TableHead className="text-right">Employer share</TableHead>
                            <TableHead className="text-right">EC</TableHead>
                            <TableHead className="text-right">To remit</TableHead>
                            <TableHead>Deadline</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {remittances.map((r) => (
                            <TableRow key={r.agency}>
                                <TableCell>
                                    <div className="font-medium">{r.agency}</div>
                                    <div className="text-[11px] text-muted-foreground">{r.form}</div>
                                </TableCell>
                                <TableCell className={num}>{peso(r.employee)}</TableCell>
                                <TableCell className={num}>{r.agency === 'BIR' ? '—' : peso(r.employer)}</TableCell>
                                <TableCell className={num}>{r.agency === 'SSS' ? peso(r.ec) : '—'}</TableCell>
                                <TableCell className={cn(num, 'font-semibold')}>{peso(r.employee + r.employer + r.ec)}</TableCell>
                                <TableCell className="text-sm whitespace-nowrap">{remittanceDue(r.agency, period.end_date)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="font-semibold">
                            <TableCell colSpan={4}>Total for this payroll</TableCell>
                            <TableCell className={num}>{peso(total)}</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
            <p className="text-[11px] text-muted-foreground">
                Deadlines are tracked in{' '}
                <Link href="/employee-management/compliance" className="underline underline-offset-2">
                    Compliance Mgmt
                </Link>
                . PhilHealth and Pag-IBIG due dates depend on your employer number; BIR eFPS filers file 1601-C between the 11th and 15th.
            </p>
        </div>
    );
}

function Accounting({ run, totals }: { run: Props['run']; totals: Props['totals'] }) {
    const { posted, paid } = run.timeline;
    const num = 'text-right font-mono text-sm tabular-nums';
    const contributionsPayable = totals.contributions + totals.employer;
    const lines: [string, number, number][] = [
        ['6000 Salaries and Wages', totals.gross_pay, 0],
        ['6010 Employer Statutory Contributions', totals.employer, 0],
        ['6020 Employee Benefits Expense', totals.employer_benefits, 0],
        ['2400–2420 SSS / PhilHealth / Pag-IBIG Payable', 0, contributionsPayable],
        ['2430 Withholding Tax Payable', 0, totals.withholding_tax],
        ['2440 Other Payroll Deductions Payable', 0, totals.other_deductions - totals.benefit_deductions],
        ['2450 Employee Benefits Payable', 0, totals.benefit_deductions + totals.employer_benefits],
        ['2500 Salaries Payable', 0, totals.net_pay],
    ];

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>{posted.entry ? `Journal entry ${posted.entry.entry_no}` : 'Journal entry on posting (preview)'}</TableHead>
                            <TableHead className="text-right">Debit</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {lines
                            .filter(([, d, c]) => d || c)
                            .map(([account, d, c]) => (
                                <TableRow key={account}>
                                    <TableCell className={cn('text-sm', c && 'pl-8')}>{account}</TableCell>
                                    <TableCell className={num}>{d ? peso(d) : ''}</TableCell>
                                    <TableCell className={num}>{c ? peso(c) : ''}</TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow className="font-semibold">
                            <TableCell>Total</TableCell>
                            <TableCell className={num}>{peso(totals.gross_pay + totals.employer + totals.employer_benefits)}</TableCell>
                            <TableCell className={num}>
                                {peso(contributionsPayable + totals.withholding_tax + totals.other_deductions + totals.employer_benefits + totals.net_pay)}
                            </TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            </div>
            <aside className="space-y-3 rounded-xl border bg-card p-4 text-sm shadow-sm">
                <div>
                    <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Payroll entry</p>
                    {posted.entry ? (
                        <p>
                            <Link href={`/accounting/journal-entries/${posted.entry.id}`} className="font-mono text-primary hover:underline">
                                {posted.entry.entry_no}
                            </Link>{' '}
                            <span className="text-muted-foreground">({posted.entry.status})</span>
                        </p>
                    ) : (
                        <p className="text-muted-foreground">Created when the payroll is posted.</p>
                    )}
                </div>
                <div>
                    <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Payment entry</p>
                    {paid.entry ? (
                        <p>
                            <Link href={`/accounting/journal-entries/${paid.entry.id}`} className="font-mono text-primary hover:underline">
                                {paid.entry.entry_no}
                            </Link>{' '}
                            <span className="text-muted-foreground">
                                · {paid.on && fmtDate(paid.on, { month: 'short', day: 'numeric', year: 'numeric' })}
                                {paid.bank && ` via ${paid.bank}`}
                            </span>
                        </p>
                    ) : (
                        <p className="text-muted-foreground">Dr Salaries Payable / Cr bank — created on release.</p>
                    )}
                </div>
                <div>
                    <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">13th month accrual</p>
                    <p className="font-mono">{peso(totals.thirteenth_month)}</p>
                    <p className="text-[11px] text-muted-foreground">1/12 of basic pay earned this cut-off (PD 851).</p>
                </div>
            </aside>
        </div>
    );
}
