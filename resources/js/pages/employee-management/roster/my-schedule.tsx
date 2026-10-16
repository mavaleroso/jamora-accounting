import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    BellDot,
    Briefcase,
    CalendarClock,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock,
    Coffee,
    Palmtree,
    PartyPopper,
    User,
} from 'lucide-react';
import { fmtDate, fmtMinutes, fmtTime, toIsoDate, TONE, weekday } from '../attendance/lib';
import { REQUESTS_URL } from '../requests/lib';

const ROSTER_URL = '/employee-management/roster';
const breadcrumbs: BreadcrumbItem[] = [{ title: 'My Schedule', href: ROSTER_URL }];

type Day = {
    date: string;
    is_today: boolean;
    is_past: boolean;
    shift_name: string;
    start: string | null;
    end: string | null;
    break_minutes: number;
    grace_minutes: number;
    is_rest_day: boolean;
    source: 'roster' | 'template' | 'default';
    scheduled_minutes: number;
    notes: string | null;
    updated_at: string | null;
    recently_updated: boolean;
    holiday: { name: string; type: string } | null;
    leave: { title: string; half_day: boolean } | null;
    official_business: { destination: string | null; from: string | null; to: string | null } | null;
};

type Summary = { scheduledMinutes: number; workDays: number; restDays: number; leaveDays: number; holidays: number };

type Props = {
    employee: { id: number; employee_code: string; name: string; position: string | null; department: string | null } | null;
    days?: Day[];
    summary?: Summary;
    weekStart: string;
    weekEnd: string;
    today: string;
    lastUpdated?: string | null;
    recentlyUpdated?: boolean;
    can: { fileLeave: boolean; fileAttendance: boolean };
};

const shiftWeek = (weekStart: string, weeks: number) => {
    const [y, m, d] = weekStart.split('-').map(Number);
    return toIsoDate(new Date(y, m - 1, d + weeks * 7));
};

const goToWeek = (weekStart?: string) => router.get(ROSTER_URL, weekStart ? { week_start: weekStart } : {}, { preserveScroll: true });

const fmtUpdated = (iso: string) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const fmtWeekRange = (from: string, to: string) =>
    `${fmtDate(from, { month: 'short', day: 'numeric' })} – ${fmtDate(to, { month: 'short', day: 'numeric', year: 'numeric' })}`;

const HOLIDAY_LABEL: Record<string, string> = { regular: 'Regular holiday', special: 'Special holiday' };

