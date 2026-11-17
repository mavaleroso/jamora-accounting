import { router } from '@inertiajs/react';
import {
    AlertTriangle,
    Briefcase,
    CalendarOff,
    Check,
    Coffee,
    FilePenLine,
    Loader2,
    LocateFixed,
    LogIn,
    LogOut,
    MapPin,
    MapPinOff,
    PartyPopper,
    PlayCircle,
    ShieldCheck,
} from 'lucide-react';
import * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { richTextClass } from '@/components/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
    ATTENDANCE_STATUS,
    ATTENDANCE_URL,
    DOT,
    fmtDate,
    fmtHours,
    fmtMinutes,
    fmtTime,
    firstError,
    weekday,
    type BranchLocation,
    type MyDay,
} from '../lib';
import { useGeofence } from '../use-geofence';
import { CheckoutDialog } from './dialogs';

type PunchType = 'check_in' | 'break_out' | 'break_in' | 'check_out';

const minutesBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60000));

const atToday = (time: string, now: Date) => {
    const [h, m, s] = time.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, s || 0, 0);
    return d;
};

function greeting(now: Date) {
    const h = now.getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

type Props = {
    myDay: MyDay;
    branch: BranchLocation;
    today: string;
    onRequestCorrection: () => void;
    onOpenRequests: () => void;
};

export function MyClock({ myDay, branch, today, onRequestCorrection, onOpenRequests }: Props) {
    const [now, setNow] = React.useState(() => new Date());
    const [submitting, setSubmitting] = React.useState<PunchType | null>(null);
    const [checkoutOpen, setCheckoutOpen] = React.useState(false);
    const geo = useGeofence(branch);

    React.useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const { schedule, today: entry, employee } = myDay;
    const ob = myDay.officialBusiness;
    const done = Boolean(entry?.time_out);
    const onBreak = Boolean(entry?.break_out && !entry?.break_in && !done);
    const working = Boolean(entry?.time_in || entry?.break_in) && !done && !onBreak;
    const notIn = !entry?.time_in && !entry?.break_out && !entry?.break_in && !entry?.time_out;
    const missingAtCheckout = [!entry?.time_in && 'check-in', !entry?.break_out && 'break-out', !entry?.break_in && 'break-in'].filter(Boolean) as string[];

    const shiftStart = schedule.start ? atToday(schedule.start, now) : null;
    const presetBreak = schedule.break_start ? `${fmtTime(schedule.break_start)} – ${fmtTime(schedule.break_end)}` : null;
    const breakFrom = schedule.break_start ? atToday(schedule.break_start, now) : null;
    const breakTo = schedule.break_end ? atToday(schedule.break_end, now) : null;
    const lateNow = !entry?.time_in && shiftStart && now > new Date(shiftStart.getTime() + schedule.grace_minutes * 60000);

    const punch = (type: PunchType, checkout?: { accomplishment: string; remark: string }) => {
        if (type === 'check_out' && !checkout) {
            setCheckoutOpen(true);
            return;
        }
        if (!geo.canPunch) {
            toast.error(
                geo.status === 'out_of_range'
                    ? `You are ${geo.distance}m from ${branch.name}. Move within ${branch.geofence_radius}m to clock.`
                    : 'Turn on location access to clock in.',
            );
            return;
        }
        setSubmitting(type);
        router.post(
            `${ATTENDANCE_URL}/punch`,
            {
                employee_id: employee.id,
                punch_type: type,
                ...(checkout ? { accomplishment: checkout.accomplishment, ...(checkout.remark ? { notes: checkout.remark } : {}) } : {}),
                ...(geo.coords ? { latitude: geo.coords.latitude, longitude: geo.coords.longitude } : {}),
            },
            {
                preserveScroll: true,
                onSuccess: () => setCheckoutOpen(false),
                onError: (errors) => toast.error(firstError(errors)),
                onFinish: () => setSubmitting(null),
            },
        );
    };

    const modeMeta: Record<PunchType, { type: PunchType; key: 'time_in' | 'break_out' | 'break_in' | 'time_out'; label: string; buttonLabel: string; icon: typeof LogIn; className: string; value?: string | null }> = {
        check_in: {
            type: 'check_in',
            key: 'time_in',
            label: 'Check in',
            buttonLabel: 'Check in',
            icon: LogIn,
            className: 'bg-emerald-600 hover:bg-emerald-700 text-white',
            value: entry?.time_in,
        },
        break_out: {
            type: 'break_out',
            key: 'break_out',
            label: 'Break out',
            buttonLabel: 'Start break',
            icon: Coffee,
            className: 'bg-amber-500 hover:bg-amber-600 text-white',
            value: entry?.break_out,
        },
        break_in: {
            type: 'break_in',
            key: 'break_in',
            label: 'Break in',
            buttonLabel: 'End break',
            icon: PlayCircle,
            className: 'bg-sky-600 hover:bg-sky-700 text-white',
            value: entry?.break_in,
        },
        check_out: {
            type: 'check_out',
            key: 'time_out',
            label: 'Check out',
            buttonLabel: 'Check out',
            icon: LogOut,
            className: 'bg-rose-600 hover:bg-rose-700 text-white',
            value: entry?.time_out,
        },
    };

    // Recommended mode for today (always starts at Check in on a new day), while letting the user pick any unrecorded mode.
    const defaultMode: PunchType | null = notIn
        ? 'check_in'
        : onBreak
          ? 'break_in'
          : working && !entry?.break_out && !entry?.break_in
            ? 'break_out'
            : !done
              ? 'check_out'
              : null;

    const [selectedMode, setSelectedMode] = React.useState<PunchType | null>(defaultMode);
    React.useEffect(() => {
        setSelectedMode(defaultMode);
    }, [defaultMode, entry?.time_in, entry?.break_out, entry?.break_in, entry?.time_out]);

    const activeMode = selectedMode && !modeMeta[selectedMode].value ? modeMeta[selectedMode] : defaultMode ? modeMeta[defaultMode] : null;
    // Quick secondary shortcut to Check out when Start break / End break / Check in is selected.
    const secondary =
        activeMode && activeMode.type !== 'check_out' && !entry?.time_out
            ? { type: 'check_out' as const, label: 'Check out', icon: LogOut }
            : null;

    const statusLine = (() => {
        if (ob) {
            return {
                tone: 'text-emerald-700 dark:text-emerald-300',
                text: `You’re on official business today${ob.destination ? ` — ${ob.destination}` : ''}. Your full shift is credited.`,
            };
        }
        if (done) {
            const unpaidOt = Number(entry!.ot_hours) - Number(entry!.ot_hours_approved);
            return {
                tone: 'text-blue-700 dark:text-blue-300',
                text: `Done for today — ${fmtHours(entry!.regular_hours)} regular${Number(entry!.ot_hours) > 0 ? ` + ${fmtHours(entry!.ot_hours)} OT` : ''}.${unpaidOt > 0 ? ' Overtime is only paid once your OT request is approved.' : ''}`,
            };
        }
        if (onBreak) {
            const mins = minutesBetween(atToday(entry!.break_out!, now), now);
            const over = mins > schedule.break_minutes;
            return {
                tone: over ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300',
                text: `On break since ${fmtTime(entry!.break_out)} · ${fmtMinutes(mins)}${over ? ` (${fmtMinutes(mins - schedule.break_minutes)} over)` : ` of ${schedule.break_minutes}m`}`,
            };
        }
        if (working) {
            const since = entry?.time_in ?? entry?.break_in;
            const mins = since ? minutesBetween(atToday(since, now), now) : 0;
            const text = since
                ? `${entry?.time_in ? 'Working since' : 'Back from break at'} ${fmtTime(since)} · ${fmtMinutes(mins)}${Number(entry?.tardiness_minutes) > 0 ? ` · ${fmtMinutes(entry!.tardiness_minutes)} late` : ''}`
                : 'Working today';
            // Point the employee to their preset break.
            if (!entry?.break_out && breakFrom && breakTo && now >= breakFrom && now < breakTo) {
                return { tone: 'text-amber-700 dark:text-amber-300', text: `It’s your break time (${presetBreak}). ${text}` };
            }
            return {
                tone: 'text-emerald-700 dark:text-emerald-300',
                text: !entry?.break_out && breakFrom && now < breakFrom ? `${text} · Break at ${fmtTime(schedule.break_start)}` : text,
            };
        }
        if (schedule.is_rest_day) return { tone: 'text-muted-foreground', text: 'It’s your rest day. Work today is paid at rest-day premium once approved.' };
        if (myDay.holiday) return { tone: 'text-sky-700 dark:text-sky-300', text: `${myDay.holiday.name} — holiday pay rules apply if you work.` };
        if (lateNow) return { tone: 'text-rose-700 dark:text-rose-300', text: `Your shift started at ${fmtTime(schedule.start)} — ${fmtMinutes(minutesBetween(shiftStart!, now))} ago.` };
        if (shiftStart) return { tone: 'text-muted-foreground', text: `Your shift starts at ${fmtTime(schedule.start)}${shiftStart > now ? ` (in ${fmtMinutes(minutesBetween(now, shiftStart))})` : ''}.` };
        return { tone: 'text-muted-foreground', text: 'Ready when you are.' };
    })();

    const steps = [modeMeta.check_in, modeMeta.break_out, modeMeta.break_in, modeMeta.check_out] as const;

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Clock card */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <div className="flex flex-col gap-4 border-b bg-gradient-to-br from-primary/5 via-card to-card p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <PersonAvatar src={employee.avatar_url} seed={employee.employee_code} name={employee.name} className="size-12" />
                        <div>
                            <div className="text-sm text-muted-foreground">
                                {greeting(now)}, {employee.firstname}
                            </div>
                            <div className="text-xs text-muted-foreground">{now.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                        </div>
                    </div>
                    <div className="text-left sm:text-right">
                        <div className="font-mono text-4xl font-bold tracking-tight tabular-nums">
                            {now.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
                            <span className="ml-1 text-lg text-muted-foreground">{String(now.getSeconds()).padStart(2, '0')}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {schedule.is_rest_day ? (
                                'Rest day'
                            ) : (
                                <>
                                    {schedule.shift_name.replace(/\s*\(.*\)$/, '')} · {fmtTime(schedule.start)} – {fmtTime(schedule.end)}
                                    {presetBreak && <div>Break {presetBreak}</div>}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-5 p-5">
                    <p className={cn('text-sm font-medium', statusLine.tone)}>{statusLine.text}</p>

                    {/* Action */}
                    {ob ? (
                        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                            <Briefcase className="size-5 shrink-0" />
                            <div className="text-sm">No need to check in or out today. Your approved official business covers the whole day.</div>
                        </div>
                    ) : activeMode ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                size="lg"
                                className={cn('h-16 flex-1 text-lg font-semibold shadow-sm', activeMode.className)}
                                disabled={Boolean(submitting) || !geo.canPunch}
                                onClick={() => punch(activeMode.type)}
                            >
                                {submitting === activeMode.type ? <Loader2 className="size-5 animate-spin" /> : <activeMode.icon className="size-5" />}
                                {activeMode.buttonLabel}
                            </Button>
                            {secondary && (
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className="h-16 text-base sm:w-44"
                                    disabled={Boolean(submitting) || !geo.canPunch}
                                    onClick={() => punch(secondary.type)}
                                >
                                    {submitting === secondary.type ? <Loader2 className="size-5 animate-spin" /> : <secondary.icon className="size-5" />}
                                    {secondary.label}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                            <PartyPopper className="size-5 shrink-0" />
                            <div className="text-sm">
                                Shift complete. Something off?{' '}
                                <button type="button" className="font-medium underline underline-offset-2" onClick={onRequestCorrection}>
                                    Request a correction
                                </button>
                                .
                            </div>
                        </div>
                    )}
                    {done && entry?.accomplishment && (
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                            <div className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Today’s accomplishment</div>
                            {/* Sanitized to simple formatting by the server (App\Support\RichText). */}
                            <div className={richTextClass} dangerouslySetInnerHTML={{ __html: entry.accomplishment }} />
                        </div>
                    )}

                    {/* Location */}
                    <LocationRow geo={geo} branch={branch} />

                    {/* Flexible mode selector / stepper */}
                    <div className="space-y-1.5">
                        {!ob && steps.some((s) => !s.value) && (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Clock mode — select a step below to switch punch mode if a previous step was missed</span>
                                {selectedMode && selectedMode !== defaultMode && defaultMode && (
                                    <button type="button" className="font-medium text-primary hover:underline" onClick={() => setSelectedMode(defaultMode)}>
                                        Reset to default
                                    </button>
                                )}
                            </div>
                        )}
                        <ol className="grid grid-cols-4 gap-2">
                            {steps.map((s) => {
                                const isDone = Boolean(s.value);
                                const isSelected = !ob && !isDone && activeMode?.type === s.type;
                                const canSelect = !ob && !isDone;
                                return (
                                    <li key={s.key}>
                                        <button
                                            type="button"
                                            disabled={!canSelect || Boolean(submitting)}
                                            onClick={() => canSelect && setSelectedMode(s.type)}
                                            className={cn(
                                                'w-full rounded-lg border p-2.5 text-center transition-colors sm:text-left',
                                                isDone && 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30',
                                                isSelected && 'border-primary bg-primary/5 ring-2 ring-primary/20',
                                                canSelect && !isSelected && 'hover:border-primary/40 hover:bg-muted/50 cursor-pointer',
                                                !canSelect && 'cursor-default',
                                            )}
                                        >
                                            <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground sm:justify-start">
                                                {isDone ? <Check className="size-3.5 text-emerald-600" /> : <s.icon className={cn('size-3.5', isSelected && 'text-primary')} />}
                                                <span className={cn('hidden sm:inline', isSelected && 'font-semibold text-foreground')}>{s.label}</span>
                                            </div>
                                            <div className={cn('mt-1 font-mono text-sm font-semibold', !isDone && !isSelected && 'text-muted-foreground', isSelected && 'text-primary')}>
                                                {isDone ? fmtTime(s.value) : isSelected ? 'active' : 'select'}
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                </div>
            </div>

            {/* Week + shortcuts */}
            <div className="space-y-4">
                <div className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="mb-3 flex items-baseline justify-between">
                        <h3 className="text-sm font-semibold">This week</h3>
                        <span className="text-xs text-muted-foreground">
                            {fmtHours(myDay.weekTotals.regular_hours)} reg
                            {myDay.weekTotals.ot_hours > 0 && ` · ${fmtHours(myDay.weekTotals.ot_hours)} OT`}
                        </span>
                    </div>
                    <ul className="space-y-1">
                        {myDay.week.map((d) => {
                            const isToday = d.date === today;
                            const meta = d.entry ? ATTENDANCE_STATUS[d.entry.attendance_status] : null;
                            return (
                                <li
                                    key={d.date}
                                    className={cn('flex items-center gap-3 rounded-md px-2 py-1.5 text-sm', isToday && 'bg-primary/5 ring-1 ring-primary/20')}
                                >
                                    <span className="w-9 text-xs font-medium text-muted-foreground">{weekday(d.date)}</span>
                                    <span className={cn('size-2 rounded-full', meta ? DOT[meta.tone] : 'bg-muted-foreground/20')} />
                                    <span className="flex-1 truncate text-xs">
                                        {d.entry ? (
                                            d.entry.time_in ? (
                                                <span className="font-mono">
                                                    {fmtTime(d.entry.time_in)} – {fmtTime(d.entry.time_out)}
                                                </span>
                                            ) : (
                                                meta?.label
                                            )
                                        ) : d.is_rest_day ? (
                                            <span className="text-muted-foreground">Rest day</span>
                                        ) : (
                                            <span className="text-muted-foreground">—</span>
                                        )}
                                    </span>
                                    <span className="w-10 text-right font-mono text-xs tabular-nums">
                                        {d.entry && Number(d.entry.regular_hours) > 0 ? fmtHours(d.entry.regular_hours) : ''}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                    {myDay.weekTotals.tardiness_minutes > 0 && (
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="size-3.5" /> {fmtMinutes(myDay.weekTotals.tardiness_minutes)} late this week
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={onRequestCorrection}>
                        <FilePenLine className="size-4" />
                        <span className="text-xs">Fix a punch / OT</span>
                    </Button>
                    <Button variant="outline" className="relative h-auto flex-col gap-1 py-3" onClick={onOpenRequests}>
                        <CalendarOff className="size-4" />
                        <span className="text-xs">My requests</span>
                        {myDay.pendingRequests > 0 && (
                            <Badge className="absolute -top-2 -right-2 h-5 min-w-5 justify-center rounded-full px-1.5">{myDay.pendingRequests}</Badge>
                        )}
                    </Button>
                </div>
                <p className="px-1 text-[11px] text-muted-foreground">
                    Shift: {fmtDate(myDay.week[0].date)} – {fmtDate(myDay.week[6].date)} · {schedule.grace_minutes}-min grace · {schedule.break_minutes}-min unpaid break
                    {presetBreak && ` at ${fmtTime(schedule.break_start)}`}
                </p>
            </div>

            <CheckoutDialog
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                processing={submitting === 'check_out'}
                missing={missingAtCheckout}
                onConfirm={(data) => punch('check_out', data)}
            />
        </div>
    );
}

function LocationRow({ geo, branch }: { geo: ReturnType<typeof useGeofence>; branch: BranchLocation }) {
    const config = {
        disabled: { icon: MapPin, tone: 'border-border bg-muted/40 text-muted-foreground', text: `Location check is off for ${branch.name}.` },
        locating: { icon: Loader2, tone: 'border-border bg-muted/40 text-muted-foreground', text: 'Checking your location…' },
        in_range: { icon: ShieldCheck, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200', text: `You’re at ${branch.name} (${geo.distance}m away).` },
        out_of_range: {
            icon: MapPinOff,
            tone: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
            text: `You’re ${geo.distance != null && geo.distance >= 1000 ? `${(geo.distance / 1000).toFixed(1)}km` : `${geo.distance}m`} from ${branch.name}. Clocking opens within ${branch.geofence_radius}m.`,
        },
        permission_denied: {
            icon: MapPinOff,
            tone: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
            text: 'Location is blocked. Click the lock icon in the address bar → allow Location, then retry.',
        },
        unavailable: {
            icon: MapPinOff,
            tone: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
            text: geo.error ?? 'Couldn’t get your location. Move near a window and retry.',
        },
    }[geo.status];
    const Icon = config.icon;

    return (
        <div className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm', config.tone)}>
            <Icon className={cn('size-4 shrink-0', geo.status === 'locating' && 'animate-spin')} />
            <span className="flex-1">
                {config.text}
                {geo.coords && geo.status !== 'disabled' && geo.coords.accuracy > 100 && (
                    <span className="block text-xs opacity-80">GPS accuracy is low (±{geo.coords.accuracy}m) — try again outdoors.</span>
                )}
            </span>
            {branch.geofence_enforced && geo.status !== 'locating' && (
                <Button size="sm" variant="ghost" className="h-7 shrink-0" onClick={geo.locate}>
                    <LocateFixed className="size-3.5" /> Retry
                </Button>
            )}
        </div>
    );
}
