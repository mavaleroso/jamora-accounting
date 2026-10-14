import { Head, router } from '@inertiajs/react';
import { CalendarClock, Download, Loader2, Umbrella, Users, Wallet } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { AttendanceSection } from './attendance';
import { VizStyles } from './charts';
import { LeaveSection } from './leave';
import { num, pct, peso, pesoShort, rangeLabel, REPORTS_URL, type Attendance, type Filters, type Leave, type Payroll, type Workforce } from './lib';
import { PayrollSection } from './payroll';
import { WorkforceSection } from './workforce';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management' },
    { title: 'People Reports', href: REPORTS_URL },
];

type Props = {
    filters: Filters;
    range: { from: string; to: string };
    presets: { key: string; label: string }[];
    departments: string[];
    canSeePay: boolean;
    today: string;
    workforce: Workforce;
    attendance: Attendance;
    leave: Leave;
    payroll: Payroll | null;
};

type Tab = 'workforce' | 'attendance' | 'leave' | 'payroll';

const readTab = (allowed: Tab[]): Tab => {
    try {
        const t = new URLSearchParams(window.location.search).get('tab') as Tab;
        return allowed.includes(t) ? t : 'workforce';
    } catch {
        return 'workforce';
    }
};

export default function PeopleReportsPage({ filters, range, presets, departments, canSeePay, workforce, attendance, leave, payroll }: Props) {
    const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
        { key: 'workforce', label: 'Workforce', icon: Users },
        { key: 'attendance', label: 'Attendance', icon: CalendarClock },
        { key: 'leave', label: 'Leave', icon: Umbrella },
        ...(canSeePay && payroll ? [{ key: 'payroll' as Tab, label: 'Payroll cost', icon: Wallet }] : []),
    ];
    const [tab, setTabState] = React.useState<Tab>(() => readTab(tabs.map((t) => t.key)));
    const [loading, setLoading] = React.useState(false);
    const [custom, setCustom] = React.useState({ from: filters.from ?? '', to: filters.to ?? '' });

    const setTab = (t: Tab) => {
        setTabState(t);
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', t);
            window.history.replaceState(window.history.state, '', url);
        } catch {
            /* ignore */
        }
    };

    const params = (next: Partial<Filters>) => {
        const f = { ...filters, ...next };
        return {
            preset: f.preset,
            ...(f.preset === 'custom' ? { from: f.from, to: f.to } : {}),
            ...(f.department ? { department: f.department } : {}),
            tab,
        };
    };
    const apply = (next: Partial<Filters>) =>
        router.get(REPORTS_URL, params(next), { preserveScroll: true, preserveState: true, replace: true, onStart: () => setLoading(true), onFinish: () => setLoading(false) });

    const exportUrl = (section: string) => {
        const p = new URLSearchParams(Object.entries({ ...params({}), section }).filter(([, v]) => v) as [string, string][]);
        p.delete('tab');
        return `${REPORTS_URL}/export?${p.toString()}`;
    };

    const headDelta = workforce.active - workforce.atStart;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="People Reports & Analytics" />
            <VizStyles />

            <div className="people-viz flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading title="People Reports & Analytics" description="Workforce, attendance, leave and payroll cost for the selected period and department." />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline">
                                <Download className="size-4" /> Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-60">
                            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">CSV for the current filters</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <a href={exportUrl('workforce')}>Headcount by department</a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a href={exportUrl('attendance')}>Attendance by employee</a>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                                <a href={exportUrl('leave')}>Leave balances</a>
                            </DropdownMenuItem>
                            {canSeePay && (
                                <DropdownMenuItem asChild>
                                    <a href={exportUrl('payroll')}>Payroll cost by department</a>
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {/* Filters — one row above everything they control */}
                <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm md:flex-row md:flex-wrap md:items-end">
                    <Field label="Period">
                        <Select value={filters.preset} onValueChange={(v) => (v === 'custom' ? apply({ preset: v, from: custom.from, to: custom.to }) : apply({ preset: v }))}>
                            <SelectTrigger className="h-9 w-full md:w-44">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {presets.map((p) => (
                                    <SelectItem key={p.key} value={p.key}>
                                        {p.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    {filters.preset === 'custom' && (
                        <>
                            <Field label="From month">
                                <Input type="month" className="h-9 md:w-40" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
                            </Field>
                            <Field label="To month">
                                <Input type="month" className="h-9 md:w-40" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
                            </Field>
                            <Button size="sm" className="h-9" onClick={() => apply({ preset: 'custom', from: custom.from, to: custom.to })} disabled={!custom.from}>
                                Apply
                            </Button>
                        </>
                    )}
                    <Field label="Department">
                        <Select value={filters.department ?? 'all'} onValueChange={(v) => apply({ department: v === 'all' ? null : v })}>
                            <SelectTrigger className="h-9 w-full md:w-56">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All departments</SelectItem>
                                {departments.map((d) => (
                                    <SelectItem key={d} value={d}>
                                        {d}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <p className="flex items-center gap-2 text-sm text-muted-foreground md:ml-auto md:pb-2">
                        {loading && <Loader2 className="size-4 animate-spin" />}
                        <span className="font-medium text-foreground">{rangeLabel(range.from, range.to)}</span>
                        {filters.department && <span>· {filters.department}</span>}
                    </p>
                </div>

                {/* Headline figures */}
                <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3', canSeePay ? 'xl:grid-cols-6' : 'xl:grid-cols-5')}>
                    <Kpi label="Active headcount" value={num(workforce.active)} hint={headDelta === 0 ? 'No change in period' : `${headDelta > 0 ? '+' : ''}${headDelta} since period start`} />
                    <Kpi label="Turnover" value={pct(workforce.turnoverRate)} hint={`${workforce.separations} separation${workforce.separations === 1 ? '' : 's'} · ${workforce.hires} hire${workforce.hires === 1 ? '' : 's'}`} />
                    <Kpi label="Attendance rate" value={pct(attendance.rate)} hint={`${num(attendance.absences)} absences · ${num(attendance.lateCount)} lates`} />
                    <Kpi label="Overtime approved" value={`${num(attendance.otApproved, 1)}h`} hint={`${num(attendance.otRendered, 1)}h rendered`} />
                    <Kpi label="Leave taken" value={`${num(leave.daysTaken, 1)}d`} hint={`${leave.pending} request${leave.pending === 1 ? '' : 's'} pending`} />
                    {canSeePay && payroll && <Kpi label="Employer cost" value={pesoShort(payroll.gross + payroll.employer)} hint={`Net paid ${peso(payroll.net)}`} />}
                </div>

                <SegmentedControl aria-label="Report">
                    {tabs.map(({ key, label, icon: Icon }) => (
                        <SegmentedControlItem key={key} active={tab === key} onClick={() => setTab(key)}>
                            <Icon className="size-4" /> {label}
                        </SegmentedControlItem>
                    ))}
                </SegmentedControl>

                <div className={cn('transition-opacity', loading && 'pointer-events-none opacity-60')}>
                    {tab === 'workforce' && <WorkforceSection data={workforce} />}
                    {tab === 'attendance' && <AttendanceSection data={attendance} />}
                    {tab === 'leave' && <LeaveSection data={leave} canSeePay={canSeePay} year={Number(range.to.slice(0, 4))} />}
                    {tab === 'payroll' && payroll && <PayrollSection data={payroll} />}
                </div>

                <p className="text-[11px] text-muted-foreground">
                    Headcount counts employees by hire and separation dates. Attendance uses time records through yesterday. Payroll cost includes posted and paid payrolls only
                    {canSeePay ? '' : ' and is visible to users with payroll access'}.
                </p>
            </div>
        </AppLayout>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            {children}
        </div>
    );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
    return (
        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={hint}>
                {hint}
            </p>
        </div>
    );
}
