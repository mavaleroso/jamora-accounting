import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import { fmtClock, fmtDuration, overtimeWindow } from '@/lib/overtime-policy';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { Head, useForm } from '@inertiajs/react';
import { AlertTriangle, CalendarClock, Clock, Loader2, ShieldCheck } from 'lucide-react';
import * as React from 'react';

const URL_BASE = '/admin/system-settings';
const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Administration', href: '/admin/users' },
    { title: 'System Settings', href: URL_BASE },
];

const BREAK_PRESETS = [0, 30, 60];
const DEFAULT_CEILING = '00:00';
const NOTICE_PRESETS = [0, 3, 5, 7];

type LastChange = { at: string | null; by: string | null } | null;

type LeaveSettings = {
    /** Days ahead leave of the covered types must be filed. */
    min_notice_days: number;
    /** Codes of the leave types the notice covers. */
    leave_types: string[];
    /** Active leave types, each with the notice set on the type itself (the longer one applies). */
    types: { code: string; name: string; own_notice_days: number }[];
};

type Props = {
    overtime: { break_minutes: number; ceiling: string | null; minimum_minutes: number; block_minutes: number };
    defaultShift: { name: string; end: string };
    leave: LeaveSettings;
    /** Today in Manila, "YYYY-MM-DD", for the leave example. */
    today: string;
    lastChange: { overtime: LastChange; leave: LastChange };
};

