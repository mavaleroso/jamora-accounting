import { Head, router } from '@inertiajs/react';
import { ArrowRight, Banknote, CalendarHeart, HandCoins, HeartHandshake, Landmark, Receipt, ShieldCheck, User, Wallet } from 'lucide-react';
import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/finance/tabs';
import { StatCard } from '@/components/stat-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { PayslipDialog } from '../../payroll/runs/components';
import { peso, type PayslipRow } from '../../payroll/runs/lib';
import { fmtDate, TONE } from '../attendance/lib';

const MY_PAY_URL = '/employee-management/my-pay';
const breadcrumbs: BreadcrumbItem[] = [{ title: 'My Pay', href: MY_PAY_URL }];

type Profile = {
    id: number;
    employee_code: string;
    name: string;
    position: string | null;
    pay_type: string | null;
    sss_number: string | null;
    philhealth_number: string | null;
    pagibig_number: string | null;
    tin: string | null;
    hire_date: string | null;
};

type Slip = PayslipRow & {
    run: { run_no: string; status: 'posted' | 'paid'; paid_on: string | null };
    period: { code: string; start_date: string; end_date: string; pay_date: string | null };
};

type Summary = {
    payslips: number;
    gross: number;
    net: number;
    contributions: number;
    employer_contributions: number;
    non_taxable_allowances: number;
    taxable_income: number;
    withholding_tax: number;
    thirteenth_month: number;
    benefit_deductions: number;
    is_mwe: boolean;
};

type Remittance = { status: 'pending' | 'prepared' | 'submitted' | 'verified'; filed_on: string | null } | null;

type MonthRow = {
    month: string;
    payslips: number;
    sss: number;
    sss_er: number;
    sss_ec: number;
    philhealth: number;
    philhealth_er: number;
    pagibig: number;
    pagibig_er: number;
    withholding_tax: number;
    remittances: Record<'sss' | 'philhealth' | 'pagibig' | 'tax', Remittance>;
};

type Enrollment = {
    id: number;
    program: {
        code: string;
        name: string;
        category: string;
        contribution_basis: string;
        payroll_mode: 'earning' | 'contribution' | string;
        is_taxable: boolean;
    } | null;
    status: string;
    employee_share: number;
    employer_share: number;
    effective_date: string | null;
    end_date: string | null;
    year_to_date: { employee: number; employer: number; earning: number };
};

type Adjustment = {
    id: number;
    date: string | null;
    period_code: string | null;
    kind: 'earning' | 'deduction';
    category: string;
    category_label: string;
    description: string;
    amount: number;
};

type Props = {
    employee: Profile | null;
    year?: number;
    years?: number[];
    summary?: Summary;
    payslips?: Slip[];
    contributions?: MonthRow[];
    benefits?: Enrollment[];
    adjustments?: Adjustment[];
};

const TABS = ['payslips', 'contributions', 'tax', 'benefits'] as const;
type Tab = (typeof TABS)[number];

const shortDate = (d: string) => fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
const periodRange = (p: Slip['period']) => `${fmtDate(p.start_date, { month: 'short', day: 'numeric' })} – ${shortDate(p.end_date)}`;
const monthLabel = (ym: string) => fmtDate(`${ym}-01`, { month: 'long', year: 'numeric' });