export default function MySchedulePage({ employee, days = [], summary, weekStart, weekEnd, today, lastUpdated, recentlyUpdated, can }: Props) {
    const { auth } = usePage<SharedData>().props;

    if (!employee) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="My Schedule" />
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="bg-card max-w-md rounded-xl border p-6 text-center shadow-sm">
                        <User className="text-muted-foreground mx-auto mb-3 size-10" />
                        <h2 className="text-lg font-semibold">No schedule to show</h2>
                        <p className="text-muted-foreground mt-1 text-sm">
                            Your schedule appears here once an employee record in this branch is linked to your account
                            {auth.user.email ? ` (records are matched to your account or to ${auth.user.email})` : ''}. Ask HR to link it.
                        </p>
                    </div>
                </div>
            </AppLayout>
        );
    }

    const isCurrentWeek = weekStart <= today && today <= weekEnd;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="My Schedule" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <Heading title="My Schedule" description={[employee.name, employee.position, employee.department].filter(Boolean).join(' · ')} />
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            title="Previous week"
                            aria-label="Previous week"
                            onClick={() => goToWeek(shiftWeek(weekStart, -1))}
                        >
                            <ChevronLeft className="size-4" />
                        </Button>
                        <div className="min-w-44 text-center text-sm font-semibold tabular-nums">{fmtWeekRange(weekStart, weekEnd)}</div>
                        <Button
                            variant="outline"
                            size="icon"
                            title="Next week"
                            aria-label="Next week"
                            onClick={() => goToWeek(shiftWeek(weekStart, 1))}
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={isCurrentWeek} onClick={() => goToWeek()}>
                            This week
                        </Button>
                    </div>
                </div>

                {recentlyUpdated && lastUpdated && (
                    <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', TONE.amber)}>
                        <BellDot className="mt-0.5 size-4 shrink-0" />
                        <p>
                            <span className="font-semibold">Your schedule for this week was updated</span> on {fmtUpdated(lastUpdated)}. Days marked{' '}
                            <span className="font-semibold">Updated</span> were changed or newly published. Check them before your next shift.
                        </p>
                    </div>
                )}

                {summary && (
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Stat icon={Clock} label="Scheduled hours" value={fmtMinutes(summary.scheduledMinutes)} hint="Excluding breaks and leave" />
                        <Stat icon={Briefcase} label="Work days" value={String(summary.workDays)} />
                        <Stat icon={Coffee} label="Rest days" value={String(summary.restDays)} />
                        <Stat
                            icon={Palmtree}
                            label="Leave days"
                            value={String(summary.leaveDays)}
                            hint={summary.holidays ? `${summary.holidays} holiday${summary.holidays > 1 ? 's' : ''} this week` : undefined}
                        />
                    </div>
                )}

                <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
                    <header className="flex items-center gap-2 border-b px-4 py-3">
                        <CalendarDays className="text-muted-foreground size-4" />
                        <h2 className="text-sm font-semibold">Week of {fmtDate(weekStart, { month: 'long', day: 'numeric' })}</h2>
                    </header>
                    <ol className="divide-y">
                        {days.map((day) => (
                            <DayRow key={day.date} day={day} can={can} />
                        ))}
                    </ol>
                </section>

                <p className="text-muted-foreground text-xs">
                    Only published shifts are shown. Days without a published shift follow your usual schedule. Need a different shift or rest day?
                    Ask HR to update it.
                </p>
            </div>
        </AppLayout>
    );
}

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Clock; label: string; value: string; hint?: string }) {
    return (
        <div className="bg-card rounded-xl border p-4 shadow-sm">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Icon className="size-3.5" /> {label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            {hint && <p className="text-muted-foreground mt-0.5 text-[11px]">{hint}</p>}
        </div>
    );
}

function DayRow({ day, can }: { day: Day; can: Props['can'] }) {
    const offAllDay = (!!day.leave && !day.leave.half_day) || day.is_rest_day;
    const hasShift = !day.is_rest_day && !!day.start;

    let headline: string;
    if (day.leave && !day.leave.half_day) headline = day.leave.title;
    else if (day.is_rest_day) headline = 'Rest day';
    else if (hasShift) headline = `${fmtTime(day.start)} – ${fmtTime(day.end)}`;
    else headline = day.shift_name;

    const canAct = !day.is_past;
    const requestHref = (kind: string) => `${REQUESTS_URL}?file=${kind}&date=${day.date}`;

    return (
        <li
            className={cn('flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center', day.is_today && 'bg-primary/5', day.is_past && 'opacity-70')}
        >
            <div className="flex w-16 shrink-0 items-baseline gap-1.5 sm:flex-col sm:items-start sm:gap-0">
                <span className={cn('text-[11px] font-semibold tracking-wide uppercase', day.is_today ? 'text-primary' : 'text-muted-foreground')}>
                    {day.is_today ? 'Today' : weekday(day.date)}
                </span>
                <span className="text-xl leading-tight font-semibold tabular-nums">{fmtDate(day.date, { day: 'numeric' })}</span>
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-base font-semibold', offAllDay && 'text-muted-foreground')}>{headline}</p>
                    {day.recently_updated && (
                        <Badge variant="outline" className={cn('gap-1', TONE.amber)}>
                            <BellDot className="size-3" /> Updated
                        </Badge>
                    )}
                    {day.leave && (
                        <Badge variant="outline" className={TONE.violet}>
                            {day.leave.half_day ? `${day.leave.title} · half day` : 'On leave'}
                        </Badge>
                    )}
                    {day.holiday && (
                        <Badge variant="outline" className={cn('gap-1', TONE.sky)}>
                            <PartyPopper className="size-3" /> {HOLIDAY_LABEL[day.holiday.type] ?? 'Holiday'}
                        </Badge>
                    )}
                    {day.official_business && (
                        <Badge variant="outline" className={TONE.emerald}>
                            Official business
                        </Badge>
                    )}
                </div>

                <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                    {hasShift && !(day.leave && !day.leave.half_day) && (
                        <>
                            <span>{day.shift_name}</span>
                            {day.break_minutes > 0 && <span>{fmtMinutes(day.break_minutes)} break</span>}
                            {day.grace_minutes > 0 && <span>{day.grace_minutes} min grace</span>}
                            {day.scheduled_minutes > 0 && <span>{fmtMinutes(day.scheduled_minutes)} scheduled</span>}
                        </>
                    )}
                    {day.holiday && <span>{day.holiday.name}</span>}
                    {day.official_business && (
                        <span>
                            OB{day.official_business.destination && ` · ${day.official_business.destination}`}
                            {day.official_business.from && ` · ${fmtTime(day.official_business.from)} – ${fmtTime(day.official_business.to)}`}
                        </span>
                    )}
                    {day.updated_at && day.recently_updated && <span>Published {fmtUpdated(day.updated_at)}</span>}
                </div>
                {day.notes && <p className="bg-muted/60 mt-1.5 rounded-md px-2 py-1 text-xs">{day.notes}</p>}
            </div>

            {canAct && can.fileLeave && !day.leave && !day.is_rest_day && (
                <div className="flex shrink-0 gap-2 sm:justify-end">
                    <Button variant="outline" size="sm" asChild>
                        <Link href={requestHref('leave')}>
                            <CalendarClock className="size-3.5" /> File leave
                        </Link>
                    </Button>
                </div>
            )}
        </li>
    );
}
