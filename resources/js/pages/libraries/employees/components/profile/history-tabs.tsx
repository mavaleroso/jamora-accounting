import { cn } from '@/lib/utils';
import { ChangePreview, dayKey, dayLabel, describeDevice, EventBadge, fmtTime as fmtClock } from '@/pages/admin/audit-trails/components/shared';
import { ATTENDANCE_STATUS, fmtHours, fmtMinutes, fmtTime, RECORD_STATUS, TONE, weekday } from '@/pages/employee-management/attendance/lib';
import { fmtDays, KINDS, STATUS, timeAgo, type Status } from '@/pages/employee-management/requests/lib';
import { PayslipDialog } from '@/pages/payroll/runs/components';
import { peso, RUN_STATUS } from '@/pages/payroll/runs/lib';
import type { AuditTrail } from '@/types';
import { Link } from '@inertiajs/react';
import { ArrowRight, ChevronRight, ExternalLink, Inbox, Monitor } from 'lucide-react';
import * as React from 'react';
import type { EmployeeOverview, ProfilePayslip } from './types';

/* Shared ------------------------------------------------------------------------------------------ */

function Chip({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
    return (
        <span className={cn('inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-medium whitespace-nowrap', TONE[tone])}>
            {children}
        </span>
    );
}

function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'emerald' | 'amber' | 'rose' }) {
    return (
        <div className="bg-card rounded-lg border px-3 py-2.5 shadow-sm">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</p>
            <p
                className={cn(
                    'mt-0.5 font-mono text-lg font-semibold tabular-nums',
                    tone === 'emerald' && 'text-emerald-700 dark:text-emerald-400',
                    tone === 'amber' && 'text-amber-700 dark:text-amber-400',
                    tone === 'rose' && 'text-rose-600 dark:text-rose-400',
                )}
            >
                {value}
            </p>
            {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
        </div>
    );
}

function Empty({ icon: Icon = Inbox, children }: { icon?: typeof Inbox; children: React.ReactNode }) {
    return (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            <Icon className="size-6 opacity-60" />
            {children}
        </div>
    );
}

function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href} className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline">
            {children} <ArrowRight className="size-3" />
        </Link>
    );
}

const shortDate = (d: string, year = true) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const range = (from: string, to: string) => (from === to ? shortDate(from) : `${shortDate(from, false)} – ${shortDate(to)}`);

/* Payroll ----------------------------------------------------------------------------------------- */

