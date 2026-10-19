import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowRight, Banknote, CalendarDays, Clock, IdCard, Inbox, Mail, Palmtree, Phone, Plus, User } from 'lucide-react';
import * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';
import { ATTENDANCE_STATUS, ATTENDANCE_URL, fmtDate, fmtHours, fmtMinutes, fmtTime, TONE, weekday } from '../attendance/lib';
import { fmtRange } from '../requests/components/request-card';
import { fmtDays, KINDS, REQUESTS_URL, STATUS, timeAgo, type Balance, type RequestItem } from '../requests/lib';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: '/employee-management/portal' }];

type Profile = {
    id: number;
    employee_code: string;
    firstname: string;
    lastname: string;
    name: string;
    avatar_url: string | null;
    position: string | null;
    employment_status: string;
    employment_type: string | null;
    email: string | null;
    phone: string | null;
    sss_number: string | null;
    philhealth_number: string | null;
    pagibig_number: string | null;
    tin: string | null;
    bank_name: string | null;
    bank_account_hint: string | null;
    hire_date: string | null;
    regularization_date: string | null;
};

type Day = {
    date: string;
    shift_name: string;
    start: string | null;
    end: string | null;
    is_rest_day: boolean;
    source: 'roster' | 'template' | 'default';
    holiday: { name: string; type: string } | null;
    leave: { title: string; half_day: string | null } | null;
    official_business: { destination: string | null; from: string | null; to: string | null } | null;
};

type TodayRecord = {
    time_in: string | null;
    break_out: string | null;
    break_in: string | null;
    time_out: string | null;
    attendance_status: string | null;
    tardiness_minutes: number | string;
    regular_hours: number | string;
} | null;

type Payslip = {
    id: number;
    period: { code: string | null; start: string | null; end: string | null; pay_date: string | null };
    earnings: { basic_pay: number; ot_pay: number; holiday_premiums: number; night_diff_pay: number; allowances: number; absences: number; tardiness: number; unpaid_leave: number };
    deductions: { sss: number; philhealth: number; pagibig: number; withholding_tax: number; other: number };
    gross_pay: number;
    total_deductions: number;
    net_pay: number;
};

type Props = {
    employee: Profile | null;
    week?: Day[];
    todayRecord?: TodayRecord;
    requests?: { pending: number; recent: RequestItem[] };
    balances?: Balance[];
    payslips?: Payslip[];
    can?: { punch: boolean; fileRequests: boolean };
    today?: string;
};

const longDate = (d: string) => fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });
const titleCase = (s: string) => s.replace(/(^|\s)\w/g, (c) => c.toUpperCase());

