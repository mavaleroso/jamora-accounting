import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowRight,
    BadgeCheck,
    Banknote,
    CalendarClock,
    CalendarDays,
    Cake,
    ClipboardList,
    Clock,
    CreditCard,
    IdCard,
    Inbox,
    RefreshCw,
    UserPlus,
    Users,
} from 'lucide-react';
import * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { TONE } from '../attendance/lib';
import { RUN_STATUS, type RunStatus } from '../../payroll/runs/lib';
import { TrendLine, VizStyles, vizVar } from '../reports/charts';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Employee Management', href: '/employee-management' }];

type Card = { id: number; employee_code: string; name: string; position: string | null; avatar_url: string | null };
type BoardPerson = Card & { status: string; late_by: number | null; tardiness_minutes: number; shift_start: string | null; leave: string | null };

type Props = {
    today: string;
    greeting: string;
    show: { team: boolean; inbox: boolean; payroll: boolean; compliance: boolean; people: boolean };
    team: {
        holiday: string | null;
        generatedAt: string;
        counts: { scheduled: number; in: number; working: number; done: number; late: number; expected: number; onLeave: number; absent: number; off: number; arrivedLate: number };
        attention: BoardPerson[];
        arrivedLate: BoardPerson[];
    } | null;
    trend: { rate: number | null; daily: { date: string; rate: number }[]; lateCount: number; absences: number } | null;
    inbox: {
        pendingTotal: number;
        pendingByKind: Record<string, number>;
        oldest: { key: string; title: string; kind: string; employee: { name: string; employee_code: string; avatar_url: string | null } | null; date_from: string | null; date_to: string | null; filed_at: string | null }[];
        unapprovedRecords: number;
        incompleteRecords: number;
        oldestUnapproved: string | null;
    } | null;
    payroll: {
        periods: { id: number; code: string; start_date: string; end_date: string; pay_date: string | null; run: { id: number; status: RunStatus; net_total: number; headcount: number } | null; cutoffOver: boolean }[];
        nextPayDate: string | null;
        nextPayCode: string | null;
    } | null;
    compliance: {
        overdue: number;
        dueSoon: number;
        awaitingVerification: number;
        items: { id: number; title: string; agency: string | null; form_code: string | null; period: string; due_date: string | null; status: string; overdue: boolean }[];
    } | null;
    people: {
        active: number;
        newThisMonth: Card[];
        probationDue: (Card & { due: string })[];
        anniversaries: (Card & { date: string; years: number })[];
        missingIds: number;
        noBank: number;
    } | null;
    out: (Card & { code: string; avatarUrl: string | null; type: string; start: string; end: string; days: number; today: boolean })[] | null;
};

/* ---------------------------------------------------------------------------------------------- */

