import { Link } from '@inertiajs/react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE } from '../attendance/lib';
import { ChartCard, ColumnChart, Empty, MiniTable } from './charts';
import { monthLabel, peso, pesoShort, type Payroll } from './lib';

export function PayrollSection({ data }: { data: Payroll }) {
    const cost = data.gross + data.employer;
    const lines: [string, number, string?][] = [
        ['Gross pay', data.gross, 'Basic, overtime, premiums and allowances'],
        ['   of which overtime & night diff', data.overtime],
        ['Employer contributions & benefits', data.employer, 'SSS, EC, PhilHealth, Pag-IBIG, benefit premiums'],
        ['Total employer cost', cost],
        ['Employee contributions withheld', data.employeeContributions],
        ['Withholding tax', data.tax],
        ['Net pay released', data.net],
        ['13th month accrued', data.thirteenth, 'Payable on or before Dec 24'],
    ];
    const hasTrend = data.trend.some((t) => t.gross > 0);

    return (
        <div className="space-y-4">
            {data.unreleased > 0 && (
                <div className={cn('flex flex-col gap-2 rounded-lg border px-3.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between', TONE.sky)}>
                    <p className="flex items-center gap-2">
                        <Info className="size-4 shrink-0" />
                        {data.unreleased} payroll{data.unreleased === 1 ? ' is' : 's are'} still in draft or approved for this period and not included until posted.
                    </p>
                    <Link href="/payroll/runs" className="shrink-0 text-xs font-semibold underline underline-offset-2">
                        Go to Payroll
                    </Link>
                </div>
            )}

            <div className="grid gap-4 xl:grid-cols-3">
                <ChartCard
                    className="xl:col-span-2"
                    title="Employer cost by month"
                    description="Posted and paid payrolls, by cut-off end date, last 12 months"
                    table={
                        <MiniTable
                            head={['Month', 'Gross pay', 'Employer share', 'Total']}
                            rows={data.trend.map((t) => [monthLabel(t.month, true), peso(t.gross), peso(t.employer), peso(t.gross + t.employer)])}
                        />
                    }
                >
                    {hasTrend ? (
                        <ColumnChart
                            data={data.trend}
                            x="month"
                            stacked
                            series={[
                                { key: 'gross', label: 'Gross pay', slot: 0 },
                                { key: 'employer', label: 'Employer contributions', slot: 1 },
                            ]}
                            xFormat={(v) => monthLabel(v)}
                            yFormat={pesoShort}
                            height={260}
                        />
                    ) : (
                        <Empty>No posted payroll in the last 12 months.</Empty>
                    )}
                </ChartCard>

                <section className="rounded-xl border bg-card p-4 shadow-sm">
                    <h3 className="text-sm font-semibold">Cost breakdown</h3>
                    <p className="text-xs text-muted-foreground">
                        {data.runs} posted payroll{data.runs === 1 ? '' : 's'} · {data.employees} employee{data.employees === 1 ? '' : 's'} paid
                    </p>
                    <dl className="mt-3 divide-y text-sm">
                        {lines.map(([label, value, hint]) => {
                            const strong = label === 'Total employer cost';
                            const sub = label.startsWith('   ');
                            return (
                                <div key={label} className={cn('flex items-baseline justify-between gap-3 py-1.5', strong && 'font-semibold')}>
                                    <dt className={cn(!strong && 'text-muted-foreground', sub && 'pl-3 text-xs')} title={hint}>
                                        {label.trim()}
                                    </dt>
                                    <dd className={cn('font-mono tabular-nums', sub && 'text-xs text-muted-foreground')}>{peso(value)}</dd>
                                </div>
                            );
                        })}
                    </dl>
                    <p className="mt-3 rounded-md bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground">
                        Current monthly run-rate of basic pay: <span className="font-mono font-semibold text-foreground">{peso(data.monthlyRunRate)}</span> (monthly-equivalent rates of
                        active staff).
                    </p>
                </section>
            </div>

            <ChartCard
                title="Cost by department"
                description="Gross pay plus employer contributions in this period"
                table={
                    <MiniTable
                        head={['Department', 'Employees', 'Gross', 'Employer', 'Net']}
                        rows={data.byDepartment.map((d) => [d.department, d.employees, peso(d.gross), peso(d.employer), peso(d.net)])}
                    />
                }
            >
                {data.byDepartment.length === 0 ? (
                    <Empty>No posted payroll in this period.</Empty>
                ) : (
                    <ul className="divide-y">
                        {data.byDepartment.map((d) => {
                            const total = d.gross + d.employer;
                            const share = cost > 0 ? (total / cost) * 100 : 0;
                            return (
                                <li key={d.department} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[12rem_minmax(0,1fr)_9rem]">
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{d.department}</span>
                                        <span className="block text-[11px] text-muted-foreground">
                                            {d.employees} paid · {pesoShort(d.employees ? total / d.employees : 0)} each
                                        </span>
                                    </span>
                                    <div className="col-span-2 row-start-2 h-2 rounded-full bg-muted sm:col-span-1 sm:row-start-auto" title={`${d.department}: ${share.toFixed(1)}% of cost`}>
                                        <div className="h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(1.5, share)}%` }} />
                                    </div>
                                    <span className="text-right">
                                        <span className="block font-mono text-sm tabular-nums">{peso(total)}</span>
                                        <span className="block text-[11px] text-muted-foreground tabular-nums">{share.toFixed(1)}%</span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </ChartCard>
        </div>
    );
}
