import { Link } from '@inertiajs/react';
import { AlertTriangle, ArrowRight, BadgeCheck, CreditCard, IdCard } from 'lucide-react';
import { PersonAvatar } from '@/components/person-avatar';
import { cn } from '@/lib/utils';
import { TONE } from '../attendance/lib';
import { ChartCard, ColumnChart, Composition, Empty, MiniTable, RankBars, TrendLine } from './charts';
import { fullDate, label, monthLabel, num, type Workforce } from './lib';

export function WorkforceSection({ data }: { data: Workforce }) {
    const parts = (rows: Workforce['byType']) => rows.map((r) => ({ key: r.key, label: label(r.key), value: r.count }));

    return (
        <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard
                    title="Headcount"
                    description="Employees on the books at each month-end, last 12 months"
                    table={<MiniTable head={['Month', 'Headcount']} rows={data.trend.map((t) => [monthLabel(t.month, true), t.headcount])} />}
                >
                    <TrendLine data={data.trend} x="month" y="headcount" label="Headcount" xFormat={(v) => monthLabel(v)} yFormat={(v) => num(v)} domain={[0, 'auto']} />
                </ChartCard>
                <ChartCard
                    title="Hires and separations"
                    description="Per month, last 12 months"
                    table={<MiniTable head={['Month', 'Hires', 'Separations']} rows={data.trend.map((t) => [monthLabel(t.month, true), t.hires, t.separations])} />}
                >
                    <ColumnChart
                        data={data.trend}
                        x="month"
                        series={[
                            { key: 'hires', label: 'Hires', slot: 0 },
                            { key: 'separations', label: 'Separations', slot: 1 },
                        ]}
                        xFormat={(v) => monthLabel(v)}
                        yFormat={(v) => num(v)}
                    />
                </ChartCard>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard
                    title="By position"
                    description="Active employees at period end"
                    className="lg:col-span-1"
                    table={<MiniTable head={['Position', 'Active', 'Regular']} rows={data.byPosition.map((d) => [d.position, d.count, d.regular])} />}
                >
                    {data.byPosition.length ? (
                        <RankBars rows={data.byPosition.map((d) => ({ label: d.position, value: d.count, hint: `${d.regular} regular` }))} format={(v) => num(v)} />
                    ) : (
                        <Empty>No active employees.</Empty>
                    )}
                </ChartCard>

                <section className="space-y-5 rounded-xl border bg-card p-4 shadow-sm lg:col-span-1">
                    <div>
                        <h3 className="mb-2 text-sm font-semibold">Employment type</h3>
                        <Composition parts={parts(data.byType)} label="Employment type" />
                    </div>
                    <div>
                        <h3 className="mb-2 text-sm font-semibold">Pay basis</h3>
                        <Composition parts={parts(data.byPayType)} label="Pay basis" />
                    </div>
                    <div>
                        <h3 className="mb-2 text-sm font-semibold">Gender</h3>
                        <Composition parts={parts(data.byGender)} label="Gender" />
                    </div>
                </section>

                <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-sm font-semibold">Needs attention</h3>
                    <ul className="mt-3 space-y-2.5 text-sm">
                        <Attention icon={BadgeCheck} count={data.attention.probationDue.length} tone="amber" text="probation review(s) due within 30 days" href="/libraries/employees" />
                        <Attention icon={IdCard} count={data.attention.missingIds} tone="amber" text="employee(s) missing SSS, PhilHealth, Pag-IBIG or TIN" href="/libraries/employees" />
                        <Attention icon={CreditCard} count={data.attention.noBank} tone="sky" text="employee(s) without a payroll bank account" href="/libraries/employees" />
                    </ul>
                    {data.attention.probationDue.length > 0 && (
                        <ul className="mt-4 divide-y border-t">
                            {data.attention.probationDue.map((p) => (
                                <li key={p.id} className="flex items-center gap-2.5 py-2">
                                    <PersonAvatar src={p.avatarUrl} seed={p.code} name={p.name} className="size-7" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium">{p.name}</span>
                                        <span className="block truncate text-[11px] text-muted-foreground">{p.position ?? '—'}</span>
                                    </span>
                                    <span className="text-xs text-muted-foreground">6 mo: {fullDate(p.due)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>

            <section className="rounded-xl border bg-card shadow-sm">
                <header className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div>
                        <h3 className="text-sm font-semibold">Movements in this period</h3>
                        <p className="text-xs text-muted-foreground">
                            {data.hires} hire{data.hires === 1 ? '' : 's'} · {data.separations} separation{data.separations === 1 ? '' : 's'}
                        </p>
                    </div>
                </header>
                {data.movements.length === 0 ? (
                    <p className="px-4 pb-6 text-sm text-muted-foreground">No hires or separations in this period.</p>
                ) : (
                    <ul className="divide-y">
                        {[...data.movements]
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map((m) => (
                                <li key={`${m.type}-${m.id}`} className="flex items-center gap-3 px-4 py-2.5">
                                    <PersonAvatar src={m.avatarUrl} seed={m.code} name={m.name} className="size-8" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium">{m.name}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {m.position ?? '—'}
                                        </span>
                                    </span>
                                    <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', m.type === 'hire' ? TONE.emerald : TONE.slate)}>
                                        {m.type === 'hire' ? 'Hired' : 'Separated'}
                                    </span>
                                    <span className="w-24 text-right text-xs text-muted-foreground">{fullDate(m.date)}</span>
                                </li>
                            ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

function Attention({ icon: Icon, count, text, href, tone }: { icon: React.ElementType; count: number; text: string; href: string; tone: 'amber' | 'sky' }) {
    const ok = count === 0;
    return (
        <li className="flex items-start gap-2.5">
            <span className={cn('mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border', ok ? TONE.slate : TONE[tone])}>
                {ok ? <Icon className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="font-semibold tabular-nums">{count}</span> <span className={ok ? 'text-muted-foreground' : ''}>{text}</span>
            </span>
            {!ok && (
                <Link href={href} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Open employee directory">
                    <ArrowRight className="size-4" />
                </Link>
            )}
        </li>
    );
}
