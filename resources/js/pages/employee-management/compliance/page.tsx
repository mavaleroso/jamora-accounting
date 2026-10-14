import { Head } from '@inertiajs/react';
import { AlertTriangle, CalendarPlus, CheckCircle2, MoreHorizontal, Plus, Search, Wallet } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SegmentedControl, SegmentedControlItem, segmentedControlBadgeClass } from '@/components/ui/segmented-control';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { AddItemDialog, AddMonthDialog, DetailDialog, StepDialog, type Step } from './dialogs';
import { CATEGORY, COMPLIANCE_URL, daysUntil, dueLabel, fmtDate, mismatch, NEXT_ACTION, peso, STEPS, TONE, type Item } from './lib';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management' },
    { title: 'Compliance', href: COMPLIANCE_URL },
];

type Props = {
    today: string;
    currentUserId: number | null;
    can: { manage: boolean; verify: boolean };
    categories: string[];
    periods: string[];
    items: Item[];
};

type View = 'todo' | 'review' | 'done' | 'all';

const VIEWS: { key: View; label: string; match: (i: Item) => boolean }[] = [
    { key: 'todo', label: 'To do', match: (i) => i.status === 'pending' || i.status === 'prepared' },
    { key: 'review', label: 'Awaiting verification', match: (i) => i.status === 'submitted' },
    { key: 'done', label: 'Verified', match: (i) => i.status === 'verified' },
    { key: 'all', label: 'All', match: () => true },
];