export function PayrollTab({ payroll }: { payroll: NonNullable<EmployeeOverview['payroll']> }) {
    const [slip, setSlip] = React.useState<ProfilePayslip | null>(null);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Tile
                    label={`Net pay · ${payroll.year}`}
                    value={peso(payroll.ytd.net)}
                    hint={`${payroll.ytd.payslips} released payslip${payroll.ytd.payslips === 1 ? '' : 's'}`}
                    tone="emerald"
                />
                <Tile label="Gross pay" value={peso(payroll.ytd.gross)} />
                <Tile label="Contributions" value={peso(payroll.ytd.contributions)} hint="SSS, PhilHealth, Pag-IBIG" />
                <Tile label="Tax withheld" value={peso(payroll.ytd.withholding_tax)} />
                <Tile label="13th month accrued" value={peso(payroll.ytd.thirteenth_month)} />
            </div>

            {payroll.payslips.length === 0 ? (
                <Empty>No payroll has been computed for this employee yet.</Empty>
            ) : (
                <div className="bg-card overflow-x-auto rounded-xl border shadow-sm">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead>
                            <tr className="text-muted-foreground border-b text-[11px] tracking-wide uppercase">
                                <th className="px-4 py-2 text-left font-medium">Pay period</th>
                                <th className="px-4 py-2 text-left font-medium">Status</th>
                                <th className="px-4 py-2 text-right font-medium">Gross</th>
                                <th className="px-4 py-2 text-right font-medium">Deductions</th>
                                <th className="px-4 py-2 text-right font-medium">Net pay</th>
                                <th className="w-8" />
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {payroll.payslips.map((p) => {
                                const status = RUN_STATUS[p.run.status] ?? RUN_STATUS.none;
                                return (
                                    <tr key={p.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setSlip(p)}>
                                        <td className="px-4 py-2.5">
                                            <p className="font-medium">{range(p.period.start_date, p.period.end_date)}</p>
                                            <p className="text-muted-foreground text-[11px]">
                                                {p.period.code}
                                                {p.period.pay_date && ` · pay day ${shortDate(p.period.pay_date)}`}
                                            </p>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Chip tone={status.tone as keyof typeof TONE}>{status.label}</Chip>
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{peso(p.gross_pay)}</td>
                                        <td className="px-4 py-2.5 text-right font-mono text-rose-600 tabular-nums dark:text-rose-400">
                                            −{peso(p.total_deductions)}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">{peso(p.net_pay)}</td>
                                        <td className="pr-3">
                                            <ChevronRight className="text-muted-foreground/60 size-4" />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            <p className="text-muted-foreground text-xs">
                Draft and approved payroll can still change; only posted and paid payroll counts toward the year’s totals.
            </p>

            <PayslipDialog
                payslip={slip}
                period={slip ? slip.period : { start_date: '', end_date: '', pay_date: null }}
                editable={false}
                onClose={() => setSlip(null)}
            />
        </div>
    );
}

/* Requests ---------------------------------------------------------------------------------------- */

const STATUS_FILTERS: (Status | 'all')[] = ['all', 'pending', 'approved', 'declined', 'cancelled'];

export function RequestsTab({ requests }: { requests: NonNullable<EmployeeOverview['requests']> }) {
    const [filter, setFilter] = React.useState<Status | 'all'>('all');
    const total = Object.values(requests.counts).reduce((a, n) => a + (n ?? 0), 0);
    const items = filter === 'all' ? requests.items : requests.items.filter((r) => r.status === filter);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                    {STATUS_FILTERS.map((s) => {
                        const n = s === 'all' ? total : (requests.counts[s] ?? 0);
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setFilter(s)}
                                className={cn(
                                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                    filter === s ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted',
                                )}
                            >
                                {s === 'all' ? 'All' : STATUS[s].label} <span className="tabular-nums opacity-70">{n}</span>
                            </button>
                        );
                    })}
                </div>
                <OpenLink href="/employee-management/requests">Open Employee Requests</OpenLink>
            </div>

            {items.length === 0 ? (
                <Empty>
                    {filter === 'all' ? 'No leave or attendance requests filed.' : `No ${STATUS[filter as Status].label.toLowerCase()} requests.`}
                </Empty>
            ) : (
                <ul className="bg-card divide-y rounded-xl border shadow-sm">
                    {items.map((r) => {
                        const kind = KINDS[r.kind];
                        const Icon = kind?.icon ?? Inbox;
                        return (
                            <li key={r.key} className="flex items-start gap-3 px-4 py-3">
                                <span
                                    className={cn(
                                        'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
                                        TONE[kind?.tone ?? 'slate'],
                                    )}
                                >
                                    <Icon className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                        {r.title}
                                        <Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip>
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                        {range(r.date_from, r.date_to)}
                                        {r.kind === 'leave' && r.details.days ? ` · ${fmtDays(r.details.days)}` : ''}
                                        {r.kind === 'overtime' && r.details.ot_hours ? ` · ${fmtHours(r.details.ot_hours)}` : ''}
                                        {r.details.destination ? ` · ${r.details.destination}` : ''}
                                    </p>
                                    {r.reason && <p className="mt-1 line-clamp-2 text-xs">{r.reason}</p>}
                                    {r.remarks && <p className="text-muted-foreground mt-1 text-xs italic">“{r.remarks}”</p>}
                                </div>
                                <div className="text-muted-foreground shrink-0 text-right text-[11px]">
                                    <p>Filed {timeAgo(r.filed_at)}</p>
                                    {r.filed_by && <p>by {r.filed_by}</p>}
                                    {r.decided_by && (
                                        <p>
                                            {STATUS[r.status].label} by {r.decided_by}
                                        </p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/* Attendance -------------------------------------------------------------------------------------- */

export function AttendanceTab({ attendance }: { attendance: NonNullable<EmployeeOverview['attendance']> }) {
    const s = attendance.summary;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                    Last 60 days · {shortDate(attendance.from)} – {shortDate(attendance.to)}
                </p>
                <OpenLink href="/employee-management/attendance">Open Time & Attendance</OpenLink>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Tile label="Days worked" value={s.days_worked} hint={`${fmtHours(s.hours_worked)} regular`} />
                <Tile
                    label="Late"
                    value={s.late_days}
                    hint={s.late_minutes ? fmtMinutes(s.late_minutes) : 'On time'}
                    tone={s.late_days ? 'amber' : undefined}
                />
                <Tile label="Undertime" value={fmtMinutes(s.undertime_minutes) || '0m'} tone={s.undertime_minutes ? 'amber' : undefined} />
                <Tile
                    label="Absences"
                    value={s.absences}
                    tone={s.absences ? 'rose' : undefined}
                    hint={s.leave_days ? `${s.leave_days} on leave` : undefined}
                />
                <Tile label="Overtime" value={fmtHours(s.ot_hours) || '0h'} hint="Approved" />
                <Tile
                    label="To review"
                    value={s.pending + s.missing_punches}
                    hint={s.missing_punches ? `${s.missing_punches} missing punch${s.missing_punches === 1 ? '' : 'es'}` : 'Pending approval'}
                    tone={s.missing_punches ? 'rose' : s.pending ? 'amber' : undefined}
                />
            </div>

            {attendance.days.length === 0 ? (
                <Empty>No time records in the last 60 days.</Empty>
            ) : (
                <div className="bg-card overflow-x-auto rounded-xl border shadow-sm">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="text-muted-foreground border-b text-[11px] tracking-wide uppercase">
                                <th className="px-4 py-2 text-left font-medium">Date</th>
                                <th className="px-3 py-2 text-left font-medium">In</th>
                                <th className="px-3 py-2 text-left font-medium">Break</th>
                                <th className="px-3 py-2 text-left font-medium">Out</th>
                                <th className="px-3 py-2 text-right font-medium">Hours</th>
                                <th className="px-3 py-2 text-right font-medium">Late / UT</th>
                                <th className="px-3 py-2 text-right font-medium">OT</th>
                                <th className="px-4 py-2 text-left font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {attendance.days.map((d) => {
                                const att = d.attendance_status ? ATTENDANCE_STATUS[d.attendance_status] : null;
                                const rec = RECORD_STATUS[d.status];
                                return (
                                    <tr key={d.id}>
                                        <td className="px-4 py-2">
                                            <span className="text-muted-foreground mr-1.5 inline-block w-8 text-xs">{weekday(d.work_date)}</span>
                                            {shortDate(d.work_date, false)}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs">{fmtTime(d.time_in) || '—'}</td>
                                        <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                                            {d.break_out || d.break_in ? `${fmtTime(d.break_out) || '—'} – ${fmtTime(d.break_in) || '—'}` : '—'}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs">{fmtTime(d.time_out) || '—'}</td>
                                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                                            {d.regular_hours ? fmtHours(d.regular_hours) : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                                            {d.tardiness_minutes || d.undertime_minutes ? (
                                                <span className="text-amber-700 dark:text-amber-400">
                                                    {[
                                                        d.tardiness_minutes && fmtMinutes(d.tardiness_minutes),
                                                        d.undertime_minutes && `UT ${fmtMinutes(d.undertime_minutes)}`,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                                            {d.ot_hours_approved ? fmtHours(d.ot_hours_approved) : '—'}
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="flex flex-wrap gap-1">
                                                {att && <Chip tone={att.tone}>{att.label}</Chip>}
                                                {rec && <Chip tone={rec.tone}>{rec.label}</Chip>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/* Activity ---------------------------------------------------------------------------------------- */

export function ActivityTab({ activity }: { activity: NonNullable<EmployeeOverview['activity']> }) {
    const groups = React.useMemo(() => {
        const map = new Map<string, AuditTrail[]>();
        activity.items.forEach((item) => {
            const key = dayKey(item.created_at);
            map.set(key, [...(map.get(key) ?? []), item]);
        });
        return [...map.entries()];
    }, [activity.items]);
    const fullTrail = `/admin/audit-trails?subject_type=${encodeURIComponent(activity.subject.type)}&subject_id=${activity.subject.id}`;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                    Changes to this employee’s record and login, their requests, benefits, payroll adjustments and recent time records, plus sign-ins.
                </p>
                <OpenLink href={fullTrail}>Open in Audit Trails</OpenLink>
            </div>

            {activity.items.length === 0 ? (
                <Empty>No recorded activity yet.</Empty>
            ) : (
                <div className="space-y-5">
                    {groups.map(([key, items]) => (
                        <section key={key}>
                            <h4 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{dayLabel(key)}</h4>
                            <ol className="bg-card divide-y rounded-xl border shadow-sm">
                                {items.map((a) => {
                                    const device = describeDevice(a.request.user_agent);
                                    return (
                                        <li key={a.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
                                            <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs sm:pt-0.5">
                                                {fmtClock(a.created_at)}
                                            </span>
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <p className="flex flex-wrap items-center gap-2 text-sm">
                                                    <EventBadge event={a.event} />
                                                    <span className="font-medium">{a.subject.label ?? a.subject.type_label}</span>
                                                </p>
                                                <div className="text-xs">
                                                    {a.event === 'login' || a.event === 'logout' || a.changes.length === 0 ? (
                                                        <span className="text-muted-foreground">{a.description ?? '—'}</span>
                                                    ) : (
                                                        <ChangePreview changes={a.changes} event={a.event} fallback={a.description} />
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-muted-foreground shrink-0 text-[11px] sm:text-right">
                                                <p>{a.user?.name ?? 'System'}</p>
                                                {(a.request.ip || device) && (
                                                    <p className="inline-flex items-center gap-1">
                                                        <Monitor className="size-3" />
                                                        {[device, a.request.ip].filter(Boolean).join(' · ')}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        </section>
                    ))}
                    {activity.truncated && (
                        <p className="text-muted-foreground flex items-center gap-1 text-xs">
                            Showing the latest 100 entries.
                            <Link href={fullTrail} className="text-primary inline-flex items-center gap-1 hover:underline">
                                See everything <ExternalLink className="size-3" />
                            </Link>
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