export default function MyPayPage({ employee, year, years = [], summary, payslips = [], contributions = [], benefits = [], adjustments = [] }: Props) {
    const [tab, setTab] = React.useState<Tab>(() => {
        const t = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
        return (TABS as readonly string[]).includes(t ?? '') ? (t as Tab) : 'payslips';
    });
    const [slip, setSlip] = React.useState<Slip | null>(null);

    if (!employee || !summary || !year) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="My Pay" />
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
                        <User className="mx-auto mb-3 size-10 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">This page is for staff with an employee record</h2>
                        <p className="mt-1 text-sm text-muted-foreground">It shows your own payslips, contributions and benefits. No employee record in this branch belongs to your account.</p>
                    </div>
                </div>
            </AppLayout>
        );
    }

    const changeYear = (y: string) => router.get(MY_PAY_URL, { year: y, tab }, { preserveScroll: true, preserveState: true, replace: true });
    const changeTab = (t: string) => {
        setTab(t as Tab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', t);
        window.history.replaceState(window.history.state, '', url);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Pay" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">My Pay</h1>
                        <p className="text-sm text-muted-foreground">Your payslips, government contributions, tax and benefits. Only released payroll is shown.</p>
                    </div>
                    {years.length > 0 && (
                        <Select value={String(year)} onValueChange={changeYear}>
                            <SelectTrigger className="h-9 w-full sm:w-32" aria-label="Year">
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
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <StatCard title={`Net pay · ${year}`} value={peso(summary.net)} description={`${summary.payslips} payslip${summary.payslips === 1 ? '' : 's'}`} icon={Wallet} tone="success" />
                    <StatCard title="Gross pay" value={peso(summary.gross)} icon={Banknote} />
                    <StatCard title="Your contributions" value={peso(summary.contributions)} description={`Company added ${peso(summary.employer_contributions)}`} icon={ShieldCheck} tone="info" />
                    <StatCard title="Tax withheld" value={peso(summary.withholding_tax)} description={summary.is_mwe ? 'Minimum wage earner' : undefined} icon={Landmark} />
                    <StatCard title="13th month accrued" value={peso(summary.thirteenth_month)} icon={CalendarHeart} className="col-span-2 lg:col-span-1" />
                </div>

                <Tabs value={tab} onValueChange={changeTab}>
                    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                        <TabsList>
                            <TabsTrigger value="payslips">Payslips</TabsTrigger>
                            <TabsTrigger value="contributions">Contributions</TabsTrigger>
                            <TabsTrigger value="tax">Tax & 13th month</TabsTrigger>
                            <TabsTrigger value="benefits">Benefits & loans</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="payslips">
                        <PayslipsTab payslips={payslips} onOpen={setSlip} />
                    </TabsContent>
                    <TabsContent value="contributions">
                        <ContributionsTab rows={contributions} employee={employee} />
                    </TabsContent>
                    <TabsContent value="tax">
                        <TaxTab summary={summary} year={year} tin={employee.tin} />
                    </TabsContent>
                    <TabsContent value="benefits">
                        <BenefitsTab benefits={benefits} adjustments={adjustments} />
                    </TabsContent>
                </Tabs>
            </div>

            <PayslipDialog
                payslip={slip}
                period={slip ? slip.period : { start_date: '', end_date: '', pay_date: null }}
                editable={false}
                selfService
                onClose={() => setSlip(null)}
            />
        </AppLayout>
    );
}

/* ---------------------------------------------------------------------------------------------- */

function Panel({ title, icon: Icon, description, children, className }: { title: string; icon: typeof Wallet; description?: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn('rounded-xl border bg-card shadow-sm', className)}>
            <header className="border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4 text-muted-foreground" /> {title}
                </h2>
                {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </header>
            {children}
        </section>
    );
}

function Empty({ children }: { children: React.ReactNode }) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function Chip({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
    return <span className={cn('inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium whitespace-nowrap', TONE[tone])}>{children}</span>;
}

/* Payslips -------------------------------------------------------------------------------------- */

function PayslipsTab({ payslips, onOpen }: { payslips: Slip[]; onOpen: (s: Slip) => void }) {
    return (
        <Panel title="Payslips" icon={Receipt} description="Tap a payslip to see every line: earnings, deductions, benefits and what the company paid on top.">
            {payslips.length === 0 ? (
                <Empty>No payslips for this year yet. They appear once payroll is posted.</Empty>
            ) : (
                <ul className="divide-y">
                    {payslips.map((p) => (
                        <li key={p.id}>
                            <button type="button" onClick={() => onOpen(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                        {periodRange(p.period)}
                                        {p.run.status === 'paid' ? <Chip tone="emerald">Paid</Chip> : <Chip tone="violet">Posted · awaiting release</Chip>}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {p.run.paid_on ? `Paid ${shortDate(p.run.paid_on)}` : p.period.pay_date ? `Pay day ${shortDate(p.period.pay_date)}` : p.period.code}
                                        {' · '}
                                        {p.period.code}
                                    </p>
                                </div>
                                <div className="hidden text-right sm:block">
                                    <p className="font-mono text-xs text-muted-foreground">{peso(p.gross_pay)} gross</p>
                                    <p className="font-mono text-xs text-rose-600 dark:text-rose-400">−{peso(p.total_deductions)}</p>
                                </div>
                                <div className="w-28 text-right">
                                    <p className="font-mono text-sm font-semibold">{peso(p.net_pay)}</p>
                                    <p className="text-[11px] text-muted-foreground">net pay</p>
                                </div>
                                <ArrowRight className="size-4 shrink-0 text-muted-foreground/50" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    );
}

/* Contributions --------------------------------------------------------------------------------- */

function RemittanceChip({ r }: { r: Remittance }) {
    if (!r) return <span className="text-[10px] text-muted-foreground">not tracked</span>;
    if (r.status === 'verified' || r.status === 'submitted') return <Chip tone="emerald">Remitted{r.filed_on ? ` ${fmtDate(r.filed_on)}` : ''}</Chip>;
    return <Chip tone="amber">Not yet remitted</Chip>;
}

function Cell({ ee, er, remittance }: { ee: number; er?: number; remittance: Remittance }) {
    return (
        <td className="px-3 py-2.5 text-right align-top">
            <p className="font-mono text-sm tabular-nums">{peso(ee)}</p>
            {er !== undefined && <p className="font-mono text-[11px] text-muted-foreground tabular-nums">+{peso(er)} company</p>}
            <div className="mt-1">
                <RemittanceChip r={remittance} />
            </div>
        </td>
    );
}

function ContributionsTab({ rows, employee }: { rows: MonthRow[]; employee: Profile }) {
    const total = (k: keyof Omit<MonthRow, 'month' | 'remittances'>) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const ids = [
        { label: 'SSS', value: employee.sss_number },
        { label: 'PhilHealth', value: employee.philhealth_number },
        { label: 'Pag-IBIG', value: employee.pagibig_number },
        { label: 'TIN', value: employee.tin },
    ];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {ids.map((i) => (
                    <div key={i.label} className="rounded-lg border bg-card px-3 py-2.5 shadow-sm">
                        <p className="text-[11px] text-muted-foreground">{i.label} number</p>
                        <p className={cn('font-mono text-sm', !i.value && 'text-muted-foreground')}>{i.value || 'Not on file'}</p>
                    </div>
                ))}
            </div>

            <Panel
                title="Contributions by month"
                icon={ShieldCheck}
                description="What was deducted from your pay and what the company added, and whether the company has filed the remittance with each agency."
            >
                {rows.length === 0 ? (
                    <Empty>No contributions for this year yet.</Empty>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="border-b text-[11px] tracking-wide text-muted-foreground uppercase">
                                    <th className="px-4 py-2 text-left font-medium">Month</th>
                                    <th className="px-3 py-2 text-right font-medium">SSS</th>
                                    <th className="px-3 py-2 text-right font-medium">PhilHealth</th>
                                    <th className="px-3 py-2 text-right font-medium">Pag-IBIG</th>
                                    <th className="px-3 py-2 text-right font-medium">Tax withheld</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {rows.map((r) => (
                                    <tr key={r.month}>
                                        <td className="px-4 py-2.5 align-top">
                                            <p className="font-medium">{monthLabel(r.month)}</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {r.payslips} payslip{r.payslips === 1 ? '' : 's'}
                                            </p>
                                        </td>
                                        <Cell ee={r.sss} er={r.sss_er + r.sss_ec} remittance={r.remittances.sss} />
                                        <Cell ee={r.philhealth} er={r.philhealth_er} remittance={r.remittances.philhealth} />
                                        <Cell ee={r.pagibig} er={r.pagibig_er} remittance={r.remittances.pagibig} />
                                        <Cell ee={r.withholding_tax} remittance={r.remittances.tax} />
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t bg-muted/30 font-semibold">
                                    <td className="px-4 py-2.5">Total</td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                        {peso(total('sss'))}
                                        <p className="text-[11px] font-normal text-muted-foreground">+{peso(total('sss_er') + total('sss_ec'))} company</p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                        {peso(total('philhealth'))}
                                        <p className="text-[11px] font-normal text-muted-foreground">+{peso(total('philhealth_er'))} company</p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                                        {peso(total('pagibig'))}
                                        <p className="text-[11px] font-normal text-muted-foreground">+{peso(total('pagibig_er'))} company</p>
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{peso(total('withholding_tax'))}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </Panel>
            <p className="text-xs text-muted-foreground">
                SSS includes the employer’s EC (Employees’ Compensation) share. A month is grouped by the date its payroll cut-off ends. You can also check your posted contributions on the
                My.SSS, PhilHealth Member and Virtual Pag-IBIG portals.
            </p>
        </div>
    );
}

/* Tax & 13th month ------------------------------------------------------------------------------ */

function Row({ label, value, note, strong, minus }: { label: string; value: number; note?: string; strong?: boolean; minus?: boolean }) {
    return (
        <div className={cn('flex items-baseline justify-between gap-4 px-4 py-2 text-sm', strong && 'bg-muted/30 font-semibold')}>
            <span className={cn(!strong && 'text-muted-foreground')}>
                {label}
                {note && <span className="block text-[11px] text-muted-foreground/80">{note}</span>}
            </span>
            <span className="font-mono tabular-nums">
                {minus && value ? '−' : ''}
                {peso(value)}
            </span>
        </div>
    );
}

function TaxTab({ summary, year, tin }: { summary: Summary; year: number; tin: string | null }) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={`Tax summary · ${year}`} icon={Landmark} description={`From your released payslips${tin ? ` · TIN ${tin}` : ''}.`}>
                <div className="divide-y">
                    <Row label="Gross compensation" value={summary.gross} />
                    <Row label="Your SSS, PhilHealth and Pag-IBIG" value={summary.contributions} note="Mandatory contributions are not taxed" minus />
                    <Row label="Non-taxable allowances" value={summary.non_taxable_allowances} note="De minimis and other non-taxable benefits" minus />
                    <Row label="Taxable compensation" value={summary.taxable_income} note="As computed on your payslips" strong />
                    <Row label="Tax withheld" value={summary.withholding_tax} strong />
                </div>
                <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                    {summary.is_mwe && 'As a minimum wage earner, your statutory minimum wage is exempt from income tax. '}
                    This is a running summary for your reference. The BIR Form 2316 the company issues after the year ends is your official certificate of
                    compensation and tax withheld.
                </p>
            </Panel>

            <Panel title={`13th month pay · ${year}`} icon={CalendarHeart} description="One-twelfth of the basic pay you earned this year.">
                <div className="px-4 py-5">
                    <p className="text-xs text-muted-foreground">Accrued so far</p>
                    <p className="font-mono text-2xl font-semibold tabular-nums">{peso(summary.thirteenth_month)}</p>
                </div>
                <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                    The law requires 13th month pay to be released on or before December 24. Up to ₱90,000 of your 13th month pay and other benefits combined is tax-exempt.
                </p>
            </Panel>
        </div>
    );
}

/* Benefits & loans ------------------------------------------------------------------------------ */

const CATEGORY_LABEL: Record<string, string> = { allowance: 'Allowance', insurance: 'Insurance', savings: 'Savings', company: 'Company program' };

function BenefitsTab({ benefits, adjustments }: { benefits: Enrollment[]; adjustments: Adjustment[] }) {
    const deductionTotals = Object.entries(
        adjustments.filter((a) => a.kind === 'deduction').reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.category_label]: (acc[a.category_label] ?? 0) + a.amount }), {}),
    );

    return (
        <div className="space-y-4">
            <Panel title="Benefit programs" icon={HeartHandshake} description="Programs you are enrolled in. Amounts are per month, split across the month’s payrolls.">
                {benefits.length === 0 ? (
                    <Empty>You are not enrolled in any benefit program.</Empty>
                ) : (
                    <ul className="divide-y">
                        {benefits.map((b) => {
                            const earning = b.program?.payroll_mode === 'earning';
                            const active = b.status === 'active';
                            return (
                                <li key={b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                                    <div className="min-w-0 flex-1">
                                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                            {b.program?.name ?? 'Program'}
                                            <Chip tone={active ? 'emerald' : 'slate'}>{active ? 'Active' : b.status.replace('_', ' ')}</Chip>
                                            {b.program && <span className="text-[11px] text-muted-foreground">{CATEGORY_LABEL[b.program.category] ?? b.program.category}</span>}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {b.effective_date ? `Since ${shortDate(b.effective_date)}` : 'No start date'}
                                            {b.end_date && ` · until ${shortDate(b.end_date)}`}
                                        </p>
                                    </div>
                                    <div className="text-sm sm:text-right">
                                        {earning ? (
                                            <>
                                                <p className="font-mono">
                                                    {peso(b.employer_share)}{' '}
                                                    <span className="text-xs text-muted-foreground">
                                                        {b.program?.contribution_basis === 'per_day' ? '/ day worked' : '/ month'}
                                                    </span>
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {b.program?.is_taxable ? 'Taxable' : 'Non-taxable'} · received {peso(b.year_to_date.earning)} this year
                                                </p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="font-mono">
                                                    You {peso(b.employee_share)} · company {peso(b.employer_share)} <span className="text-xs text-muted-foreground">/ month</span>
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    This year: you {peso(b.year_to_date.employee)} · company {peso(b.year_to_date.employer)}
                                                </p>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Panel>

            <Panel title="Loans, advances & other adjustments" icon={HandCoins} description="One-off lines added to your payslips this year: loan amortizations, cash advances, allowances, bonuses and the like.">
                {deductionTotals.length > 0 && (
                    <div className="flex flex-wrap gap-2 border-b px-4 py-3">
                        {deductionTotals.map(([label, amount]) => (
                            <span key={label} className="rounded-md border bg-muted/30 px-2 py-1 text-xs">
                                {label}: <span className="font-mono font-semibold">{peso(amount)}</span> paid this year
                            </span>
                        ))}
                    </div>
                )}
                {adjustments.length === 0 ? (
                    <Empty>No loans, advances or other adjustments this year.</Empty>
                ) : (
                    <ul className="divide-y">
                        {adjustments.map((a) => (
                            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm">{a.description}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        {a.category_label}
                                        {a.date && ` · ${shortDate(a.date)}`}
                                        {a.period_code && ` · ${a.period_code}`}
                                    </p>
                                </div>
                                <span className={cn('font-mono text-sm tabular-nums', a.kind === 'deduction' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400')}>
                                    {a.kind === 'deduction' ? '−' : '+'}
                                    {peso(a.amount)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>
        </div>
    );
}
