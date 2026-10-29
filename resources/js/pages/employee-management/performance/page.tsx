import { useConfirm } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl, segmentedControlBadgeClass, SegmentedControlItem } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { CheckCircle2, Loader2, MessageSquareText, Pencil, Plus, Search, Send, Star, Trash2 } from 'lucide-react';
import * as React from 'react';
import { fmtDate, fullName, TONE, type Person } from '../attendance/lib';

const URL = '/employee-management/performance';

type Status = 'draft' | 'shared' | 'acknowledged';
type Criterion = { key: string; label: string; hint: string };

type Evaluation = {
    id: number;
    employee_id: number;
    employee: Person;
    evaluator: string | null;
    review_type: string;
    period_start: string;
    period_end: string;
    review_date: string;
    ratings: Record<string, number | null> | null;
    overall_rating: number | null;
    standards: string | null;
    strengths: string | null;
    improvements: string | null;
    goals: string | null;
    status: Status;
    shared_at: string | null;
    employee_comments: string | null;
    acknowledged_at: string | null;
    can: { edit: boolean; acknowledge: boolean };
};

type EmployeeOption = Person & { hire_date: string | null; regularization_date: string | null };

type Props = {
    canManage: boolean;
    selfId: number | null;
    today: string;
    reviewTypes: Record<string, string>;
    criteria: Criterion[];
    evaluations: Evaluation[];
    employees: EmployeeOption[];
};

const STATUS: Record<Status, { label: string; tone: keyof typeof TONE }> = {
    draft: { label: 'Draft', tone: 'slate' },
    shared: { label: 'Awaiting acknowledgement', tone: 'amber' },
    acknowledged: { label: 'Acknowledged', tone: 'emerald' },
};

const SCALE: Record<number, string> = { 1: 'Poor', 2: 'Needs improvement', 3: 'Meets expectations', 4: 'Very good', 5: 'Outstanding' };

const TEXTS = [
    ['standards', 'Standards & objectives', 'What was expected this period'],
    ['strengths', 'Strengths', 'What went well'],
    ['improvements', 'Areas for improvement', 'Problems to resolve'],
    ['goals', 'Goals & growth', 'Next steps and opportunities'],
] as const;

const fmtRating = (r: number | null) => (r === null ? '—' : `${r.toFixed(1)} / 5`);
const fmtPeriod = (e: Pick<Evaluation, 'period_start' | 'period_end'>) =>
    `${fmtDate(e.period_start, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmtDate(e.period_end, { month: 'short', day: 'numeric', year: 'numeric' })}`;

