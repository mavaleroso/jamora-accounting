import { PersonAvatar } from '@/components/person-avatar';
import { cn } from '@/lib/utils';
import { TONE } from '../attendance/lib';
import { ChartCard, Empty, MiniTable, RankBars } from './charts';
import { fullDate, num, peso, type Leave } from './lib';

export function LeaveSection({ data, canSeePay, year }: { data: Leave; canSeePay: boolean; year: number }) {
    const statuses = [
        { label: 'Approved', value: data.approved, tone: TONE.emerald },
        { label: 'Pending', value: data.pending, tone: TONE.amber },
        { label: 'Declined', value: data.declined, tone: TONE.slate },
    ];
    const liability = data.balances.reduce((a, b) => a + (b.value ?? 0), 0);

    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
                <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-sm font-semibold">Requests in this period</h3>
                    <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">{data.filed}</p>
                    <p className="text-xs text-muted-foreground">leave requests overlapping the period</p>
                    <ul className="mt-4 space-y-2">
                        {statuses.map((s) => (
                            <li key={s.label} className="flex items-center justify-between text-sm">
                                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', s.tone)}>{s.label}</span>
                                <span className="font-mono tabular-nums">{s.value}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 border-t pt-3 text-sm">
                        <span className="font-mono font-semibold tabular-nums">{num(data.daysTaken, 1)}</span> days taken
                        {data.unpaidDays > 0 && <span className="text-muted-foreground"> · {num(data.unpaidDays, 1)} unpaid</span>}
                    </p>
                </section>

                <ChartCard
                    className="lg:col-span-2"
                    title="Days taken by leave type"
                    description="Approved leave in this period"
                    table={<MiniTable head={['Leave type', 'Requests', 'Days']} rows={data.byType.map((t) => [t.type, t.requests, num(t.days, 1)])} />}
                >
                    {data.byType.length ? (
                        <RankBars rows={data.byType.map((t) => ({ label: t.type, value: t.days, hint: `${t.requests} request${t.requests === 1 ? '' : 's'}` }))} format={(v) => `${num(v, 1)}d`} />
                    ) : (
                        <Empty>No approved leave in this period.</Empty>
                    )}
                </ChartCard>
            </div>

            <section className="rounded-xl border bg-card shadow-sm">
                <header className="flex flex-col gap-1 px-4 pt-4 pb-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 className="text-sm font-semibold">Leave balances {year}</h3>
                        <p className="text-xs text-muted-foreground">Entitlement includes carry-over and adjustments.</p>
                    </div>
                    {canSeePay && liability > 0 && (
                        <p className="text-xs text-muted-foreground">
                            Unused leave valued at daily rates: <span className="font-mono font-semibold text-foreground">{peso(liability)}</span>
                        </p>
                    )}
                </header>
                {data.balances.length === 0 ? (
                    <p className="px-4 pb-6 text-sm text-muted-foreground">No leave balances for {year}.</p>
                ) : (
                    <div className="overflow-x-auto border-t">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-xs text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium">Leave type</th>
                                    <th className="px-3 py-2 text-right font-medium">Employees</th>
                                    <th className="px-3 py-2 text-right font-medium">Entitled</th>
                                    <th className="px-3 py-2 text-right font-medium">Used</th>
                                    <th className="px-3 py-2 text-right font-medium">Available</th>
                                    <th className="hidden w-40 px-3 py-2 text-left font-medium md:table-cell">Utilization</th>
                                    {canSeePay && <th className="px-4 py-2 text-right font-medium">Value</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {data.balances.map((b) => {
                                    const used = b.entitled > 0 ? Math.round((b.used / b.entitled) * 100) : 0;
                                    return (
                                        <tr key={b.type}>
                                            <td className="px-4 py-2 font-medium">{b.type}</td>
                                            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{b.employees}</td>
                                            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{num(b.entitled, 1)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">{num(b.used, 1)}</td>
                                            <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">{num(b.available, 1)}</td>
                                            <td className="hidden px-3 py-2 md:table-cell">
                                                <div className="flex items-center gap-2" title={`${used}% used`}>
                                                    <div className="h-1.5 flex-1 rounded-full bg-muted">
                                                        <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.min(100, used)}%` }} />
                                                    </div>
                                                    <span className="w-8 text-right text-[11px] text-muted-foreground tabular-nums">{used}%</span>
                                                </div>
                                            </td>
                                            {canSeePay && <td className="px-4 py-2 text-right font-mono text-xs tabular-nums">{peso(b.value)}</td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="rounded-xl border bg-card shadow-sm">
                <header className="px-4 pt-4 pb-2">
                    <h3 className="text-sm font-semibold">On leave in the next 14 days</h3>
                    <p className="text-xs text-muted-foreground">Approved leave — plan coverage ahead.</p>
                </header>
                {data.upcoming.length === 0 ? (
                    <p className="px-4 pb-6 text-sm text-muted-foreground">Nobody is scheduled to be on leave.</p>
                ) : (
                    <ul className="divide-y">
                        {data.upcoming.map((u) => (
                            <li key={`${u.id}-${u.start}`} className="flex items-center gap-3 px-4 py-2.5">
                                <PersonAvatar src={u.avatarUrl} seed={u.code} name={u.name} className="size-8" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{u.name}</span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {u.type} · {u.department ?? 'Unassigned'}
                                    </span>
                                </span>
                                <span className="text-right text-xs">
                                    {u.start === u.end ? fullDate(u.start) : `${fullDate(u.start)} – ${fullDate(u.end)}`}
                                    <span className="block text-muted-foreground">
                                        {num(u.days, 1)} day{u.days === 1 ? '' : 's'}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
