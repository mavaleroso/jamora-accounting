import { router } from '@inertiajs/react';
import {
    AlertTriangle,
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
import { CheckoutRemarkDialog } from './dialogs';

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
    const [remarkOpen, setRemarkOpen] = React.useState(false);
    const geo = useGeofence(branch);

    React.useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(t);
    }, []);

    const { schedule, today: entry, employee } = myDay;
    const done = Boolean(entry?.time_out);
    const onBreak = Boolean(entry?.break_out && !entry?.break_in);
    const working = Boolean(entry?.time_in) && !done && !onBreak;
    const notIn = !entry?.time_in;
    const breakTaken = Boolean(entry?.break_out && entry?.break_in);

    const shiftStart = schedule.start ? atToday(schedule.start, now) : null;
    const lateNow = notIn && shiftStart && now > new Date(shiftStart.getTime() + schedule.grace_minutes * 60000);

    const punch = (type: PunchType, notes?: string) => {
        if (type === 'check_out' && !breakTaken && notes === undefined) {
            setRemarkOpen(true);
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
                ...(notes ? { notes } : {}),
                ...(geo.coords ? { latitude: geo.coords.latitude, longitude: geo.coords.longitude } : {}),
            },
            {
                preserveScroll: true,
                onSuccess: () => setRemarkOpen(false),
                onError: (errors) => toast.error(firstError(errors)),
                onFinish: () => setSubmitting(null),
            },
        );
    };

    // What the person should do next, as one obvious button.
    const primary: { type: PunchType; label: string; icon: typeof LogIn; className: string } | null = notIn
        ? { type: 'check_in', label: 'Check in', icon: LogIn, className: 'bg-emerald-600 hover:bg-emerald-700 text-white' }
        : onBreak
          ? { type: 'break_in', label: 'End break', icon: PlayCircle, className: 'bg-sky-600 hover:bg-sky-700 text-white' }
          : working && !entry?.break_out
            ? { type: 'break_out', label: 'Start break', icon: Coffee, className: 'bg-amber-500 hover:bg-amber-600 text-white' }
            : working
              ? { type: 'check_out', label: 'Check out', icon: LogOut, className: 'bg-rose-600 hover:bg-rose-700 text-white' }
              : null;
    const secondary = working && !entry?.break_out ? { type: 'check_out' as const, label: 'Check out', icon: LogOut } : null;

    const statusLine = (() => {
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
            const mins = minutesBetween(atToday(entry!.time_in!, now), now);
            return {
                tone: 'text-emerald-700 dark:text-emerald-300',
                text: `Working since ${fmtTime(entry!.time_in)} · ${fmtMinutes(mins)}${Number(entry!.tardiness_minutes) > 0 ? ` · ${fmtMinutes(entry!.tardiness_minutes)} late` : ''}`,
            };
        }
        if (schedule.is_rest_day) return { tone: 'text-muted-foreground', text: 'It’s your rest day. Work today is paid at rest-day premium once approved.' };
        if (myDay.holiday) return { tone: 'text-sky-700 dark:text-sky-300', text: `${myDay.holiday.name} — holiday pay rules apply if you work.` };
        if (lateNow) return { tone: 'text-rose-700 dark:text-rose-300', text: `Your shift started at ${fmtTime(schedule.start)} — ${fmtMinutes(minutesBetween(shiftStart!, now))} ago.` };
        if (shiftStart) return { tone: 'text-muted-foreground', text: `Your shift starts at ${fmtTime(schedule.start)}${shiftStart > now ? ` (in ${fmtMinutes(minutesBetween(now, shiftStart))})` : ''}.` };
        return { tone: 'text-muted-foreground', text: 'Ready when you are.' };
    })();

    const steps = [
        { key: 'time_in', label: 'Check in', icon: LogIn, value: entry?.time_in },
        { key: 'break_out', label: 'Break out', icon: Coffee, value: entry?.break_out },
        { key: 'break_in', label: 'Break in', icon: PlayCircle, value: entry?.break_in },
        { key: 'time_out', label: 'Check out', icon: LogOut, value: entry?.time_out },
    ] as const;
    const nextStep = steps.findIndex((s) => !s.value);

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
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-5 p-5">
                    <p className={cn('text-sm font-medium', statusLine.tone)}>{statusLine.text}</p>

                    {/* Action */}
                    {primary ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                size="lg"
                                className={cn('h-16 flex-1 text-lg font-semibold shadow-sm', primary.className)}
                                disabled={Boolean(submitting) || !geo.canPunch}
                                onClick={() => punch(primary.type)}
                            >
                                {submitting === primary.type ? <Loader2 className="size-5 animate-spin" /> : <primary.icon className="size-5" />}
                                {primary.label}
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

                    {/* Location */}
                    <LocationRow geo={geo} branch={branch} />

                    {/* Stepper */}
                    <ol className="grid grid-cols-4 gap-2">
                        {steps.map((s, i) => {
                            const isDone = Boolean(s.value);
                            const isNext = i === nextStep && !done;
                            const skipped = !isDone && done;
                            return (
                                <li
                                    key={s.key}
                                    className={cn(
                                        'rounded-lg border p-2.5 text-center sm:text-left',
                                        isDone && 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30',
                                        isNext && 'border-primary/50 ring-2 ring-primary/15',
                                    )}
                                >
                                    <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted-foreground sm:justify-start">
                                        {isDone ? <Check className="size-3.5 text-emerald-600" /> : <s.icon className="size-3.5" />}
                                        <span className="hidden sm:inline">{s.label}</span>
                                    </div>
                                    <div className={cn('mt-1 font-mono text-sm font-semibold', !isDone && 'text-muted-foreground')}>
                                        {isDone ? fmtTime(s.value) : skipped ? 'skipped' : isNext ? 'next' : '—'}
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
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
                </p>
            </div>

            <CheckoutRemarkDialog
                open={remarkOpen}
                onOpenChange={setRemarkOpen}
                processing={submitting === 'check_out'}
                onConfirm={(remark) => punch('check_out', remark)}
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
