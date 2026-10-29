import { Link } from '@inertiajs/react';
import { AlertTriangle, ArrowDown, ArrowUp, Search } from 'lucide-react';
import * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TONE } from '../attendance/lib';
import { ChartCard, Empty, MiniTable, TrendLine } from './charts';
import { dayLabel, fullDate, hours, num, pct, type Attendance, type AttendanceFlags, type AttendanceSummary, type Person } from './lib';

type Row = AttendanceSummary & AttendanceFlags & Person;
type SortKey = 'name' | 'rate' | 'absences' | 'unauthorizedAbsences' | 'lateCount' | 'lateMinutes' | 'undertimeMinutes' | 'overBreakMinutes' | 'otApproved';

const COLUMNS: { key: SortKey; label: string; format: (r: Row) => React.ReactNode; className?: string }[] = [
    { key: 'rate', label: 'Attendance', format: (r) => pct(r.rate) },
    { key: 'absences', label: 'Absences', format: (r) => r.absences || '—' },
    { key: 'unauthorizedAbsences', label: 'Unauthorized', format: (r) => r.unauthorizedAbsences || '—' },
    { key: 'lateCount', label: 'Lates', format: (r) => r.lateCount || '—' },
    { key: 'lateMinutes', label: 'Late time', format: (r) => (r.lateMinutes ? hours(r.lateMinutes) : '—'), className: 'hidden md:table-cell' },
    { key: 'undertimeMinutes', label: 'Undertime', format: (r) => (r.undertimeMinutes ? hours(r.undertimeMinutes) : '—'), className: 'hidden lg:table-cell' },
    {
        key: 'overBreakMinutes',
        label: 'Over-breaks',
        format: (r) => (r.overBreaks ? `${r.overBreaks} · ${hours(r.overBreakMinutes)}` : '—'),
        className: 'hidden lg:table-cell',
    },
    { key: 'otApproved', label: 'OT approved', format: (r) => (r.otApproved ? `${num(r.otApproved, 2)}h` : '—'), className: 'hidden md:table-cell' },
];