export default function PerformancePage({ canManage, selfId, today, reviewTypes, criteria, evaluations, employees }: Props) {
    const [view, setView] = React.useState<'all' | Status>('all');
    const [query, setQuery] = React.useState('');
    const [editing, setEditing] = React.useState<Evaluation | 'new' | null>(null);
    const [viewing, setViewing] = React.useState<Evaluation | null>(null);
    const confirm = useConfirm();

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Employee Management', href: canManage ? '/employee-management' : '/employee-management/portal' },
        { title: canManage ? 'Performance Reviews' : 'My Reviews', href: URL },
    ];

    // A reviewer who is also an employee sees their own shared reviews too, read-only.
    const year = today.slice(0, 4);
    const kpi = {
        drafts: evaluations.filter((e) => e.status === 'draft').length,
        waiting: evaluations.filter((e) => e.status === 'shared').length,
        acknowledged: evaluations.filter((e) => e.status === 'acknowledged' && e.review_date.startsWith(year)).length,
        average: (() => {
            const rated = evaluations.filter((e) => e.status !== 'draft' && e.overall_rating !== null && e.review_date.startsWith(year));
            return rated.length ? rated.reduce((a, e) => a + (e.overall_rating ?? 0), 0) / rated.length : null;
        })(),
    };

    const base = evaluations.filter((e) => {
        const q = query.trim().toLowerCase();
        return (
            !q ||
            [fullName(e.employee), e.employee.employee_code, e.employee.position, reviewTypes[e.review_type]].some((v) =>
                v?.toLowerCase().includes(q),
            )
        );
    });
    const rows = base.filter((e) => view === 'all' || e.status === view);

    const share = async (e: Evaluation) => {
        const ok = await confirm({
            title: 'Share this review?',
            description: `${fullName(e.employee)} will see it and be asked to acknowledge it. A shared review can no longer be edited.`,
            confirmLabel: 'Share',
        });
        if (ok) router.post(`${URL}/${e.id}/share`, {}, { preserveScroll: true });
    };

    const remove = async (e: Evaluation) => {
        const ok = await confirm({
            title: 'Delete this draft?',
            description: `The draft review of ${fullName(e.employee)} is removed.`,
            confirmLabel: 'Delete',
            variant: 'destructive',
        });
        if (ok) router.delete(`${URL}/${e.id}`, { preserveScroll: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={canManage ? 'Performance Reviews' : 'My Reviews'} />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading
                        title={canManage ? 'Performance reviews' : 'My performance reviews'}
                        description={
                            canManage
                                ? 'Periodic reviews: rate each employee against the period’s standards, note strengths, problems to resolve and growth goals, then share it for them to acknowledge.'
                                : 'Reviews your supervisor has shared with you. Read each one and acknowledge it — you can add your own comments.'
                        }
                    />
                    {canManage && (
                        <Button onClick={() => setEditing('new')} disabled={employees.length === 0}>
                            <Plus className="size-4" /> New review
                        </Button>
                    )}
                </div>

                {canManage && (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Kpi label="Drafts" value={String(kpi.drafts)} hint="Not yet shared" />
                        <Kpi
                            label="Awaiting acknowledgement"
                            value={String(kpi.waiting)}
                            hint="Shared, not yet read"
                            tone={kpi.waiting ? 'amber' : undefined}
                        />
                        <Kpi label={`Acknowledged ${year}`} value={String(kpi.acknowledged)} hint="Reviews completed" />
                        <Kpi label={`Average rating ${year}`} value={fmtRating(kpi.average)} hint="Shared reviews" />
                    </div>
                )}

                <section className="bg-card rounded-xl border shadow-sm">
                    <header className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
                        <SegmentedControl aria-label="Review status">
                            {(['all', ...(canManage ? ['draft'] : []), 'shared', 'acknowledged'] as ('all' | Status)[]).map((v) => {
                                const n = v === 'all' ? base.length : base.filter((e) => e.status === v).length;
                                return (
                                    <SegmentedControlItem key={v} active={view === v} onClick={() => setView(v)}>
                                        {v === 'all' ? 'All' : v === 'shared' ? (canManage ? 'Shared' : 'To acknowledge') : STATUS[v].label}
                                        <span className={segmentedControlBadgeClass(view === v)}>{n}</span>
                                    </SegmentedControlItem>
                                );
                            })}
                        </SegmentedControl>
                        {canManage && (
                            <div className="relative w-full sm:w-64">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search employee or type"
                                    className="h-9 pl-8"
                                    aria-label="Search"
                                />
                            </div>
                        )}
                    </header>

                    {rows.length === 0 ? (
                        <p className="text-muted-foreground px-4 py-12 text-center text-sm">
                            {evaluations.length === 0
                                ? canManage
                                    ? 'No reviews yet. Start one with “New review”.'
                                    : 'No reviews have been shared with you yet.'
                                : 'No reviews match.'}
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {rows.map((e) => {
                                const st = STATUS[e.status];
                                const own = e.employee_id === selfId;
                                return (
                                    <li
                                        key={e.id}
                                        className={cn(
                                            'flex flex-col gap-3 p-4 sm:flex-row sm:items-center',
                                            e.can.acknowledge && 'border-l-4 border-l-amber-400',
                                        )}
                                    >
                                        <button
                                            type="button"
                                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                            onClick={() => setViewing(e)}
                                        >
                                            <PersonAvatar src={e.employee.avatar_url} seed={e.employee.employee_code} name={fullName(e.employee)} />
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span className="font-medium">
                                                        {own && !canManage ? reviewTypes[e.review_type] : fullName(e.employee)}
                                                    </span>
                                                    {!(own && !canManage) && (
                                                        <span className="text-muted-foreground text-sm">{reviewTypes[e.review_type]}</span>
                                                    )}
                                                    <Badge variant="outline" className={TONE[st.tone]}>
                                                        {e.can.acknowledge ? 'Please acknowledge' : st.label}
                                                    </Badge>
                                                </div>
                                                <p className="text-muted-foreground text-xs">
                                                    {fmtPeriod(e)} · reviewed{' '}
                                                    {fmtDate(e.review_date, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    {e.evaluator && ` by ${e.evaluator}`}
                                                </p>
                                            </div>
                                            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-sm tabular-nums">
                                                <Star className="size-3.5 text-amber-500" /> {fmtRating(e.overall_rating)}
                                            </span>
                                        </button>
                                        <div className="flex shrink-0 gap-2">
                                            {e.can.edit && (
                                                <>
                                                    <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                                                        <Pencil className="size-4" /> Edit
                                                    </Button>
                                                    <Button size="sm" onClick={() => share(e)}>
                                                        <Send className="size-4" /> Share
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => remove(e)}
                                                        aria-label="Delete draft"
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                </>
                                            )}
                                            {e.can.acknowledge && (
                                                <Button size="sm" onClick={() => setViewing(e)}>
                                                    <CheckCircle2 className="size-4" /> Read & acknowledge
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>

            <EditDialog
                key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
                open={editing !== null}
                onOpenChange={(o) => !o && setEditing(null)}
                evaluation={editing === 'new' ? null : editing}
                employees={employees}
                reviewTypes={reviewTypes}
                criteria={criteria}
                today={today}
            />
            <ViewDialog evaluation={viewing} onOpenChange={(o) => !o && setViewing(null)} reviewTypes={reviewTypes} criteria={criteria} />
        </AppLayout>
    );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'amber' }) {
    return (
        <div className="bg-card rounded-xl border p-3.5 shadow-sm">
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">{label}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'amber' && 'text-amber-600 dark:text-amber-400')}>{value}</p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">{hint}</p>
        </div>
    );
}

function RatingPicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
    return (
        <div className="bg-muted inline-flex rounded-md border p-0.5" role="radiogroup">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={value === n}
                    title={SCALE[n]}
                    onClick={() => onChange(value === n ? null : n)}
                    className={cn(
                        'w-8 rounded py-1 text-sm font-medium tabular-nums transition-colors',
                        value === n ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {n}
                </button>
            ))}
        </div>
    );
}

function EditDialog({
    open,
    onOpenChange,
    evaluation,
    employees,
    reviewTypes,
    criteria,
    today,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    evaluation: Evaluation | null;
    employees: EmployeeOption[];
    reviewTypes: Record<string, string>;
    criteria: Criterion[];
    today: string;
}) {
    const form = useForm({
        employee_id: evaluation ? String(evaluation.employee_id) : '',
        review_type: evaluation?.review_type ?? 'periodic',
        period_start: evaluation?.period_start ?? `${today.slice(0, 4)}-01-01`,
        period_end: evaluation?.period_end ?? today,
        review_date: evaluation?.review_date ?? today,
        ratings: Object.fromEntries(criteria.map((c) => [c.key, evaluation?.ratings?.[c.key] ?? null])) as Record<string, number | null>,
        standards: evaluation?.standards ?? '',
        strengths: evaluation?.strengths ?? '',
        improvements: evaluation?.improvements ?? '',
        goals: evaluation?.goals ?? '',
    });
    const { data, setData, errors, processing } = form;
    const err = errors as Record<string, string | undefined>;
    const rated = Object.values(data.ratings).filter((r): r is number => r !== null);
    const overall = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
    const ratingError = Object.entries(err).find(([k]) => k.startsWith('ratings'))?.[1];

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const options = { preserveScroll: true, onSuccess: () => onOpenChange(false) };
        if (evaluation) form.put(`${URL}/${evaluation.id}`, options);
        else form.post(URL, options);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                <form className="space-y-5" onSubmit={submit}>
                    <DialogHeader>
                        <DialogTitle>{evaluation ? `Edit review — ${fullName(evaluation.employee)}` : 'New performance review'}</DialogTitle>
                        <DialogDescription>Saved as a draft. Only you see it until you share it with the employee.</DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {!evaluation && (
                            <div className="space-y-1.5 sm:col-span-2">
                                <Label className="text-xs">Employee</Label>
                                <Select value={data.employee_id} onValueChange={(v) => setData('employee_id', v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select employee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.map((e) => (
                                            <SelectItem key={e.id} value={String(e.id)}>
                                                {fullName(e)}
                                                {e.position ? <span className="text-muted-foreground"> · {e.position}</span> : null}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={err.employee_id} />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Type</Label>
                            <Select value={data.review_type} onValueChange={(v) => setData('review_type', v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(reviewTypes).map(([k, label]) => (
                                        <SelectItem key={k} value={k}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={err.review_type} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Review date</Label>
                            <Input type="date" value={data.review_date} onChange={(e) => setData('review_date', e.target.value)} />
                            <InputError message={err.review_date} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Period from</Label>
                            <Input type="date" value={data.period_start} onChange={(e) => setData('period_start', e.target.value)} />
                            <InputError message={err.period_start} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Period to</Label>
                            <Input
                                type="date"
                                value={data.period_end}
                                min={data.period_start}
                                onChange={(e) => setData('period_end', e.target.value)}
                            />
                            <InputError message={err.period_end} />
                        </div>
                    </div>

                    <fieldset className="space-y-2">
                        <div className="flex items-baseline justify-between">
                            <legend className="text-sm font-medium">Ratings</legend>
                            <span className="text-muted-foreground text-xs">
                                1 Poor · 3 Meets expectations · 5 Outstanding · Overall <span className="font-mono">{fmtRating(overall)}</span>
                            </span>
                        </div>
                        <div className="divide-y rounded-md border">
                            {criteria.map((c) => (
                                <div key={c.key} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">{c.label}</p>
                                        <p className="text-muted-foreground text-[11px]">{c.hint}</p>
                                    </div>
                                    <RatingPicker value={data.ratings[c.key]} onChange={(v) => setData('ratings', { ...data.ratings, [c.key]: v })} />
                                </div>
                            ))}
                        </div>
                        {ratingError ? (
                            <InputError message={ratingError} />
                        ) : (
                            <p className="text-muted-foreground text-[11px]">Every criterion must be rated before the review is shared.</p>
                        )}
                    </fieldset>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {TEXTS.map(([key, label, placeholder]) => (
                            <div key={key} className="space-y-1.5">
                                <Label className="text-xs">{label}</Label>
                                <Textarea
                                    value={data[key]}
                                    onChange={(e) => setData(key, e.target.value)}
                                    rows={3}
                                    maxLength={5000}
                                    placeholder={placeholder}
                                />
                                <InputError message={err[key]} />
                            </div>
                        ))}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing || (!evaluation && !data.employee_id)}>
                            {processing && <Loader2 className="size-4 animate-spin" />} Save draft
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ViewDialog({
    evaluation,
    onOpenChange,
    reviewTypes,
    criteria,
}: {
    evaluation: Evaluation | null;
    onOpenChange: (o: boolean) => void;
    reviewTypes: Record<string, string>;
    criteria: Criterion[];
}) {
    return (
        <Dialog open={evaluation !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                {evaluation && <ViewBody evaluation={evaluation} reviewTypes={reviewTypes} criteria={criteria} onDone={() => onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function ViewBody({
    evaluation: e,
    reviewTypes,
    criteria,
    onDone,
}: {
    evaluation: Evaluation;
    reviewTypes: Record<string, string>;
    criteria: Criterion[];
    onDone: () => void;
}) {
    const form = useForm({ employee_comments: '' });
    const st = STATUS[e.status];

    return (
        <div className="space-y-5">
            <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                    {fullName(e.employee)} · {reviewTypes[e.review_type]}
                    <Badge variant="outline" className={TONE[st.tone]}>
                        {st.label}
                    </Badge>
                </DialogTitle>
                <DialogDescription>
                    {fmtPeriod(e)} · reviewed {fmtDate(e.review_date, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {e.evaluator && ` by ${e.evaluator}`}
                </DialogDescription>
            </DialogHeader>

            <div className="divide-y rounded-md border">
                {criteria.map((c) => {
                    const r = e.ratings?.[c.key] ?? null;
                    return (
                        <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="text-sm">{c.label}</span>
                            <span className="text-right text-sm">
                                <span className="font-mono font-semibold tabular-nums">{r ?? '—'}</span>
                                {r !== null && <span className="text-muted-foreground ml-2 text-xs">{SCALE[r]}</span>}
                            </span>
                        </div>
                    );
                })}
                <div className="bg-muted/40 flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm font-medium">Overall</span>
                    <span className="inline-flex items-center gap-1 font-mono font-semibold tabular-nums">
                        <Star className="size-3.5 text-amber-500" /> {fmtRating(e.overall_rating)}
                    </span>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                {TEXTS.map(([key, label]) => (
                    <div key={key} className="space-y-1">
                        <p className="text-muted-foreground text-xs font-medium">{label}</p>
                        <p className="text-sm whitespace-pre-line">{e[key] || '—'}</p>
                    </div>
                ))}
            </div>

            {e.status === 'acknowledged' && (
                <div className={cn('space-y-1 rounded-md border px-3 py-2 text-sm', TONE.emerald)}>
                    <p className="flex items-center gap-1.5 font-medium">
                        <CheckCircle2 className="size-4" /> Acknowledged
                        {e.acknowledged_at &&
                            ` on ${new Date(e.acknowledged_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                    </p>
                    {e.employee_comments && (
                        <p className="flex gap-1.5 whitespace-pre-line">
                            <MessageSquareText className="mt-0.5 size-4 shrink-0" /> {e.employee_comments}
                        </p>
                    )}
                </div>
            )}

            {e.can.acknowledge ? (
                <form
                    className="space-y-3 border-t pt-4"
                    onSubmit={(ev) => {
                        ev.preventDefault();
                        form.post(`${URL}/${e.id}/acknowledge`, { preserveScroll: true, onSuccess: onDone });
                    }}
                >
                    <div className="space-y-1.5">
                        <Label className="text-xs">Your comments (optional)</Label>
                        <Textarea
                            value={form.data.employee_comments}
                            onChange={(ev) => form.setData('employee_comments', ev.target.value)}
                            rows={3}
                            maxLength={2000}
                            placeholder="Anything you want on record about this review"
                        />
                        <InputError message={form.errors.employee_comments ?? (form.errors as Record<string, string>).status} />
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                        Acknowledging confirms you have read the review; it does not mean you agree with every point.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onDone}>
                            Later
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing && <Loader2 className="size-4 animate-spin" />} Acknowledge
                        </Button>
                    </DialogFooter>
                </form>
            ) : (
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onDone}>
                        Close
                    </Button>
                </DialogFooter>
            )}
        </div>
    );
}