export default function CompliancePage({ today, currentUserId, can, categories, periods, items }: Props) {
    const [view, setView] = React.useState<View>('todo');
    const [period, setPeriod] = React.useState('all');
    const [category, setCategory] = React.useState('all');
    const [query, setQuery] = React.useState('');
    const [step, setStep] = React.useState<{ item: Item; step: Step } | null>(null);
    const [detail, setDetail] = React.useState<Item | null>(null);
    const [addOpen, setAddOpen] = React.useState(false);
    const [monthOpen, setMonthOpen] = React.useState(false);

    const year = today.slice(0, 4);
    const open = items.filter((i) => i.status === 'pending' || i.status === 'prepared');
    const kpi = {
        overdue: open.filter((i) => i.is_overdue).length,
        dueSoon: open.filter((i) => i.due_date && !i.is_overdue && daysUntil(i.due_date, today) <= 14).length,
        review: items.filter((i) => i.status === 'submitted').length,
        late: items.filter((i) => i.is_late && i.submitted?.at.startsWith(year)).length,
        remitted: items.filter((i) => (i.status === 'submitted' || i.status === 'verified') && i.submitted?.at.startsWith(year)).reduce((a, i) => a + (i.amount ?? 0), 0),
    };

    const base = items.filter((i) => {
        if (period !== 'all' && i.period !== period) return false;
        if (category !== 'all' && i.category !== category) return false;
        const q = query.trim().toLowerCase();
        return !q || [i.title, i.form_code, i.agency, i.reference_no, i.owner_role].some((v) => v?.toLowerCase().includes(q));
    });
    const rows = base.filter(VIEWS.find((v) => v.key === view)!.match);
    const sorted = view === 'done' || view === 'all' ? [...rows].sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? '')) : rows;

    const canAct = (item: Item) => {
        const next = NEXT_ACTION[item.status];
        return next ? (next.step === 'verify' ? can.verify : can.manage) : false;
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Compliance" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading
                        title="Compliance calendar"
                        description="Government filings and remittances — BIR, SSS, PhilHealth, Pag-IBIG, DOLE and LGU. Prepare, file with proof, then a second person verifies."
                    />
                    {can.manage && (
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => setMonthOpen(true)}>
                                <CalendarPlus className="size-4" /> Add a month
                            </Button>
                            <Button onClick={() => setAddOpen(true)}>
                                <Plus className="size-4" /> Add obligation
                            </Button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <Kpi label="Overdue" value={String(kpi.overdue)} hint="Past due, not yet filed" tone={kpi.overdue ? 'rose' : undefined} icon={AlertTriangle} />
                    <Kpi label="Due in 14 days" value={String(kpi.dueSoon)} hint="Still to prepare or file" tone={kpi.dueSoon ? 'amber' : undefined} />
                    <Kpi label="Awaiting verification" value={String(kpi.review)} hint="Filed, needs sign-off" />
                    <Kpi label={`Filed late ${year}`} value={String(kpi.late)} hint="Possible surcharges" tone={kpi.late ? 'rose' : undefined} />
                    <Kpi label={`Remitted ${year}`} value={peso(kpi.remitted)} hint="Filed and verified amounts" icon={Wallet} />
                </div>

                <section className="rounded-xl border bg-card shadow-sm">
                    <header className="flex flex-col gap-3 border-b p-3 xl:flex-row xl:items-center xl:justify-between">
                        <SegmentedControl aria-label="Work queue">
                            {VIEWS.map((v) => {
                                const n = base.filter(v.match).length;
                                return (
                                    <SegmentedControlItem key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
                                        {v.label}
                                        {v.key !== 'all' && <span className={segmentedControlBadgeClass(view === v.key)}>{n}</span>}
                                    </SegmentedControlItem>
                                );
                            })}
                        </SegmentedControl>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-full sm:w-56">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search form, agency, ref no." className="h-9 pl-8" aria-label="Search" />
                            </div>
                            <Select value={period} onValueChange={setPeriod}>
                                <SelectTrigger className="h-9 w-full sm:w-44">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All months</SelectItem>
                                    {periods.map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {p}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger className="h-9 w-full sm:w-48">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All categories</SelectItem>
                                    {categories.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {CATEGORY[c] ?? c}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </header>

                    {sorted.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                            <CheckCircle2 className="size-8 text-emerald-500/70" />
                            <p className="text-sm font-medium">{view === 'todo' ? 'Nothing left to file' : view === 'review' ? 'Nothing waiting for verification' : 'No filings match'}</p>
                            <p className="text-xs text-muted-foreground">Try another month, category or view.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-xs text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-2 text-left font-medium">Due</th>
                                        <th className="px-3 py-2 text-left font-medium">Filing</th>
                                        <th className="hidden px-3 py-2 text-left font-medium lg:table-cell">Owner</th>
                                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                                        <th className="px-3 py-2 text-left font-medium">Progress</th>
                                        <th className="w-px px-4 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {sorted.map((item) => (
                                        <ItemRow
                                            key={item.id}
                                            item={item}
                                            today={today}
                                            canAct={canAct(item)}
                                            onAct={() => setStep({ item, step: NEXT_ACTION[item.status]!.step })}
                                            onDetail={() => setDetail(item)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <p className="text-[11px] text-muted-foreground">
                    This month’s and last month’s obligations are created automatically (and on the 1st of every month). Payroll amounts come from posted and paid payrolls whose cut-off ends in the covered
                    month. Templates and due-date rules live in <span className="font-mono">config/people.php</span>.
                </p>
            </div>

            <StepDialog item={step?.item ?? null} step={step?.step ?? null} today={today} currentUserId={currentUserId} onClose={() => setStep(null)} />
            <DetailDialog item={detail} onClose={() => setDetail(null)} />
            {can.manage && (
                <>
                    <AddItemDialog open={addOpen} today={today} categories={categories} onClose={() => setAddOpen(false)} />
                    <AddMonthDialog open={monthOpen} today={today} onClose={() => setMonthOpen(false)} />
                </>
            )}
        </AppLayout>
    );
}

function Kpi({ label, value, hint, tone, icon: Icon }: { label: string; value: string; hint: string; tone?: 'rose' | 'amber'; icon?: React.ElementType }) {
    return (
        <div className={cn('rounded-xl border bg-card p-3.5 shadow-sm', tone === 'rose' && 'border-rose-300 dark:border-rose-900', tone === 'amber' && 'border-amber-300 dark:border-amber-900')}>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {Icon && <Icon className="size-3.5" />}
                {label}
            </p>
            <p className={cn('mt-1 font-mono text-xl font-semibold tabular-nums', tone === 'rose' && 'text-rose-600 dark:text-rose-400', tone === 'amber' && 'text-amber-700 dark:text-amber-400')}>{value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        </div>
    );
}

function ItemRow({ item, today, canAct, onAct, onDetail }: { item: Item; today: string; canAct: boolean; onAct: () => void; onDetail: () => void }) {
    const due = dueLabel(item, today);
    const next = NEXT_ACTION[item.status];
    const stepIdx = STEPS.findIndex((s) => s.key === item.status);

    return (
        <tr className="hover:bg-muted/30">
            <td className="px-4 py-3 align-top whitespace-nowrap">
                <p className="font-medium">{fmtDate(item.due_date, false)}</p>
                <span className={cn('mt-1 inline-block rounded-full border px-1.5 py-px text-[10px] font-semibold', TONE[due.tone])}>{due.text}</span>
            </td>
            <td className="px-3 py-3 align-top">
                <button type="button" onClick={onDetail} className="text-left hover:underline">
                    <span className="font-medium">{item.title}</span>
                </button>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.agency && <span className="font-semibold text-foreground/80">{item.agency}</span>}
                    {item.form_code && <span className="font-mono"> · {item.form_code}</span>} · covers {item.period}
                </p>
                {item.reference_no && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">Ref {item.reference_no}</p>}
            </td>
            <td className="hidden px-3 py-3 align-top text-xs text-muted-foreground lg:table-cell">{item.owner_role}</td>
            <td className="px-3 py-3 text-right align-top whitespace-nowrap">
                {item.amount !== null ? <p className="font-mono">{peso(item.amount)}</p> : item.payroll ? <p className="font-mono text-muted-foreground">{peso(item.payroll.amount)}</p> : <p className="text-muted-foreground">—</p>}
                {item.payroll && (
                    <p className={cn('text-[11px]', mismatch(item) ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')} title={item.payroll.basis}>
                        {item.amount === null ? 'per payroll' : mismatch(item) ? `payroll ${peso(item.payroll.amount)}` : 'matches payroll'}
                        {item.payroll.unreleased > 0 && ' · incomplete'}
                    </p>
                )}
            </td>
            <td className="px-3 py-3 align-top">
                <div className="flex items-center gap-1" aria-label={`Step ${stepIdx + 1} of 4: ${STEPS[stepIdx]?.label}`}>
                    {STEPS.map((s, i) => (
                        <span key={s.key} className={cn('h-1.5 w-5 rounded-full', i <= stepIdx ? (item.status === 'verified' ? 'bg-emerald-500' : 'bg-primary') : 'bg-muted')} />
                    ))}
                </div>
                <p className="mt-1 text-xs">
                    {STEPS[stepIdx]?.label}
                    {item.status === 'submitted' && item.submitted?.by && <span className="text-muted-foreground"> by {item.submitted.by}</span>}
                    {item.status === 'verified' && item.verified?.by && <span className="text-muted-foreground"> by {item.verified.by}</span>}
                </p>
            </td>
            <td className="px-4 py-3 text-right align-top whitespace-nowrap">
                <div className="flex items-center justify-end gap-1">
                    {next && canAct && (
                        <Button size="sm" variant={next.step === 'verify' ? 'default' : 'outline'} className="h-8" onClick={onAct}>
                            {next.label}
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-8" aria-label={`More for ${item.title}`}>
                                <MoreHorizontal className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={onDetail}>Details & audit trail</DropdownMenuItem>
                            {item.evidence_url && (
                                <DropdownMenuItem asChild>
                                    <a href={item.evidence_url} target="_blank" rel="noreferrer">
                                        Open proof of filing
                                    </a>
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </td>
        </tr>
    );
}