export function AttendanceSection({ data }: { data: Attendance }) {
    if (!data.through) {
        return <Empty>No completed working days in this period yet.</Empty>;
    }

    return (
        <div className="space-y-4">
            {(data.incomplete > 0 || data.unapproved > 0) && (
                <div className={cn('flex flex-col gap-2 rounded-lg border px-3.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between', TONE.amber)}>
                    <p className="flex items-center gap-2">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span>
                            Figures include {data.unapproved > 0 && <strong>{data.unapproved} unapproved</strong>}
                            {data.unapproved > 0 && data.incomplete > 0 && ' and '}
                            {data.incomplete > 0 && <strong>{data.incomplete} incomplete</strong>} time record{data.unapproved + data.incomplete === 1 ? '' : 's'} — they may still change.
                        </span>
                    </p>
                    <Link href="/employee-management/attendance" className="shrink-0 text-xs font-semibold underline underline-offset-2">
                        Review in Time & Attendance
                    </Link>
                </div>
            )}

            {(data.awolEmployees > 0 || data.overBreakEmployees > 0) && (
                <div className={cn('flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm', TONE.rose)}>
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <p>
                        {data.awolEmployees > 0 && (
                            <>
                                <strong>
                                    {data.awolEmployees} employee{data.awolEmployees === 1 ? '' : 's'} AWOL
                                </strong>{' '}
                                — {data.awolDays} or more scheduled days in a row absent without a timely notice. Issue a Notice to Explain; the system
                                does not separate anyone on its own.{' '}
                            </>
                        )}
                        {data.overBreakEmployees > 0 && (
                            <>
                                <strong>
                                    {data.overBreakEmployees} employee{data.overBreakEmployees === 1 ? '' : 's'} over the break limit
                                </strong>{' '}
                                — 3 or more over-breaks, or 30 minutes or more lost to them, in a month.
                            </>
                        )}
                    </p>
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-3">
                <ChartCard
                    className="xl:col-span-2"
                    title="Daily attendance rate"
                    description={`Share of scheduled employees who reported for work, through ${fullDate(data.through)}`}
                    table={<MiniTable head={['Date', 'Rate', 'Present', 'Late', 'Absent']} rows={data.daily.map((d) => [dayLabel(d.date), pct(d.rate), d.present, d.late, d.absent])} />}
                >
                    {data.daily.length > 1 ? (
                        <TrendLine data={data.daily} x="date" y="rate" label="Attendance rate" xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}%`} domain={['dataMin', 100]} height={240} />
                    ) : (
                        <Empty>Not enough days to show a trend.</Empty>
                    )}
                </ChartCard>

                <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-sm font-semibold">Time summary</h3>
                    <dl className="mt-3 divide-y text-sm">
                        <Stat label="Days worked" value={num(data.daysWorked)} />
                        <Stat
                            label="Absences"
                            value={num(data.absences)}
                            hint={data.unauthorizedAbsences > 0 ? `${num(data.unauthorizedAbsences)} without timely notice` : undefined}
                        />
                        <Stat label="Days on leave" value={num(data.leaveDays)} />
                        <Stat label="Late arrivals" value={`${num(data.lateCount)} · ${hours(data.lateMinutes)}`} />
                        <Stat label="Undertime" value={hours(data.undertimeMinutes)} />
                        <Stat label="Over-breaks" value={`${num(data.overBreaks)} · ${hours(data.overBreakMinutes)}`} />
                        <Stat label="Overtime rendered" value={`${num(data.otRendered, 2)}h`} />
                        <Stat label="Overtime approved" value={`${num(data.otApproved, 2)}h`} hint={data.otRendered > 0 ? `${Math.round((data.otApproved / data.otRendered) * 100)}% of rendered` : undefined} />
                        <Stat label="Night differential" value={`${num(data.nightDiffHours, 2)}h`} />
                    </dl>
                </section>
            </div>


            <EmployeeTable rows={data.byEmployee} />
        </div>
    );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-mono tabular-nums">
                {value}
                {hint && <span className="block font-sans text-[11px] text-muted-foreground">{hint}</span>}
            </dd>
        </div>
    );
}

function EmployeeTable({ rows }: { rows: Row[] }) {
    const [query, setQuery] = React.useState('');
    const [sort, setSort] = React.useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'absences', dir: 'desc' });

    const shown = rows
        .filter((r) => {
            const q = query.trim().toLowerCase();
            return !q || [r.name, r.code, r.position].some((v) => v?.toLowerCase().includes(q));
        })
        .sort((a, b) => {
            const av = sort.key === 'name' ? a.name : (a[sort.key] ?? -1);
            const bv = sort.key === 'name' ? b.name : (b[sort.key] ?? -1);
            const c = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
            return sort.dir === 'asc' ? c : -c;
        });

    const header = (key: SortKey, text: string, className?: string) => {
        const active = sort.key === key;
        return (
            <th className={cn('px-3 py-2 font-medium', key === 'name' ? 'text-left' : 'text-right', className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button
                    type="button"
                    className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')}
                    onClick={() => setSort({ key, dir: active && sort.dir === 'desc' ? 'asc' : key === 'name' ? 'asc' : 'desc' })}
                >
                    {text}
                    {active && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                </button>
            </th>
        );
    };

    return (
        <section className="rounded-xl border bg-card shadow-sm">
            <header className="flex flex-col gap-2 px-4 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-semibold">By employee</h3>
                    <p className="text-xs text-muted-foreground">Click a column to sort. Export the full list from the Export menu.</p>
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search employee" className="h-9 pl-8" aria-label="Search employee" />
                </div>
            </header>
            <div className="max-h-[32rem] overflow-auto border-t">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
                        <tr>
                            {header('name', 'Employee')}
                            {COLUMNS.map((c) => header(c.key, c.label, c.className))}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {shown.map((r) => (
                            <tr key={r.id} className="hover:bg-muted/30">
                                <td className="px-3 py-2">
                                    <div className="flex items-center gap-2.5">
                                        <PersonAvatar src={r.avatarUrl} seed={r.code} name={r.name} className="size-7" />
                                        <div className="min-w-0">
                                            <p className="truncate font-medium">{r.name}</p>
                                            <p className="truncate text-[11px] text-muted-foreground">
                                                {[r.code, r.position].filter(Boolean).join(' · ')}
                                            </p>
                                            {(r.awol || r.overBreakFlag) && (
                                                <p className="mt-0.5 flex flex-wrap gap-1">
                                                    {r.awol && (
                                                        <span className={cn('rounded border px-1.5 text-[10px] font-semibold', TONE.rose)}>AWOL · {r.awolStreak} days</span>
                                                    )}
                                                    {r.overBreakFlag && (
                                                        <span className={cn('rounded border px-1.5 text-[10px] font-semibold', TONE.amber)}>Over-break limit</span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                {COLUMNS.map((c) => (
                                    <td key={c.key} className={cn('px-3 py-2 text-right font-mono text-xs tabular-nums', c.className, c.key === 'rate' && r.rate !== null && r.rate < 90 && 'text-rose-600 dark:text-rose-400')}>
                                        {c.format(r)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {shown.length === 0 && (
                            <tr>
                                <td colSpan={COLUMNS.length + 1} className="px-3 py-10 text-center text-muted-foreground">
                                    No employees match.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
