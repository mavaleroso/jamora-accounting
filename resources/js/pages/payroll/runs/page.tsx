import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { AlertTriangle, ArrowRight, CalendarPlus, CalendarRange, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useConfirm } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { hasAnyPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';
import { fmtDate, fmtRange, PAYROLL_URL, peso, pesoShort, RUN_STATUS, stepIndex, STEPS, TONE, type RunStatus } from './lib';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Payroll', href: PAYROLL_URL }];

type PeriodRow = {
    id: number;
    code: string;
    frequency: 'semi_monthly' | 'monthly';
    status: string;
    start_date: string;
    end_date: string;
    pay_date: string | null;
    run: {
        id: number;
        run_no: string;
        status: RunStatus;
        headcount: number;
        gross_total: number;
        net_total: number;
        employer_total: number;
        issues: number;
    } | null;
};

type Props = {
    year: number;
    years: number[];
    periods: PeriodRow[];
    ytd: { gross: number; net: number; withholding_tax: number; employee_contributions: number; employer_contributions: number; thirteenth_month: number; runs: number };
    next: { id: number; code: string; pay_date: string | null; end_date: string; run_id: number | null; status: RunStatus | null } | null;
    activeEmployees: number;
    policy: { contributionSchedule: string; minimumWage: number; daysPerYear: number; payDays: { first: number; second: number } };
    today: string;
};

const daysUntil = (date: string, today: string) => Math.round((new Date(date).getTime() - new Date(today).getTime()) / 86400000);

export default function PayrollPage({ year, years, periods, ytd, next, activeEmployees, policy, today }: Props) {
    const { auth } = usePage<SharedData>().props;
    const canManage = hasAnyPermission(auth, ['payroll.manage']);
    const canRun = hasAnyPermission(auth, ['payroll.run']);
    const [generateOpen, setGenerateOpen] = React.useState(false);
    const [customOpen, setCustomOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<PeriodRow | null>(null);
    const [computing, setComputing] = React.useState<number | null>(null);

    const compute = (periodId: number) => {
        setComputing(periodId);
        router.post(`${PAYROLL_URL}/periods/${periodId}/compute`, {}, { onFinish: () => setComputing(null) });
    };

    // Group the year's periods by month.
    const months = React.useMemo(() => {
        const map = new Map<string, PeriodRow[]>();
        periods.forEach((p) => {
            const key = p.start_date.slice(0, 7);
            map.set(key, [...(map.get(key) ?? []), p]);
        });
        return [...map.entries()];
    }, [periods]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payroll" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading
                        title="Payroll"
                        description="Compute pay from approved time records, review and approve it, book it in accounting, then release it on pay day."
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <Select value={String(year)} onValueChange={(v) => router.get(PAYROLL_URL, { year: v }, { preserveScroll: true })}>
                            <SelectTrigger className="w-28">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {years.map((y) => (
                                    <SelectItem key={y} value={String(y)}>
                                        {y}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {canManage && (
                            <>
                                <Button variant="outline" onClick={() => setCustomOpen(true)}>
                                    <Plus className="size-4" /> Custom cut-off
                                </Button>
                                <Button onClick={() => setGenerateOpen(true)}>
                                    <CalendarPlus className="size-4" /> Generate pay periods
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {next && <NextUp next={next} periods={periods} today={today} canManage={canManage} canRun={canRun} computing={computing} onCompute={compute} />}

                {/* Year to date (posted and paid runs) */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                    <Tile label={`Gross pay ${year}`} value={pesoShort(ytd.gross)} hint={`${ytd.runs} posted payroll${ytd.runs === 1 ? '' : 's'}`} />
                    <Tile label="Net pay released" value={pesoShort(ytd.net)} />
                    <Tile label="Withholding tax" value={pesoShort(ytd.withholding_tax)} hint="Remitted via BIR 1601-C" />
                    <Tile label="Employee contributions" value={pesoShort(ytd.employee_contributions)} hint="SSS · PhilHealth · Pag-IBIG" />
                    <Tile label="Employer contributions" value={pesoShort(ytd.employer_contributions)} hint="Incl. SSS EC" />
                    <Tile label="13th month accrued" value={pesoShort(ytd.thirteenth_month)} hint="Due on or before Dec 24 (PD 851)" />
                </div>

                {/* Periods */}
                <section className="rounded-xl border bg-card shadow-sm">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                        <h2 className="flex items-center gap-2 text-sm font-semibold">
                            <CalendarRange className="size-4 text-muted-foreground" /> Pay periods {year}
                        </h2>
                        <span className="text-xs text-muted-foreground">{activeEmployees} active employees</span>
                    </header>

                    {months.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                            <CalendarRange className="size-8 text-muted-foreground/50" />
                            <div>
                                <p className="text-sm font-medium">No pay periods for {year} yet</p>
                                <p className="text-xs text-muted-foreground">Generate the semi-monthly cut-offs (1–15 and 16–end of month) to start.</p>
                            </div>
                            {canManage && (
                                <Button size="sm" onClick={() => setGenerateOpen(true)}>
                                    <CalendarPlus className="size-4" /> Generate pay periods
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="divide-y">
                            {months.map(([month, rows]) => (
                                <div key={month}>
                                    <p className="bg-muted/40 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                                        {fmtDate(`${month}-01`, { month: 'long', year: 'numeric' })}
                                    </p>
                                    <ul className="divide-y">
                                        {rows.map((p) => (
                                            <PeriodItem
                                                key={p.id}
                                                period={p}
                                                today={today}
                                                canManage={canManage}
                                                computing={computing === p.id}
                                                onCompute={() => compute(p.id)}
                                                onEdit={() => setEditing(p)}
                                            />
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <p className="text-xs text-muted-foreground">
                    Policy: daily rate = monthly × 12 ÷ {policy.daysPerYear}. SSS, PhilHealth and Pag-IBIG are{' '}
                    {policy.contributionSchedule === 'split' ? 'split equally between the two cut-offs' : 'deducted in full on the 16th–end cut-off'}. Daily rates at
                    or below {peso(policy.minimumWage)} are treated as minimum wage (tax-exempt). Change these in <span className="font-mono">config/people.php</span>.
                </p>
            </div>

            {canManage && (
                <>
                    <GenerateDialog open={generateOpen} onOpenChange={setGenerateOpen} today={today} payDays={policy.payDays} />
                    <CustomPeriodDialog open={customOpen} onOpenChange={setCustomOpen} />
                    <CustomPeriodDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} period={editing} />
                </>
            )}
        </AppLayout>
    );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{value}</p>
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}

function StatusBadge({ status }: { status: RunStatus | null }) {
    const s = RUN_STATUS[status ?? 'none'];
    return (
        <Badge variant="outline" className={TONE[s.tone]}>
            {s.label}
        </Badge>
    );
}

/** Four dots showing how far the run is. */
function Progress({ status }: { status: RunStatus | null }) {
    const done = stepIndex(status);
    return (
        <span className="flex items-center gap-1" aria-label={`${done} of 4 steps done`}>
            {STEPS.map((s, i) => (
                <span key={s.key} title={s.label} className={cn('h-1.5 w-5 rounded-full', i < done ? 'bg-primary' : 'bg-muted')} />
            ))}
        </span>
    );
}

function NextUp({
    next,
    periods,
    today,
    canManage,
    canRun,
    computing,
    onCompute,
}: {
    next: NonNullable<Props['next']>;
    periods: PeriodRow[];
    today: string;
    canManage: boolean;
    canRun: boolean;
    computing: number | null;
    onCompute: (id: number) => void;
}) {
    const period = periods.find((p) => p.id === next.id);
    const status = next.status;
    const due = next.pay_date ? daysUntil(next.pay_date, today) : null;
    const cutoffOpen = next.end_date >= today;

    const action = (() => {
        if (!status) {
            if (!canManage) return null;
            return (
                <Button onClick={() => onCompute(next.id)} disabled={computing === next.id}>
                    {computing === next.id && <Loader2 className="size-4 animate-spin" />}
                    {cutoffOpen ? 'Compute draft now' : 'Compute payroll'}
                </Button>
            );
        }
        const label = status === 'draft' ? (canRun ? 'Review & approve' : 'Review draft') : status === 'approved' ? 'Post to accounting' : 'Release pay';
        return (
            <Button asChild>
                <Link href={`${PAYROLL_URL}/${next.run_id}`}>
                    {label} <ArrowRight className="size-4" />
                </Link>
            </Button>
        );
    })();

    return (
        <section className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
                <p className="text-[11px] font-semibold tracking-wider text-primary uppercase">Next payroll</p>
                <p className="text-lg font-semibold">
                    {period ? fmtRange(period.start_date, period.end_date) : next.code}
                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{next.code}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                    {next.pay_date && (
                        <>
                            Pay day {fmtDate(next.pay_date, { weekday: 'short', month: 'short', day: 'numeric' })}
                            {due !== null && (
                                <span className={cn('ml-1 font-medium', due < 0 ? 'text-rose-600 dark:text-rose-400' : due <= 2 ? 'text-amber-600 dark:text-amber-400' : '')}>
                                    ({due === 0 ? 'today' : due > 0 ? `in ${due} day${due === 1 ? '' : 's'}` : `${-due} day${due === -1 ? '' : 's'} overdue`})
                                </span>
                            )}
                            {' · '}
                        </>
                    )}
                    {RUN_STATUS[status ?? 'none'].hint}
                    {!status && cutoffOpen && ' The cut-off is still running, so a draft now is only a preview.'}
                </p>
            </div>
            <div className="flex items-center gap-3">
                <Progress status={status} />
                {action}
            </div>
        </section>
    );
}

function PeriodItem({
    period: p,
    today,
    canManage,
    computing,
    onCompute,
    onEdit,
}: {
    period: PeriodRow;
    today: string;
    canManage: boolean;
    computing: boolean;
    onCompute: () => void;
    onEdit: () => void;
}) {
    const confirm = useConfirm();
    const run = p.run;
    const late = !!p.pay_date && p.pay_date < today && run?.status !== 'paid';

    return (
        <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{fmtRange(p.start_date, p.end_date)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{p.code}</span>
                    {p.frequency === 'monthly' && <Badge variant="outline">Monthly</Badge>}
                    <StatusBadge status={run?.status ?? null} />
                    {!!run?.issues && (
                        <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]', TONE.amber)}>
                            <AlertTriangle className="size-3" /> {run.issues} to check
                        </span>
                    )}
                </div>
                <p className={cn('mt-0.5 text-xs text-muted-foreground', late && 'text-rose-600 dark:text-rose-400')}>
                    {p.pay_date ? `Pay day ${fmtDate(p.pay_date, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'No pay day set'}
                    {late && ' · past pay day'}
                    {run && ` · ${run.headcount} employees`}
                </p>
            </div>

            {run && (
                <dl className="grid grid-cols-3 gap-4 text-right text-xs sm:w-[360px]">
                    <div>
                        <dt className="text-muted-foreground">Gross</dt>
                        <dd className="font-mono font-medium">{peso(run.gross_total)}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Net</dt>
                        <dd className="font-mono font-medium">{peso(run.net_total)}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">Employer cost</dt>
                        <dd className="font-mono font-medium">{peso(run.gross_total + run.employer_total)}</dd>
                    </div>
                </dl>
            )}

            <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:justify-end">
                {run ? (
                    <Button size="sm" variant={run.status === 'paid' ? 'ghost' : 'outline'} asChild>
                        <Link href={`${PAYROLL_URL}/${run.id}`}>
                            {run.status === 'paid' ? 'View' : 'Open'} <ArrowRight className="size-3.5" />
                        </Link>
                    </Button>
                ) : (
                    canManage && (
                        <>
                            <Button size="sm" variant="outline" onClick={onCompute} disabled={computing}>
                                {computing && <Loader2 className="size-3.5 animate-spin" />} Compute
                            </Button>
                            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={`Edit ${p.code}`} onClick={onEdit}>
                                <Pencil className="size-4" />
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground"
                                aria-label={`Remove ${p.code}`}
                                onClick={async () => {
                                    const ok = await confirm({ title: `Remove pay period ${p.code}?`, description: 'The pay period is deleted. You can generate or add it again later.', confirmLabel: 'Remove', variant: 'destructive' });
                                    if (ok) router.delete(`/payroll/periods/${p.id}`, { preserveScroll: true });
                                }}
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </>
                    )
                )}
            </div>
        </li>
    );
}

function GenerateDialog({ open, onOpenChange, today, payDays }: { open: boolean; onOpenChange: (o: boolean) => void; today: string; payDays: { first: number; second: number } }) {
    const form = useForm({
        month: today.slice(0, 7),
        months: '1',
        frequency: 'semi_monthly',
        first_pay_day: String(payDays.first),
        second_pay_day: String(payDays.second),
    });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();
    const dayLabel = (d: string) => (d === '0' ? 'last day of the month' : `the ${d}${['th', 'st', 'nd', 'rd'][Number(d) % 10 > 3 || [11, 12, 13].includes(Number(d)) ? 0 : Number(d) % 10]}`);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form
                    className="space-y-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await confirm({
                            title: 'Generate pay periods?',
                            description: `Pay periods for ${data.months === '1' ? 'one month' : `${data.months} months`} from ${data.month} are created. Periods that already exist are skipped.`,
                            confirmLabel: 'Generate',
                        });
                        if (!ok) return;
                        form.post('/payroll/periods/generate', { preserveScroll: true, onSuccess: () => onOpenChange(false) });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Generate pay periods</DialogTitle>
                        <DialogDescription>Creates the standard cut-offs. Periods that already exist are skipped.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Starting month</Label>
                            <Input type="month" value={data.month} onChange={(e) => setData('month', e.target.value)} />
                            <InputError message={errors.month} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">For</Label>
                            <Select value={data.months} onValueChange={(v) => setData('months', v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {[1, 3, 6, 12].map((n) => (
                                        <SelectItem key={n} value={String(n)}>
                                            {n === 1 ? '1 month' : `${n} months`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted p-1">
                        {[
                            ['semi_monthly', 'Semi-monthly'],
                            ['monthly', 'Monthly'],
                        ].map(([v, label]) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setData('frequency', v)}
                                className={cn('rounded px-2 py-1.5 text-sm font-medium transition-colors', data.frequency === v ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {data.frequency === 'semi_monthly' && (
                            <div className="space-y-1.5">
                                <Label className="text-xs">1–15 cut-off paid on</Label>
                                <Input type="number" min={0} max={31} value={data.first_pay_day} onChange={(e) => setData('first_pay_day', e.target.value)} />
                                <p className="text-[11px] text-muted-foreground">{dayLabel(data.first_pay_day)}</p>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-xs">{data.frequency === 'semi_monthly' ? '16–end cut-off paid on' : 'Paid on'}</Label>
                            <Input type="number" min={0} max={31} value={data.second_pay_day} onChange={(e) => setData('second_pay_day', e.target.value)} />
                            <p className="text-[11px] text-muted-foreground">{dayLabel(data.second_pay_day)} · 0 = last day</p>
                        </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Wages must be paid at least twice a month, no more than 16 days apart (Labor Code Art. 103). Use monthly only for employees exempt from this rule.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {processing && <Loader2 className="size-4 animate-spin" />} Generate
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/** Add a custom cut-off, or change the dates of one (`period`) that has no payroll yet. */
function CustomPeriodDialog({ open, onOpenChange, period }: { open: boolean; onOpenChange: (o: boolean) => void; period?: PeriodRow | null }) {
    const form = useForm({ code: '', start_date: '', end_date: '', pay_date: '', frequency: 'semi_monthly' });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();

    React.useEffect(() => {
        if (open && period) {
            form.setData({
                code: period.code,
                start_date: period.start_date.slice(0, 10),
                end_date: period.end_date.slice(0, 10),
                pay_date: period.pay_date?.slice(0, 10) ?? '',
                frequency: period.frequency,
            });
            form.clearErrors();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, period]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <form
                    className="space-y-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        if (!period) {
                            const ok = await confirm({
                                title: `Create pay period ${data.code || ''}?`,
                                description: `A cut-off from ${data.start_date || '—'} to ${data.end_date || '—'}${data.pay_date ? `, paid on ${data.pay_date}` : ''}, is added to the payroll calendar.`,
                                confirmLabel: 'Create period',
                            });
                            if (!ok) return;
                        }
                        const done = { preserveScroll: true, onSuccess: () => { form.reset(); onOpenChange(false); } };
                        if (period) form.put(`/payroll/periods/${period.id}`, done);
                        else form.post('/payroll/periods', done);
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{period ? `Edit ${period.code}` : 'Custom cut-off'}</DialogTitle>
                        <DialogDescription>For cut-offs that do not follow the calendar halves, e.g. 26th–10th paid on the 15th and 11th–25th paid on the 30th.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Code</Label>
                        <Input value={data.code} onChange={(e) => setData('code', e.target.value)} placeholder="e.g. PP-2026-10-A" />
                        <InputError message={errors.code} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">From</Label>
                            <Input type="date" value={data.start_date} onChange={(e) => setData('start_date', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">To</Label>
                            <Input type="date" value={data.end_date} min={data.start_date} onChange={(e) => setData('end_date', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Pay day</Label>
                            <Input type="date" value={data.pay_date} min={data.end_date} onChange={(e) => setData('pay_date', e.target.value)} />
                        </div>
                    </div>
                    <InputError message={errors.start_date ?? errors.end_date ?? errors.pay_date} />
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing || !data.code || !data.start_date || !data.end_date}>
                            {processing && <Loader2 className="size-4 animate-spin" />} {period ? 'Save changes' : 'Create period'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