export default function SystemSettingsPage({ overtime, defaultShift, leave, today, lastChange }: Props) {
    const form = useForm({
        overtime_break_minutes: String(overtime.break_minutes),
        has_ceiling: overtime.ceiling !== null,
        overtime_ceiling: overtime.ceiling ?? DEFAULT_CEILING,
    });
    const { data, setData, errors, processing, isDirty } = form;

    const breakMinutes = Math.max(0, Math.floor(Number(data.overtime_break_minutes) || 0));
    const ceiling = data.has_ceiling && data.overtime_ceiling ? data.overtime_ceiling : null;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({
            overtime_break_minutes: Number(d.overtime_break_minutes),
            overtime_ceiling: d.has_ceiling ? d.overtime_ceiling : null,
        }));
        form.put(URL_BASE, { preserveScroll: true, onSuccess: () => form.setDefaults() });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="System Settings" />
            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <Heading title="System Settings" description="Company-wide policy that applies to every branch." />
                    <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs">
                        <ShieldCheck className="size-3.5" /> Admin only
                    </span>
                </div>

                <form onSubmit={submit} className="max-w-3xl">
                    <Card className="gap-0 py-0">
                        <CardHeader className="border-b py-5">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Clock className="text-muted-foreground size-4" /> Overtime
                            </CardTitle>
                            <CardDescription>
                                When overtime starts and stops counting on a day with an approved overtime request. Overtime under{' '}
                                {fmtDuration(overtime.minimum_minutes)} is not counted, and it is counted in {fmtDuration(overtime.block_minutes)}{' '}
                                blocks.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="grid gap-6 py-6 md:grid-cols-[1fr_minmax(0,18rem)]">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="overtime_break_minutes">Break before overtime</Label>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="relative w-32">
                                            <Input
                                                id="overtime_break_minutes"
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                max={240}
                                                step={5}
                                                value={data.overtime_break_minutes}
                                                onChange={(e) => setData('overtime_break_minutes', e.target.value)}
                                                className="pr-12 tabular-nums"
                                                aria-describedby="overtime_break_minutes_hint"
                                            />
                                            <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                                                min
                                            </span>
                                        </div>
                                        {BREAK_PRESETS.map((minutes) => (
                                            <Button
                                                key={minutes}
                                                type="button"
                                                size="sm"
                                                variant={breakMinutes === minutes ? 'secondary' : 'ghost'}
                                                onClick={() => setData('overtime_break_minutes', String(minutes))}
                                            >
                                                {minutes === 0 ? 'None' : fmtDuration(minutes)}
                                            </Button>
                                        ))}
                                    </div>
                                    {errors.overtime_break_minutes ? (
                                        <InputError message={errors.overtime_break_minutes} />
                                    ) : (
                                        <p id="overtime_break_minutes_hint" className="text-muted-foreground text-xs">
                                            Unpaid time between the end of the shift and the start of overtime.
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-4">
                                        <Label htmlFor="has_ceiling">Overtime ceiling</Label>
                                        <Switch id="has_ceiling" checked={data.has_ceiling} onCheckedChange={(on) => setData('has_ceiling', on)} />
                                    </div>
                                    {data.has_ceiling ? (
                                        <Input
                                            id="overtime_ceiling"
                                            type="time"
                                            value={data.overtime_ceiling}
                                            onChange={(e) => setData('overtime_ceiling', e.target.value)}
                                            className="w-40"
                                            aria-label="Stop counting overtime at"
                                        />
                                    ) : null}
                                    {errors.overtime_ceiling ? (
                                        <InputError message={errors.overtime_ceiling} />
                                    ) : (
                                        <p className="text-muted-foreground text-xs">
                                            {data.has_ceiling
                                                ? 'Time past this is not counted as overtime and earns no night differential.'
                                                : 'Off: overtime counts until the employee clocks out.'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <Preview breakMinutes={breakMinutes} ceiling={ceiling} shift={defaultShift} />
                        </CardContent>

                        <CardFooter className="flex flex-col-reverse gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-muted-foreground text-xs">
                                {changedNote(lastChange.overtime)}
                                Saving recalculates time records payroll has not locked yet.
                            </p>
                            <Button type="submit" disabled={processing || !isDirty} className="shrink-0">
                                {processing && <Loader2 className="size-4 animate-spin" />} Save changes
                            </Button>
                        </CardFooter>
                    </Card>
                </form>

                <LeaveCard leave={leave} today={today} lastChange={lastChange.leave} />
            </div>
        </AppLayout>
    );
}

/** How far ahead leave that can be planned must be filed, and which leave types that covers. */
function LeaveCard({ leave, today, lastChange }: { leave: LeaveSettings; today: string; lastChange: LastChange }) {
    const form = useForm({ min_notice_days: String(leave.min_notice_days), leave_types: leave.leave_types });
    const { data, setData, errors, processing, isDirty } = form;
    const err = errors as Record<string, string | undefined>;
    const days = Math.max(0, Math.floor(Number(data.min_notice_days) || 0));

    const toggle = (code: string, on: boolean) =>
        setData('leave_types', on ? [...data.leave_types, code] : data.leave_types.filter((c) => c !== code));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({ min_notice_days: Number(d.min_notice_days), leave_types: d.leave_types }));
        form.put(`${URL_BASE}/leave`, { preserveScroll: true, onSuccess: () => form.setDefaults() });
    };

    // The earliest start for leave filed today, per leave type: its own notice or the company's, whichever is longer.
    const groups = new Map<number, string[]>();
    for (const t of leave.types) {
        const notice = Math.max(t.own_notice_days, data.leave_types.includes(t.code) ? days : 0);
        groups.set(notice, [...(groups.get(notice) ?? []), t.name]);
    }
    const rows = [...groups.entries()].sort(([a], [b]) => b - a);

    return (
        <form onSubmit={submit} className="max-w-3xl">
            <Card className="gap-0 py-0">
                <CardHeader className="border-b py-5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <CalendarClock className="text-muted-foreground size-4" /> Leave
                    </CardTitle>
                    <CardDescription>
                        How many days before it starts leave must be filed. Leave that can’t always be planned, such as sick or emergency leave, is
                        left out, so it keeps only the notice set on its own leave type.
                    </CardDescription>
                </CardHeader>

                <CardContent className="grid gap-6 py-6 md:grid-cols-[1fr_minmax(0,18rem)]">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="min_notice_days">Minimum notice</Label>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative w-32">
                                    <Input
                                        id="min_notice_days"
                                        type="number"
                                        inputMode="numeric"
                                        min={0}
                                        max={90}
                                        value={data.min_notice_days}
                                        onChange={(e) => setData('min_notice_days', e.target.value)}
                                        className="pr-14 tabular-nums"
                                    />
                                    <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                                        days
                                    </span>
                                </div>
                                {NOTICE_PRESETS.map((n) => (
                                    <Button
                                        key={n}
                                        type="button"
                                        size="sm"
                                        variant={days === n ? 'secondary' : 'ghost'}
                                        onClick={() => setData('min_notice_days', String(n))}
                                    >
                                        {n === 0 ? 'None' : `${n} days`}
                                    </Button>
                                ))}
                            </div>
                            {err.min_notice_days ? (
                                <InputError message={err.min_notice_days} />
                            ) : (
                                <p className="text-muted-foreground text-xs">Leave must be filed at least this many days before its first day.</p>
                            )}
                        </div>

                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">Applies to</legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {leave.types.map((t) => (
                                    <label key={t.code} className="hover:bg-muted/40 flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm">
                                        <Checkbox
                                            checked={data.leave_types.includes(t.code)}
                                            onCheckedChange={(on) => toggle(t.code, on === true)}
                                            className="mt-0.5"
                                        />
                                        <span className="min-w-0">
                                            <span className="block">{t.name}</span>
                                            <span className="text-muted-foreground block text-[11px]">
                                                {t.code}
                                                {t.own_notice_days > 0 ? ` · own notice ${t.own_notice_days} days` : ''}
                                            </span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                            {err.leave_types || err['leave_types.0'] ? (
                                <InputError message={err.leave_types ?? err['leave_types.0']} />
                            ) : (
                                <p className="text-muted-foreground text-xs">Leave types left unticked keep only their own notice.</p>
                            )}
                        </fieldset>
                    </div>

                    <div className="bg-muted/40 space-y-3 rounded-lg border p-4" aria-live="polite">
                        <div>
                            <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Example</p>
                            <p className="text-sm font-medium">Filed today, {fmtDay(today)}</p>
                        </div>
                        <ol className="space-y-2.5">
                            {rows.map(([notice, names]) => (
                                <li key={notice} className="flex gap-2.5">
                                    <span
                                        className={cn('mt-1.5 size-2 shrink-0 rounded-full', notice > 0 ? 'bg-amber-400' : 'bg-emerald-500')}
                                        aria-hidden
                                    />
                                    <div className="min-w-0">
                                        <p className="text-sm">
                                            {notice > 0 ? `Can start from ${fmtDay(addDays(today, notice))}` : 'Can start today'}
                                        </p>
                                        <p className="text-muted-foreground text-xs">{names.join(', ')}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </div>
                </CardContent>

                <CardFooter className="flex flex-col-reverse gap-3 border-t py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-muted-foreground text-xs">
                        {changedNote(lastChange)}
                        Applies to leave filed from now on.
                    </p>
                    <Button type="submit" disabled={processing || !isDirty} className="shrink-0">
                        {processing && <Loader2 className="size-4 animate-spin" />} Save changes
                    </Button>
                </CardFooter>
            </Card>
        </form>
    );
}

/** The overtime window on the company's default shift, so the effect of the settings is visible before saving. */
function Preview({ breakMinutes, ceiling, shift }: { breakMinutes: number; ceiling: string | null; shift: Props['defaultShift'] }) {
    const w = overtimeWindow({ break_minutes: breakMinutes, ceiling }, shift.end);
    const none = w.maxMinutes === 0;

    const rows: { tone: string; label: string; when: string }[] = [{ tone: 'bg-slate-400', label: 'Shift ends', when: fmtClock(w.shiftEnd) }];
    if (breakMinutes > 0) rows.push({ tone: 'bg-amber-400', label: 'Unpaid break', when: `${fmtClock(w.shiftEnd)} – ${fmtClock(w.start)}` });
    if (!none) {
        rows.push({
            tone: 'bg-emerald-500',
            label: w.maxMinutes === null ? 'Overtime counts' : `Overtime counts (up to ${fmtDuration(w.maxMinutes)})`,
            when: w.stop === null ? `From ${fmtClock(w.start)} to clock-out` : `${fmtClock(w.start)} – ${fmtClock(w.stop)}`,
        });
    }
    if (w.stop !== null) rows.push({ tone: 'bg-rose-400', label: 'Not counted', when: `After ${fmtClock(w.stop)}` });

    return (
        <div className="bg-muted/40 space-y-3 rounded-lg border p-4" aria-live="polite">
            <div>
                <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Example</p>
                <p className="text-sm font-medium">{shift.name}</p>
            </div>
            <ol className="space-y-2.5">
                {rows.map((row) => (
                    <li key={row.label} className="flex gap-2.5">
                        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', row.tone)} aria-hidden />
                        <div className="min-w-0">
                            <p className="text-sm">{row.label}</p>
                            <p className="text-muted-foreground text-xs tabular-nums">{row.when}</p>
                        </div>
                    </li>
                ))}
            </ol>
            {none && (
                <p className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    The ceiling comes before overtime starts, so no overtime would be counted on this shift.
                </p>
            )}
        </div>
    );
}

const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const changedNote = (change: LastChange) => (change?.at ? `Last changed ${fmtDateTime(change.at)}${change.by ? ` by ${change.by}` : ''}. ` : '');

/** "2026-10-20" + 5 days -> "2026-10-25" (calendar dates, no time zone shift). */
const addDays = (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** "2026-10-25" -> "Sun, Oct 25" */
const fmtDay = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};