export default function EmployeePortalPage({ employee, week = [], todayRecord = null, requests, balances = [], payslips = [], can, today = '' }: Props) {
    const { auth } = usePage<SharedData>().props;
    const [slip, setSlip] = React.useState<Payslip | null>(null);

    if (!employee) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="Dashboard" />
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
                        <User className="mx-auto mb-3 size-10 text-muted-foreground" />
                        <h2 className="text-lg font-semibold">This page is for staff with an employee record</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            It shows your own schedule, requests, leave credits and payslips. No employee record in this branch belongs to your account
                            {auth.user.email ? ` (records are matched to your account or to ${auth.user.email})` : ''}.
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {hasPermission(auth, 'dashboard.view') && (
                                <Button asChild>
                                    <Link href="/accounting/dashboard">Go to dashboard</Link>
                                </Button>
                            )}
                            {hasPermission(auth, 'libraries.employees.manage') && (
                                <Button variant="outline" asChild>
                                    <Link href="/libraries/employees">Employee Directory</Link>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </AppLayout>
        );
    }

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                {/* Greeting + primary actions */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <PersonAvatar src={employee.avatar_url} seed={employee.employee_code} name={employee.name} className="size-12" />
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight">
                                {greeting}, {employee.firstname}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {today && fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}
                                {employee.position && ` · ${employee.position}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {can?.punch && (
                            <Button variant="outline" asChild>
                                <Link href={ATTENDANCE_URL}>
                                    <Clock className="size-4" /> My day
                                </Link>
                            </Button>
                        )}
                        {can?.fileRequests && (
                            <Button asChild>
                                <Link href={`${REQUESTS_URL}?file=any`}>
                                    <Plus className="size-4" /> File a request
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <TodayCard day={week[0]} record={todayRecord} canPunch={!!can?.punch} />
                    <RequestsCard pending={requests?.pending ?? 0} recent={requests?.recent ?? []} />
                    <CreditsCard balances={balances} />
                </div>

                <WeekStrip week={week} today={today} />

                <PayslipsCard payslips={payslips} onOpen={setSlip} />

                <RecordCard employee={employee} />
            </div>

            <PayslipDialog slip={slip} employee={employee} onClose={() => setSlip(null)} />
        </AppLayout>
    );
}

/* ---------------------------------------------------------------------------------------------- */

function Card({
    title,
    icon: Icon,
    href,
    linkLabel,
    children,
}: {
    title: string;
    icon: typeof Clock;
    href?: string;
    linkLabel?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="flex flex-col rounded-xl border bg-card shadow-sm">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4 text-muted-foreground" /> {title}
                </h2>
                {href && (
                    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        {linkLabel} <ArrowRight className="size-3" />
                    </Link>
                )}
            </header>
            <div className="flex-1 p-4">{children}</div>
        </section>
    );
}

const isOff = (d: Day) => !!d.leave || d.is_rest_day || (!!d.holiday && !d.start);

function shiftText(d: Day) {
    if (d.leave) return d.leave.half_day ? `${d.leave.title} · half day` : d.leave.title;
    if (d.holiday && !d.start) return d.holiday.name;
    if (d.is_rest_day) return 'Rest day';
    return `${fmtTime(d.start)} – ${fmtTime(d.end)}`;
}

function TodayCard({ day, record, canPunch }: { day?: Day; record: TodayRecord; canPunch: boolean }) {
    if (!day) return null;
    const off = isOff(day);
    const status = record?.attendance_status ? ATTENDANCE_STATUS[record.attendance_status] : null;
    const late = Number(record?.tardiness_minutes ?? 0);

    let headline: string;
    let detail: string | null = null;
    if (day.leave) {
        headline = `On ${day.leave.title.toLowerCase()}`;
        detail = 'Enjoy your time off.';
    } else if (day.is_rest_day && !record?.time_in) {
        headline = 'Rest day';
        detail = 'Work today is paid at rest-day premium once approved.';
    } else if (record?.time_out) {
        headline = `Checked out at ${fmtTime(record.time_out)}`;
        detail = `${fmtHours(record.regular_hours)} regular${late > 0 ? ` · late ${fmtMinutes(late)}` : ''}`;
    } else if (record?.break_out && !record.break_in) {
        headline = `On break since ${fmtTime(record.break_out)}`;
    } else if (record?.time_in) {
        headline = `Checked in at ${fmtTime(record.time_in)}`;
        detail = late > 0 ? `Late by ${fmtMinutes(late)}` : 'On time';
    } else {
        headline = 'Not checked in yet';
        detail = day.start ? `Your shift starts at ${fmtTime(day.start)}.` : null;
    }

    return (
        <Card title="Today" icon={Clock} href={ATTENDANCE_URL} linkLabel="My attendance">
            <div className="space-y-3">
                <div>
                    <p className="text-lg font-semibold">{headline}</p>
                    {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md border bg-muted/40 px-2 py-1">
                        {day.shift_name}
                        {!off && day.start && ` · ${fmtTime(day.start)}–${fmtTime(day.end)}`}
                    </span>
                    {day.holiday && <span className={cn('rounded-md border px-2 py-1', TONE.sky)}>{day.holiday.name}</span>}
                    {day.official_business && (
                        <span className={cn('rounded-md border px-2 py-1', TONE.emerald)}>
                            Official business{day.official_business.destination && ` · ${day.official_business.destination}`}
                        </span>
                    )}
                    {status && (
                        <Badge variant="outline" className={TONE[status.tone]}>
                            {status.label}
                        </Badge>
                    )}
                </div>
                {canPunch && !off && !record?.time_out && (
                    <Button asChild size="sm">
                        <Link href={ATTENDANCE_URL}>{record?.time_in ? 'Open my day' : 'Check in'}</Link>
                    </Button>
                )}
            </div>
        </Card>
    );
}

function RequestsCard({ pending, recent }: { pending: number; recent: RequestItem[] }) {
    return (
        <Card title="My requests" icon={Inbox} href={REQUESTS_URL} linkLabel="All requests">
            <div className="space-y-3">
                <p className="text-sm">
                    {pending > 0 ? (
                        <>
                            <span className="text-lg font-semibold text-amber-600 dark:text-amber-400">{pending}</span> waiting for approval
                        </>
                    ) : (
                        <span className="text-muted-foreground">Nothing waiting for approval.</span>
                    )}
                </p>
                {recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No requests filed yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {recent.map((r) => {
                            const meta = KINDS[r.kind];
                            const st = STATUS[r.status];
                            const when = r.status === 'pending' ? `filed ${timeAgo(r.filed_at)}` : r.decided_at ? `${st.label.toLowerCase()} ${timeAgo(r.decided_at)}` : null;
                            return (
                                <li key={r.key} className="flex items-center gap-2.5">
                                    <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-md border', TONE[meta.tone])}>
                                        <meta.icon className="size-3.5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{r.title}</p>
                                        <p className="truncate text-[11px] text-muted-foreground">
                                            {fmtRange(r.date_from, r.date_to)}
                                            {when && ` · ${when}`}
                                        </p>
                                    </div>
                                    <Badge variant="outline" className={cn('shrink-0', TONE[st.tone])}>
                                        {st.label}
                                    </Badge>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </Card>
    );
}

function CreditsCard({ balances }: { balances: Balance[] }) {
    const tracked = balances.filter((b) => b.balance_tracked);
    return (
        <Card title="Leave credits" icon={Palmtree} href={REQUESTS_URL} linkLabel="Details">
            {tracked.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {balances.length ? 'Your leave types are per occurrence — there are no yearly credits to track.' : 'No leave types are enabled for you.'}
                </p>
            ) : (
                <ul className="space-y-3">
                    {tracked.map((b) => {
                        const pct = b.entitled > 0 ? Math.max(0, Math.min(100, ((b.available ?? 0) / b.entitled) * 100)) : 0;
                        return (
                            <li key={b.leave_type_id} className="space-y-1">
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span>{b.name}</span>
                                    <span className="tabular-nums">
                                        <span className="font-semibold">{Number(b.available ?? 0)}</span>
                                        <span className="text-muted-foreground"> of {b.entitled} left</span>
                                    </span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                                    <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                                </div>
                                {b.reserved > 0 && <p className="text-[11px] text-muted-foreground">{fmtDays(b.reserved)} on hold for pending requests</p>}
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    );
}

function WeekStrip({ week, today }: { week: Day[]; today: string }) {
    return (
        <Card title="Next 7 days" icon={CalendarDays} href={ATTENDANCE_URL} linkLabel="Timesheet">
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {week.map((d) => {
                    const off = isOff(d);
                    return (
                        <li
                            key={d.date}
                            className={cn(
                                'rounded-lg border p-2.5',
                                d.leave ? TONE.violet : off ? 'bg-muted/40' : 'bg-card',
                                d.date === today && 'ring-2 ring-primary/40',
                            )}
                        >
                            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                {d.date === today ? 'Today' : weekday(d.date)} <span className="font-normal">{fmtDate(d.date, { day: 'numeric' })}</span>
                            </p>
                            <p className={cn('mt-1 text-sm font-medium', off && !d.leave && 'text-muted-foreground')}>{shiftText(d)}</p>
                            {d.holiday && d.start && <p className="truncate text-[11px] text-sky-700 dark:text-sky-300">{d.holiday.name}</p>}
                            {d.official_business && (
                                <p className="truncate text-[11px] text-emerald-700 dark:text-emerald-300">
                                    OB{d.official_business.destination && ` · ${d.official_business.destination}`}
                                </p>
                            )}
                        </li>
                    );
                })}
            </ol>
        </Card>
    );
}

const periodLabel = (p: Payslip['period']) => (p.start && p.end ? fmtRange(p.start, p.end) : (p.code ?? 'Pay period'));

function PayslipsCard({ payslips, onOpen }: { payslips: Payslip[]; onOpen: (p: Payslip) => void }) {
    return (
        <Card title="Payslips" icon={Banknote} href="/employee-management/my-pay" linkLabel="All pay & contributions">
            {payslips.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No payslips yet. They appear here once payroll is posted.</p>
            ) : (
                <ul className="-my-2 divide-y">
                    {payslips.map((p, i) => (
                        <li key={p.id}>
                            <button type="button" onClick={() => onOpen(p)} className="flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left hover:bg-muted/40">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">
                                        {periodLabel(p.period)}
                                        {i === 0 && <span className="ml-2 text-[11px] font-normal text-muted-foreground">latest</span>}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">{p.period.pay_date ? `Paid ${longDate(p.period.pay_date)}` : p.period.code}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-sm font-semibold">{formatPhpCurrency(p.net_pay)}</p>
                                    <p className="text-[11px] text-muted-foreground">net of {formatPhpCurrency(p.gross_pay)} gross</p>
                                </div>
                                <ArrowRight className="size-4 text-muted-foreground/50" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function Line({ label, value, negative, strong }: { label: string; value: number; negative?: boolean; strong?: boolean }) {
    if (!strong && !value) return null;
    return (
        <div className={cn('flex justify-between gap-4 py-1 text-sm', strong && 'mt-1 border-t pt-2 font-semibold')}>
            <span className={cn(!strong && 'text-muted-foreground')}>{label}</span>
            <span className={cn('font-mono', negative && 'text-rose-600 dark:text-rose-400')}>
                {negative && value ? '−' : ''}
                {formatPhpCurrency(value)}
            </span>
        </div>
    );
}

function PayslipDialog({ slip, employee, onClose }: { slip: Payslip | null; employee: Profile; onClose: () => void }) {
    return (
        <Dialog open={slip !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                {slip && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Payslip · {periodLabel(slip.period)}</DialogTitle>
                            <DialogDescription>
                                {employee.name} · {employee.employee_code}
                                {slip.period.pay_date && ` · paid ${longDate(slip.period.pay_date)}`}
                            </DialogDescription>
                        </DialogHeader>
                        <div>
                            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Earnings</p>
                            <Line label="Basic pay" value={slip.earnings.basic_pay} />
                            <Line label="Overtime" value={slip.earnings.ot_pay} />
                            <Line label="Holiday / rest-day premiums" value={slip.earnings.holiday_premiums} />
                            <Line label="Night differential" value={slip.earnings.night_diff_pay} />
                            <Line label="Allowances" value={slip.earnings.allowances} />
                            <Line label="Absences" value={slip.earnings.absences} negative />
                            <Line label="Unpaid leave" value={slip.earnings.unpaid_leave} negative />
                            <Line label="Late & undertime" value={slip.earnings.tardiness} negative />
                            <Line label="Gross pay" value={slip.gross_pay} strong />
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Deductions</p>
                            <Line label="SSS" value={slip.deductions.sss} negative />
                            <Line label="PhilHealth" value={slip.deductions.philhealth} negative />
                            <Line label="Pag-IBIG" value={slip.deductions.pagibig} negative />
                            <Line label="Withholding tax" value={slip.deductions.withholding_tax} negative />
                            <Line label="Other deductions" value={slip.deductions.other} negative />
                            <Line label="Total deductions" value={slip.total_deductions} strong />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
                            <span className="text-sm font-semibold">Net take-home pay</span>
                            <span className="font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatPhpCurrency(slip.net_pay)}</span>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function RecordCard({ employee }: { employee: Profile }) {
    const withIcon = (Icon: typeof Mail, value: string | null, mono = false) =>
        value && (
            <span className={cn('inline-flex items-center gap-1', mono && 'font-mono')}>
                <Icon className="size-3.5 text-muted-foreground" /> {value}
            </span>
        );

    const items: [string, React.ReactNode][] = [
        ['Employee no.', employee.employee_code],
        ['Employment', titleCase([employee.employment_type, employee.employment_status].filter(Boolean).join(' · '))],
        ['Hired', employee.hire_date && longDate(employee.hire_date)],
        ['Regularized', employee.regularization_date && longDate(employee.regularization_date)],
        ['Email', withIcon(Mail, employee.email)],
        ['Phone', withIcon(Phone, employee.phone)],
        ['SSS', employee.sss_number],
        ['PhilHealth', employee.philhealth_number],
        ['Pag-IBIG', employee.pagibig_number],
        ['TIN', employee.tin],
        ['Payroll account', employee.bank_name && [employee.bank_name, employee.bank_account_hint].filter(Boolean).join(' ')],
    ];
    const missing = (['sss_number', 'philhealth_number', 'pagibig_number', 'tin'] as const).filter((k) => !employee[k]).length;

    return (
        <Card title="My record" icon={IdCard}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                {items.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                        <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
                        <dd className={cn('truncate text-sm', !value && 'text-muted-foreground')}>{value || '—'}</dd>
                    </div>
                ))}
            </dl>
            <p className={cn('mt-4 rounded-md border px-3 py-2 text-xs', missing ? TONE.amber : 'bg-muted/40 text-muted-foreground')}>
                {missing
                    ? `${missing} government ID${missing === 1 ? ' is' : 's are'} missing — they are needed for your SSS, PhilHealth, Pag-IBIG and tax records. Please send them to HR.`
                    : 'Something out of date? Ask HR to update your record.'}
            </p>
        </Card>
    );
}
