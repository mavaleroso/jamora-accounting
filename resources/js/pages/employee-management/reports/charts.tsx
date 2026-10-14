import { BarChart3, Table2 } from 'lucide-react';
import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import { SERIES, slot } from './lib';

/**
 * Chart building blocks for People Reports. Marks follow the dataviz spec: thin bars with 4px rounded
 * data ends, 2px lines, recessive grid, hover tooltips, a legend whenever there are two or more series,
 * and a table view for every chart.
 */

/** Series colors as CSS variables, light and dark, for the HTML (non-Recharts) marks. */
export function VizStyles() {
    const vars = (mode: 'light' | 'dark') => SERIES.map((s, i) => `--viz-${i + 1}:${s[mode]};`).join('');
    return (
        <style>{`.people-viz{${vars('light')}}.dark .people-viz{${vars('dark')}}`}</style>
    );
}
export const vizVar = (i: number) => `var(--viz-${Math.min(i, SERIES.length - 1) + 1})`;

export const themed = (i: number) => ({ theme: { light: slot(i).light, dark: slot(i).dark } });

/* ---------------------------------------------------------------------------------------------- */

export function ChartCard({
    title,
    description,
    table,
    action,
    className,
    children,
}: {
    title: string;
    description?: React.ReactNode;
    /** Table view of the same data. */
    table?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    const [asTable, setAsTable] = React.useState(false);
    return (
        <section className={cn('flex min-w-0 flex-col rounded-xl border bg-card shadow-sm', className)}>
            <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{title}</h3>
                    {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {action}
                    {table && (
                        <button
                            type="button"
                            onClick={() => setAsTable((v) => !v)}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            aria-label={asTable ? 'Show chart' : 'Show as table'}
                            title={asTable ? 'Show chart' : 'Show as table'}
                        >
                            {asTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
                        </button>
                    )}
                </div>
            </header>
            <div className="min-w-0 flex-1 px-4 pb-4">{asTable && table ? <div className="max-h-80 overflow-auto">{table}</div> : children}</div>
        </section>
    );
}

export function MiniTable({ head, rows, align }: { head: string[]; rows: React.ReactNode[][]; align?: ('left' | 'right')[] }) {
    return (
        <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
                <tr className="border-b text-xs text-muted-foreground">
                    {head.map((h, i) => (
                        <th key={h} className={cn('py-1.5 font-medium', (align?.[i] ?? (i === 0 ? 'left' : 'right')) === 'right' ? 'text-right' : 'text-left')}>
                            {h}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((r, ri) => (
                    <tr key={ri} className="border-b last:border-0">
                        {r.map((c, ci) => (
                            <td key={ci} className={cn('py-1.5 tabular-nums', (align?.[ci] ?? (ci === 0 ? 'left' : 'right')) === 'right' ? 'text-right font-mono text-xs' : 'text-left')}>
                                {c}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export function Empty({ children }: { children: React.ReactNode }) {
    return <div className="flex h-48 items-center justify-center text-center text-sm text-muted-foreground">{children}</div>;
}

const axis = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 11 } as const;

/* ---------------------------------------------------------------------------------------------- */
/* Single-series line (crosshair tooltip)                                                           */
/* ---------------------------------------------------------------------------------------------- */

export function TrendLine<T extends Record<string, unknown>>({
    data,
    x,
    y,
    label,
    xFormat,
    yFormat,
    domain,
    height = 220,
}: {
    data: T[];
    x: keyof T & string;
    y: keyof T & string;
    label: string;
    xFormat: (v: string) => string;
    yFormat: (v: number) => string;
    domain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'];
    height?: number;
}) {
    const config = { [y]: { label, ...themed(0) } } satisfies ChartConfig;
    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey={x} {...axis} tickFormatter={xFormat} minTickGap={24} />
                <YAxis {...axis} width={44} tickFormatter={yFormat} domain={domain ?? ['auto', 'auto']} allowDecimals={false} />
                <ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={<ChartTooltipContent labelFormatter={(v) => xFormat(String(v))} formatter={(v) => yFormat(Number(v))} />} />
                <Line type="monotone" dataKey={y} stroke={`var(--color-${y})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }} />
            </LineChart>
        </ChartContainer>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Vertical bars: grouped (side by side) or stacked, 1–3 series                                     */
/* ---------------------------------------------------------------------------------------------- */

export function ColumnChart<T extends Record<string, unknown>>({
    data,
    x,
    series,
    xFormat,
    yFormat,
    stacked = false,
    height = 220,
}: {
    data: T[];
    x: keyof T & string;
    series: { key: keyof T & string; label: string; slot: number }[];
    xFormat: (v: string) => string;
    yFormat: (v: number) => string;
    stacked?: boolean;
    height?: number;
}) {
    const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, ...themed(s.slot) }])) satisfies ChartConfig;
    return (
        <ChartContainer config={config} className="w-full" style={{ height }}>
            <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }} barGap={2} barCategoryGap="28%">
                <CartesianGrid vertical={false} strokeOpacity={0.5} />
                <XAxis dataKey={x} {...axis} tickFormatter={xFormat} minTickGap={12} />
                <YAxis {...axis} width={52} tickFormatter={yFormat} allowDecimals={false} />
                <ChartTooltip cursor={{ fillOpacity: 0.06 }} content={<ChartTooltipContent labelFormatter={(v) => xFormat(String(v))} formatter={(v, name) => `${config[name as string]?.label ?? name}: ${yFormat(Number(v))}`} />} />
                {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                {series.map((s, i) => (
                    <Bar
                        key={s.key}
                        dataKey={s.key}
                        fill={`var(--color-${s.key})`}
                        stackId={stacked ? 'a' : undefined}
                        // 4px rounded data end only; stacked segments get a 2px surface gap.
                        radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : 0}
                        stroke={stacked ? 'var(--card)' : undefined}
                        strokeWidth={stacked ? 2 : 0}
                        maxBarSize={stacked ? 28 : 14}
                    />
                ))}
            </BarChart>
        </ChartContainer>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Ranked horizontal bars (HTML) — one series, value labels at the end                              */
/* ---------------------------------------------------------------------------------------------- */

export function RankBars({ rows, format, max }: { rows: { label: string; value: number; hint?: string }[]; format: (v: number) => string; max?: number }) {
    const top = max ?? Math.max(1, ...rows.map((r) => r.value));
    return (
        <ul className="space-y-2.5">
            {rows.map((r) => (
                <li key={r.label} title={`${r.label}: ${format(r.value)}${r.hint ? ` · ${r.hint}` : ''}`}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                        <span className="truncate font-medium">{r.label}</span>
                        <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
                            {format(r.value)}
                            {r.hint && <span className="ml-1.5 font-sans">{r.hint}</span>}
                        </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(1.5, (r.value / top) * 100)}%`, background: vizVar(0) }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Composition: one 100% bar + labelled legend (counts and shares always visible)                   */
/* ---------------------------------------------------------------------------------------------- */

export function Composition({ parts, label }: { parts: { key: string; label: string; value: number }[]; label: string }) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    if (total === 0) return <p className="text-xs text-muted-foreground">No data.</p>;
    return (
        <div>
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(', ')}`}>
                {parts.map((p, i) =>
                    p.value > 0 ? (
                        <div
                            key={p.key}
                            className="h-full first:rounded-l-full last:rounded-r-full"
                            style={{ width: `${(p.value / total) * 100}%`, background: vizVar(i) }}
                            title={`${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`}
                        />
                    ) : null,
                )}
            </div>
            <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
                {parts.map((p, i) => (
                    <li key={p.key} className="flex items-center gap-2 text-xs">
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: vizVar(i) }} />
                        <span className="min-w-0 flex-1 truncate">{p.label}</span>
                        <span className="font-mono text-muted-foreground tabular-nums">
                            {p.value} · {Math.round((p.value / total) * 100)}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