const parse = (v: string) => {
    const [y, m, d] = v.slice(0, 10).split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
};
const fmt = (v: string | null, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => (v ? parse(v).toLocaleDateString('en-PH', opts) : '—');
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const time12 = (t: string | null) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const minutes = (n: number) => (n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n}m`);
const ago = (iso: string | null, today: string) => {
    if (!iso) return '';
    const d = daysBetween(iso.slice(0, 10), today);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

const KIND_LABEL: Record<string, string> = {
    leave: 'Leave',
    overtime: 'Overtime',
    correction: 'Time correction',
    official_business: 'Official business',
    undertime: 'Undertime',
    schedule_change: 'Schedule change',
};

export default function EmployeeDashboardPage(props: Props) {
    const { today, greeting, show, team, trend, inbox, payroll, compliance, people, out } = props;
    const [refreshing, setRefreshing] = React.useState(false);
    const refresh = () => router.reload({ onStart: () => setRefreshing(true), onFinish: () => setRefreshing(false) });

    const nothing = !Object.values(show).some(Boolean);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Employee Management" />
            <VizStyles />

            <div className="people-viz flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm text-muted-foreground">{fmt(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                        <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
                        {team?.holiday && (
                            <p className={cn('mt-1 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', TONE.violet)}>
                                <CalendarDays className="size-3.5" /> Holiday today: {team.holiday}
                            </p>
                        )}
                    </div>
                    <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
                        <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} /> Refresh
                    </Button>
                </div>

                {nothing && <p className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">You don’t have access to any Employee Management sections yet.</p>}

                {/* Headline row */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {team && (
                        <Tile
                            icon={Users}
                            label="In today"
                            value={`${team.counts.in}/${team.counts.scheduled}`}
                            hint={team.counts.late ? `${team.counts.late} late, not in yet` : team.counts.expected ? `${team.counts.expected} still expected` : 'Everyone scheduled is in'}
                            tone={team.counts.late ? 'amber' : undefined}
                            href="/employee-management/attendance?view=today"
                        />
                    )}
                    {inbox && (
                        <Tile
                            icon={Inbox}
                            label="Requests to decide"
                            value={String(inbox.pendingTotal)}
                            hint={inbox.unapprovedRecords ? `${inbox.unapprovedRecords} time records to approve` : 'Time records up to date'}
                            tone={inbox.pendingTotal ? 'amber' : undefined}
                            href="/employee-management/requests"
                        />
                    )}
                    {payroll && (
                        <Tile
                            icon={Banknote}
                            label="Next pay day"
                            value={payroll.nextPayDate ? fmt(payroll.nextPayDate) : '—'}
                            hint={payroll.nextPayDate ? `${payroll.nextPayCode} · in ${daysBetween(today, payroll.nextPayDate)} day(s)` : 'No upcoming pay period'}
                            href="/payroll/runs"
                        />
                    )}
                    {compliance && (
                        <Tile
                            icon={BadgeCheck}
                            label="Filings due (14 days)"
                            value={String(compliance.overdue + compliance.dueSoon)}
                            hint={compliance.overdue ? `${compliance.overdue} overdue` : 'None overdue'}
                            tone={compliance.overdue ? 'rose' : undefined}
                            href="/employee-management/compliance"
                        />
                    )}
                    {!compliance && people && <Tile icon={Users} label="Active employees" value={String(people.active)} hint={`${people.newThisMonth.length} joined this month`} href="/libraries/employees" />}
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                    {/* Left: today + trend */}
                    <div className="space-y-4 xl:col-span-2">
                        {team && <TodayCard team={team} />}
                        {trend && trend.daily.length > 1 && (
                            <Panel
                                title="Attendance, last 14 days"
                                subtitle={`${trend.rate !== null ? `${trend.rate}% average` : '—'} · ${trend.absences} absences · ${trend.lateCount} late arrivals`}
                                href="/employee-management/reports?tab=attendance&preset=this_month"
                                linkLabel="People Reports"
                            >
                                <TrendLine data={trend.daily} x="date" y="rate" label="Attendance rate" xFormat={(v) => fmt(v)} yFormat={(v) => `${Math.round(v)}%`} domain={['dataMin', 100]} height={180} />
                            </Panel>
                        )}
                        {inbox && <InboxCard inbox={inbox} today={today} />}
                    </div>

                    {/* Right: payroll, compliance, people */}
                    <div className="space-y-4">
                        {payroll && <PayrollCard payroll={payroll} today={today} />}
                        {compliance && <ComplianceCard compliance={compliance} today={today} />}
                        {out && <OutCard out={out} />}
                        {people && <PeopleCard people={people} today={today} />}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

/* ---------------------------------------------------------------------------------------------- */

function Tile({ icon: Icon, label, value, hint, tone, href }: { icon: React.ElementType; label: string; value: string; hint: string; tone?: 'amber' | 'rose'; href: string }) {
    return (
        <Link
            href={href}
            className={cn(
                'group rounded-xl border bg-card p-3.5 shadow-sm transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                tone === 'amber' && 'border-amber-300 dark:border-amber-900',
                tone === 'rose' && 'border-rose-300 dark:border-rose-900',
            )}
        >
            <p className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                <span className="flex items-center gap-1.5">
                    <Icon className="size-3.5" /> {label}
                </span>
                <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
            <p className={cn('mt-1 font-mono text-2xl font-semibold tabular-nums', tone === 'amber' && 'text-amber-700 dark:text-amber-400', tone === 'rose' && 'text-rose-600 dark:text-rose-400')}>{value}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>
        </Link>
    );
}

function Panel({ title, subtitle, href, linkLabel, children, className }: { title: string; subtitle?: React.ReactNode; href?: string; linkLabel?: string; children: React.ReactNode; className?: string }) {
    return (
        <section className={cn('rounded-xl border bg-card shadow-sm', className)}>
            <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
                </div>
                {href && (
                    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                        {linkLabel ?? 'Open'} <ArrowRight className="size-3.5" />
                    </Link>
                )}
            </header>
            <div className="px-4 pb-4">{children}</div>
        </section>
    );
}

function Person({ person, meta, right }: { person: { name: string; employee_code?: string; code?: string; avatar_url?: string | null; avatarUrl?: string | null }; meta?: React.ReactNode; right?: React.ReactNode }) {
    return (
        <li className="flex items-center gap-2.5 py-2">
            <PersonAvatar src={person.avatar_url ?? person.avatarUrl} seed={person.employee_code ?? person.code ?? person.name} name={person.name} className="size-7" />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{person.name}</span>
                {meta && <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>}
            </span>
            {right && <span className="shrink-0 text-right text-xs">{right}</span>}
        </li>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Today                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

function TodayCard({ team }: { team: NonNullable<Props['team']> }) {
    const c = team.counts;
    // Fixed order so each state keeps its color; counts are always printed (relief for low-contrast slots).
    const parts = [
        { key: 'working', label: 'Working', value: c.working },
        { key: 'done', label: 'Done for the day', value: c.done },
        { key: 'expected', label: 'Expected', value: c.expected },
        { key: 'late', label: 'Late, not in', value: c.late },
        { key: 'leave', label: 'On leave', value: c.onLeave },
        { key: 'absent', label: 'Absent', value: c.absent },
    ];
    const total = parts.reduce((a, p) => a + p.value, 0);
    const color = (i: number) => (i < 5 ? vizVar(i) : 'var(--muted-foreground)');
    const updated = new Date(team.generatedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

    return (
        <Panel title="Today’s attendance" subtitle={`${c.scheduled} scheduled · ${c.off} on rest day or holiday · as of ${updated}`} href="/employee-management/attendance?view=today" linkLabel="Team board">
            {total > 0 ? (
                <>
                    <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
                        {parts.map((p, i) =>
                            p.value > 0 ? <div key={p.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, background: color(i) }} title={`${p.label}: ${p.value}`} /> : null,
                        )}
                    </div>
                    <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                        {parts.map((p, i) => (
                            <li key={p.key} className="flex items-center gap-2 text-xs">
                                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: color(i) }} />
                                <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.label}</span>
                                <span className="font-mono font-semibold tabular-nums">{p.value}</span>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <p className="py-4 text-sm text-muted-foreground">Nobody is scheduled today.</p>
            )}

            {(team.attention.length > 0 || team.arrivedLate.length > 0) && (
                <div className="mt-4 grid gap-4 border-t pt-3 md:grid-cols-2">
                    <div>
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                            <AlertTriangle className="size-3.5 text-amber-600" /> Not in yet / absent
                        </p>
                        {team.attention.length === 0 ? (
                            <p className="py-3 text-xs text-muted-foreground">Everyone expected so far is in.</p>
                        ) : (
                            <ul className="divide-y">
                                {team.attention.map((p) => (
                                    <Person
                                        key={p.id}
                                        person={p}
                                        meta={`${p.position ?? '—'}${p.shift_start ? ` · shift ${time12(p.shift_start)}` : ''}`}
                                        right={
                                            p.status === 'absent' ? (
                                                <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-medium', TONE.rose)}>Absent</span>
                                            ) : (
                                                <span className="text-amber-700 dark:text-amber-400">{p.late_by ? `${minutes(p.late_by)} late` : 'Late'}</span>
                                            )
                                        }
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                    <div>
                        <p className="flex items-center gap-1.5 text-xs font-semibold">
                            <Clock className="size-3.5 text-muted-foreground" /> Arrived late today
                        </p>
                        {team.arrivedLate.length === 0 ? (
                            <p className="py-3 text-xs text-muted-foreground">No late arrivals so far.</p>
                        ) : (
                            <ul className="divide-y">
                                {team.arrivedLate.map((p) => (
                                    <Person key={p.id} person={p} meta={p.position ?? '—'} right={<span className="font-mono text-muted-foreground">+{minutes(p.tardiness_minutes)}</span>} />
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </Panel>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Inbox                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

function InboxCard({ inbox, today }: { inbox: NonNullable<Props['inbox']>; today: string }) {
    const kinds = Object.entries(inbox.pendingByKind).sort((a, b) => b[1] - a[1]);
    return (
        <Panel title="Needs your decision" subtitle="Oldest first — decide these before computing payroll." href="/employee-management/requests" linkLabel="Requests inbox">
            <div className="flex flex-wrap gap-2">
                {kinds.length === 0 && <span className="text-xs text-muted-foreground">No pending requests.</span>}
                {kinds.map(([kind, n]) => (
                    <span key={kind} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs">
                        {KIND_LABEL[kind] ?? kind} <span className="font-mono font-semibold">{n}</span>
                    </span>
                ))}
            </div>

            {inbox.oldest.length > 0 && (
                <ul className="mt-2 divide-y">
                    {inbox.oldest.map((r) => (
                        <Person
                            key={r.key}
                            person={r.employee ?? { name: 'Unknown' }}
                            meta={`${r.title} · ${r.date_from === r.date_to || !r.date_to ? fmt(r.date_from) : `${fmt(r.date_from)} – ${fmt(r.date_to)}`}`}
                            right={<span className="text-muted-foreground">filed {ago(r.filed_at, today)}</span>}
                        />
                    ))}
                </ul>
            )}

            {(inbox.unapprovedRecords > 0 || inbox.incompleteRecords > 0) && (
                <Link
                    href="/employee-management/attendance?view=timesheets"
                    className={cn('mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors hover:opacity-90', TONE.amber)}
                >
                    <span className="flex items-center gap-2">
                        <ClipboardList className="size-4 shrink-0" />
                        <span>
                            <strong>{inbox.unapprovedRecords}</strong> past time record{inbox.unapprovedRecords === 1 ? '' : 's'} not approved
                            {inbox.incompleteRecords > 0 && (
                                <>
                                    {' '}
                                    · <strong>{inbox.incompleteRecords}</strong> with a missing punch
                                </>
                            )}
                            {inbox.oldestUnapproved && <> · oldest {fmt(inbox.oldestUnapproved)}</>}
                        </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0" />
                </Link>
            )}
        </Panel>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Payroll, compliance, out, people                                                                */
/* ---------------------------------------------------------------------------------------------- */

function PayrollCard({ payroll, today }: { payroll: NonNullable<Props['payroll']>; today: string }) {
    return (
        <Panel title="Payroll" subtitle="Pay periods not yet released" href="/payroll/runs" linkLabel="Payroll">
            {payroll.periods.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">All payrolls are released.</p>
            ) : (
                <ul className="divide-y">
                    {payroll.periods.map((p) => {
                        const status = RUN_STATUS[p.run?.status ?? 'none'];
                        const payIn = p.pay_date ? daysBetween(today, p.pay_date) : null;
                        return (
                            <li key={p.id}>
                                <Link href={p.run ? `/payroll/runs/${p.run.id}` : '/payroll/runs'} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium">
                                            {fmt(p.start_date)} – {fmt(p.end_date)}
                                        </span>
                                        <span className={cn('block text-[11px]', payIn !== null && payIn < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground')}>
                                            {payIn === null ? 'No pay date' : payIn < 0 ? `Pay day was ${fmt(p.pay_date)}` : payIn === 0 ? 'Pay day today' : `Pay day ${fmt(p.pay_date)} · in ${payIn}d`}
                                            {p.run && p.run.net_total > 0 && ` · net ${peso(p.run.net_total)}`}
                                        </span>
                                    </span>
                                    <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE[status.tone])}>{p.run ? status.label : p.cutoffOver ? 'Ready to compute' : 'Cut-off open'}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}

function ComplianceCard({ compliance, today }: { compliance: NonNullable<Props['compliance']>; today: string }) {
    return (
        <Panel
            title="Compliance"
            subtitle={`${compliance.overdue} overdue · ${compliance.dueSoon} due in 14 days${compliance.awaitingVerification ? ` · ${compliance.awaitingVerification} to verify` : ''}`}
            href="/employee-management/compliance"
            linkLabel="Calendar"
        >
            {compliance.items.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Nothing due in the next two weeks.</p>
            ) : (
                <ul className="divide-y">
                    {compliance.items.map((i) => {
                        const d = i.due_date ? daysBetween(today, i.due_date) : null;
                        return (
                            <li key={i.id} className="flex items-center gap-3 py-2.5">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">
                                        {i.agency} {i.form_code}
                                    </span>
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                        {i.period} · {i.status === 'prepared' ? 'prepared, not filed' : 'to prepare'}
                                    </span>
                                </span>
                                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium', i.overdue ? TONE.rose : d !== null && d <= 3 ? TONE.amber : TONE.slate)}>
                                    {i.overdue ? `${-(d ?? 0)}d overdue` : d === 0 ? 'Due today' : `Due ${fmt(i.due_date)}`}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}

function OutCard({ out }: { out: NonNullable<Props['out']> }) {
    return (
        <Panel title="Who’s out" subtitle="Approved leave today and the next 7 days">
            {out.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">Nobody is on leave this week.</p>
            ) : (
                <ul className="divide-y">
                    {out.map((l) => (
                        <Person
                            key={`${l.id}-${l.start}`}
                            person={l}
                            meta={[l.type, l.position].filter(Boolean).join(' · ')}
                            right={
                                l.today ? (
                                    <span className={cn('rounded-full border px-1.5 py-px text-[10px] font-medium', TONE.sky)}>Out today</span>
                                ) : (
                                    <span className="text-muted-foreground">{l.start === l.end ? fmt(l.start) : `${fmt(l.start)} – ${fmt(l.end)}`}</span>
                                )
                            }
                        />
                    ))}
                </ul>
            )}
        </Panel>
    );
}

function PeopleCard({ people, today }: { people: NonNullable<Props['people']>; today: string }) {
    const rows: { icon: React.ElementType; count: number; text: string; tone?: 'amber' }[] = [
        { icon: BadgeCheck, count: people.probationDue.length, text: 'probation review(s) due within 30 days', tone: 'amber' },
        { icon: IdCard, count: people.missingIds, text: 'missing a government ID', tone: 'amber' },
        { icon: CreditCard, count: people.noBank, text: 'without a payroll bank account' },
    ];

    return (
        <Panel title="People" subtitle={`${people.active} active employees`} href="/libraries/employees" linkLabel="Directory">
            <ul className="space-y-2 text-sm">
                {rows.map(({ icon: Icon, count, text, tone }) => (
                    <li key={text} className="flex items-center gap-2.5">
                        <span className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-md border', count && tone ? TONE[tone] : TONE.slate)}>
                            <Icon className="size-3.5" />
                        </span>
                        <span className={count ? '' : 'text-muted-foreground'}>
                            <span className="font-semibold tabular-nums">{count}</span> {text}
                        </span>
                    </li>
                ))}
            </ul>

            {people.probationDue.length > 0 && (
                <Sub title="Probation reviews" icon={CalendarClock}>
                    {people.probationDue.map((p) => {
                        const d = daysBetween(today, p.due);
                        return <Person key={p.id} person={p} meta={p.position ?? '—'} right={<span className={d < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'}>{d < 0 ? `${-d}d past 6 mo` : `6 mo on ${fmt(p.due)}`}</span>} />;
                    })}
                </Sub>
            )}
            {people.newThisMonth.length > 0 && (
                <Sub title="Joined this month" icon={UserPlus}>
                    {people.newThisMonth.map((p) => (
                        <Person key={p.id} person={p} meta={p.position ?? '—'} />
                    ))}
                </Sub>
            )}
            {people.anniversaries.length > 0 && (
                <Sub title="Work anniversaries this month" icon={Cake}>
                    {people.anniversaries.map((p) => (
                        <Person key={p.id} person={p} meta={p.position ?? '—'} right={<span className="text-muted-foreground">{p.years} yr · {fmt(p.date)}</span>} />
                    ))}
                </Sub>
            )}
        </Panel>
    );
}

function Sub({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
    return (
        <div className="mt-4 border-t pt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Icon className="size-3.5 text-muted-foreground" /> {title}
            </p>
            <ul className="divide-y">{children}</ul>
        </div>
    );
}
