import { useConfirm } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Clock, Info, Loader2, Moon, MoreHorizontal, Pencil, Plus, Power, Star, Trash2 } from 'lucide-react';
import * as React from 'react';

const URL_BASE = '/libraries/shifts';
const breadcrumbs: BreadcrumbItem[] = [{ title: 'Shifts', href: URL_BASE }];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#06b6d4', '#64748b'];
const DAY = 24 * 60;

type Shift = {
    id: number;
    code: string;
    name: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    grace_minutes: number;
    color: string | null;
    is_active: boolean;
    /** The shift every employee works unless the roster sets another for the day. */
    is_default: boolean;
    net_hours: number;
    /** Employees given this shift as their own (most follow the company default). */
    employees_count: number;
    /** Roster days made with this shift. */
    rosters_count: number;
};

type Props = {
    shifts: Shift[];
    company: { id: number; name: string } | null;
    /** The shift in force: the library default, else the configured one (id null). */
    defaultShift: { id: number | null; name: string; start: string; end: string; break_minutes: number; grace_minutes: number };
    /** Active employees without a shift of their own: they work the company default. */
    followersCount: number;
    presetBreakMinutes: number;
};

const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

/** Minutes past midnight → "1:05 PM" */
const fmtClock = (minutes: number) => {
    const m = ((minutes % DAY) + DAY) % DAY;
    const h = Math.floor(m / 60);
    return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

/** "13:05:00" → "1:05 PM" */
const fmtTime = (time: string) => fmtClock(toMinutes(time));

const fmtDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return [h ? `${h} hr${h > 1 ? 's' : ''}` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
};

/** Span in minutes; a shift ending at or before its start runs past midnight. */
const spanOf = (start: string, end: string) => {
    const span = toMinutes(end) - toMinutes(start);
    return span <= 0 ? span + DAY : span;
};
const isOvernight = (start: string, end: string) => toMinutes(end) <= toMinutes(start);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function ShiftsPage({ shifts, company, defaultShift, followersCount, presetBreakMinutes }: Props) {
    const [editing, setEditing] = React.useState<Shift | 'new' | null>(null);
    const confirm = useConfirm();

    const payload = (s: Shift, changes: Partial<Shift> = {}) => {
        const next = { ...s, ...changes };
        return {
            code: next.code,
            name: next.name,
            start_time: next.start_time.slice(0, 5),
            end_time: next.end_time.slice(0, 5),
            break_minutes: next.break_minutes,
            grace_minutes: next.grace_minutes,
            color: next.color,
            is_active: next.is_active,
            is_default: next.is_default,
        };
    };
    const firstError = (errors: Record<string, string>) => Object.values(errors)[0] ?? 'The shift could not be saved.';
    const save = (s: Shift, changes: Partial<Shift>) =>
        router.put(`${URL_BASE}/${s.id}`, payload(s, changes), { preserveScroll: true, onError: (e) => toast.error(firstError(e)) });

    const makeDefault = async (s: Shift) => {
        const ok = await confirm({
            title: `Make ${s.name} the company default?`,
            description: `Everyone without a shift of their own works ${fmtTime(s.start_time)} – ${fmtTime(s.end_time)} from now on, on days the roster doesn't set. Time records payroll hasn't locked are recalculated.`,
            confirmLabel: 'Make default',
        });
        if (ok) save(s, { is_default: true });
    };
    const toggleActive = async (s: Shift) => {
        if (s.is_active) {
            const ok = await confirm({
                title: `Deactivate ${s.name}?`,
                description: 'It is no longer offered when rostering a day. Roster days already made with it keep their hours.',
                confirmLabel: 'Deactivate',
            });
            if (!ok) return;
        }
        save(s, { is_active: !s.is_active });
    };
    const remove = async (s: Shift) => {
        const ok = await confirm({
            title: `Delete ${s.name}?`,
            description: 'It is removed from the shift library. Roster days already made with it keep their own name and hours.',
            confirmLabel: 'Delete shift',
            variant: 'destructive',
        });
        if (ok) router.delete(`${URL_BASE}/${s.id}`, { preserveScroll: true, onError: (e) => toast.error(firstError(e)) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Shifts" />
            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <Heading
                        title="Shifts"
                        description={`${company?.name ? `${company.name}'s` : 'The'} shift library. Shifts are offered when rostering a day; the company default is the shift every employee works unless the roster sets another.`}
                    />
                    <Button onClick={() => setEditing('new')} className="shrink-0">
                        <Plus className="size-4" /> Add shift
                    </Button>
                </div>

                {defaultShift.id === null && (
                    <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <Info className="mt-0.5 size-4 shrink-0" />
                        No company default yet, so everyone works {fmtTime(defaultShift.start)} – {fmtTime(defaultShift.end)}. Add a shift and make it
                        the company default to change that.
                    </p>
                )}

                {shifts.length === 0 ? (
                    <Card className="items-center gap-2 py-12 text-center">
                        <Clock className="text-muted-foreground size-8" />
                        <p className="font-medium">No shifts yet</p>
                        <p className="text-muted-foreground max-w-sm text-sm">
                            Add the shifts this company works, such as a mid or closing shift, to offer them when rostering.
                        </p>
                    </Card>
                ) : (
                    <div className="grid gap-3">
                        {shifts.map((s) => (
                            <ShiftCard
                                key={s.id}
                                shift={s}
                                followersCount={followersCount}
                                onEdit={() => setEditing(s)}
                                onMakeDefault={() => makeDefault(s)}
                                onToggleActive={() => toggleActive(s)}
                                onDelete={() => remove(s)}
                            />
                        ))}
                    </div>
                )}

                <p className="text-muted-foreground text-xs">
                    Each employee's preset break lasts {fmtDuration(presetBreakMinutes)} within their shift. Changing a shift's hours recalculates
                    time records payroll hasn't locked; roster days already published keep the hours they were given.
                </p>
            </div>

            {editing && <ShiftDialog shift={editing === 'new' ? null : editing} isFirst={shifts.length === 0} onClose={() => setEditing(null)} />}
        </AppLayout>
    );
}

function ShiftCard({
    shift: s,
    followersCount,
    onEdit,
    onMakeDefault,
    onToggleActive,
    onDelete,
}: {
    shift: Shift;
    followersCount: number;
    onEdit: () => void;
    onMakeDefault: () => void;
    onToggleActive: () => void;
    onDelete: () => void;
}) {
    const overnight = isOvernight(s.start_time, s.end_time);
    const usage = [
        s.is_default ? `Everyone without a shift of their own (${plural(followersCount, 'active employee')})` : null,
        s.employees_count ? `${plural(s.employees_count, 'employee')} with it as their own shift` : null,
        s.rosters_count ? `Used on ${plural(s.rosters_count, 'roster day')}` : null,
    ].filter(Boolean);
    const inUse = s.is_default || s.employees_count > 0;

    return (
        <Card className={cn('gap-0 py-0', !s.is_active && 'opacity-70')}>
            <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ backgroundColor: s.color ?? COLORS[7] }} aria-hidden />
                    <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{s.name}</span>
                            <span className="text-muted-foreground font-mono text-xs">{s.code}</span>
                            {s.is_default && (
                                <Badge className="gap-1">
                                    <Star className="size-3" /> Company default
                                </Badge>
                            )}
                            {overnight && (
                                <Badge variant="outline" className="gap-1">
                                    <Moon className="size-3" /> Overnight
                                </Badge>
                            )}
                            {!s.is_active && <Badge variant="outline">Inactive</Badge>}
                        </div>
                        <p className="text-sm tabular-nums">
                            {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                            <span className="text-muted-foreground">
                                {' '}
                                · {fmtDuration(Math.round(s.net_hours * 60))} paid ·{' '}
                                {s.break_minutes ? `${fmtDuration(s.break_minutes)} unpaid break` : 'no break'} ·{' '}
                                {s.grace_minutes ? `${s.grace_minutes} min grace` : 'no grace period'}
                            </span>
                        </p>
                        <p className="text-muted-foreground text-xs">
                            {usage.length ? usage.join(' · ') : s.is_active ? 'Offered when rostering a day' : 'Not offered when rostering'}
                        </p>
                    </div>
                </div>

                <Timeline start={s.start_time} end={s.end_time} color={s.color ?? COLORS[7]} className="md:w-60" />

                <div className="flex shrink-0 items-center gap-1 self-end md:self-center">
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <Pencil className="size-3.5" /> Edit
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label={`More actions for ${s.name}`}>
                                <MoreHorizontal className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled={s.is_default || !s.is_active} onSelect={onMakeDefault}>
                                <Star className="size-4" /> Make company default
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={inUse && s.is_active} onSelect={onToggleActive}>
                                <Power className="size-4" /> {s.is_active ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={inUse} onSelect={onDelete} className="text-destructive focus:text-destructive">
                                <Trash2 className="size-4" /> Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </Card>
    );
}

/** Where the shift falls in the day, on a 24-hour track; an overnight shift wraps past midnight. */
function Timeline({ start, end, color, className }: { start: string; end: string; color: string; className?: string }) {
    const from = toMinutes(start);
    const to = toMinutes(end);
    const parts = isOvernight(start, end)
        ? [
              [from, DAY],
              [0, to],
          ]
        : [[from, to]];

    return (
        <div className={cn('w-full', className)} aria-hidden>
            <div className="bg-muted relative h-2.5 overflow-hidden rounded-full">
                {parts.map(([a, b]) => (
                    <span
                        key={a}
                        className="absolute inset-y-0 rounded-full"
                        style={{ left: `${(a / DAY) * 100}%`, width: `${((b - a) / DAY) * 100}%`, backgroundColor: color }}
                    />
                ))}
            </div>
            <div className="text-muted-foreground mt-1 flex justify-between text-[10px] tabular-nums">
                <span>12a</span>
                <span>6a</span>
                <span>12p</span>
                <span>6p</span>
                <span>12a</span>
            </div>
        </div>
    );
}

function ShiftDialog({ shift, isFirst, onClose }: { shift: Shift | null; isFirst: boolean; onClose: () => void }) {
    const form = useForm({
        code: shift?.code ?? '',
        name: shift?.name ?? '',
        start_time: shift?.start_time.slice(0, 5) ?? '09:00',
        end_time: shift?.end_time.slice(0, 5) ?? '18:00',
        break_minutes: String(shift?.break_minutes ?? 60),
        grace_minutes: String(shift?.grace_minutes ?? 5),
        color: shift?.color ?? COLORS[0],
        is_active: shift?.is_active ?? true,
        // The first shift of a company becomes its default.
        is_default: shift?.is_default ?? isFirst,
    });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();

    const valid = data.start_time && data.end_time && data.start_time !== data.end_time;
    const span = valid ? spanOf(data.start_time, data.end_time) : 0;
    const paid = Math.max(0, span - (Number(data.break_minutes) || 0));

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (data.is_default && !shift?.is_default) {
            const ok = await confirm({
                title: `Make ${data.name || 'this shift'} the company default?`,
                description:
                    'Everyone without a shift of their own works it from now on, on days the roster doesn’t set. Time records payroll hasn’t locked are recalculated.',
                confirmLabel: 'Save as default',
            });
            if (!ok) return;
        }
        form.transform((d) => ({ ...d, break_minutes: Number(d.break_minutes), grace_minutes: Number(d.grace_minutes) }));
        const options = { preserveScroll: true, onSuccess: onClose };
        if (shift) form.put(`${URL_BASE}/${shift.id}`, options);
        else form.post(URL_BASE, options);
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>{shift ? `Edit ${shift.name}` : 'Add shift'}</DialogTitle>
                        <DialogDescription>
                            {shift?.is_default
                                ? 'The company default: changing its hours changes everyone’s regular schedule.'
                                : 'Offered when rostering a day.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
                        <div className="grid gap-1.5">
                            <Label htmlFor="shift-name">Name *</Label>
                            <Input
                                id="shift-name"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                placeholder="Mid Shift"
                                autoFocus={!shift}
                            />
                            <InputError message={errors.name} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="shift-code">Code *</Label>
                            <Input
                                id="shift-code"
                                value={data.code}
                                onChange={(e) => setData('code', e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                                className="font-mono"
                                placeholder="MID-1019"
                            />
                            <InputError message={errors.code} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div className="grid gap-1.5">
                            <Label htmlFor="shift-start">Starts *</Label>
                            <Input id="shift-start" type="time" value={data.start_time} onChange={(e) => setData('start_time', e.target.value)} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="shift-end">Ends *</Label>
                            <Input id="shift-end" type="time" value={data.end_time} onChange={(e) => setData('end_time', e.target.value)} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="shift-break">Unpaid break</Label>
                            <div className="relative">
                                <Input
                                    id="shift-break"
                                    type="number"
                                    min={0}
                                    max={240}
                                    step={15}
                                    value={data.break_minutes}
                                    onChange={(e) => setData('break_minutes', e.target.value)}
                                    className="pr-10 tabular-nums"
                                />
                                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                                    min
                                </span>
                            </div>
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="shift-grace">Grace period</Label>
                            <div className="relative">
                                <Input
                                    id="shift-grace"
                                    type="number"
                                    min={0}
                                    max={60}
                                    value={data.grace_minutes}
                                    onChange={(e) => setData('grace_minutes', e.target.value)}
                                    className="pr-10 tabular-nums"
                                />
                                <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                                    min
                                </span>
                            </div>
                        </div>
                    </div>
                    {(errors.start_time || errors.end_time || errors.break_minutes || errors.grace_minutes) && (
                        <InputError message={errors.start_time || errors.end_time || errors.break_minutes || errors.grace_minutes} />
                    )}

                    {valid && (
                        <div className="bg-muted/40 grid gap-2 rounded-lg border p-3">
                            <p className="text-sm tabular-nums">
                                {fmtTime(data.start_time)} – {fmtTime(data.end_time)}
                                {isOvernight(data.start_time, data.end_time) && <span className="text-muted-foreground"> (ends the next day)</span>}
                                <span className="text-muted-foreground"> · {fmtDuration(paid)} paid</span>
                            </p>
                            <Timeline start={data.start_time} end={data.end_time} color={data.color} />
                            <p className="text-muted-foreground text-xs">
                                Late when checking in after {fmtClock(toMinutes(data.start_time) + (Number(data.grace_minutes) || 0))}.
                            </p>
                        </div>
                    )}

                    <div className="grid gap-1.5">
                        <Label>Colour</Label>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                            {COLORS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    role="radio"
                                    aria-checked={data.color === c}
                                    aria-label={c}
                                    onClick={() => setData('color', c)}
                                    className={cn(
                                        'size-7 rounded-full border-2 transition',
                                        data.color === c ? 'border-foreground scale-110' : 'border-transparent',
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="divide-y rounded-lg border">
                        <label className="flex items-center justify-between gap-4 p-3 text-sm">
                            <span>
                                <span className="font-medium">Company default</span>
                                <span className="text-muted-foreground block text-xs">
                                    {shift?.is_default
                                        ? 'To change it, make another shift the default.'
                                        : 'The shift every employee works unless the roster sets another.'}
                                </span>
                            </span>
                            <Switch
                                checked={data.is_default}
                                disabled={!!shift?.is_default}
                                onCheckedChange={(on) => setData((d) => ({ ...d, is_default: on, is_active: on || d.is_active }))}
                            />
                        </label>
                        <label className="flex items-center justify-between gap-4 p-3 text-sm">
                            <span>
                                <span className="font-medium">Active</span>
                                <span className="text-muted-foreground block text-xs">Offered when rostering a day.</span>
                            </span>
                            <Switch checked={data.is_active} disabled={data.is_default} onCheckedChange={(on) => setData('is_active', on)} />
                        </label>
                    </div>
                    <InputError message={errors.is_default || errors.is_active} />

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {processing && <Loader2 className="size-4 animate-spin" />}
                            {shift ? 'Save changes' : 'Add shift'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
