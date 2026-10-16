import { ArrowLeftRight, Briefcase, CalendarClock, FilePenLine, Hourglass, Palmtree, type LucideIcon } from 'lucide-react';
import type { Paginated, Person } from '../attendance/lib';

export { firstError, fmtDate, fmtHours, fmtTime, fullName, TONE, toTimeInput, weekday, type Paginated, type Person } from '../attendance/lib';

export const REQUESTS_URL = '/employee-management/requests';

export type Kind = 'leave' | 'overtime' | 'correction' | 'official_business' | 'undertime' | 'schedule_change';
export type Status = 'pending' | 'approved' | 'declined' | 'cancelled';
export type View = 'mine' | 'inbox' | 'all' | 'balances';
type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate' | 'blue';

export type Perspective = {
    hasSelf: boolean;
    canApproveLeave: boolean;
    canApproveAttendance: boolean;
    canReview: boolean;
    canViewTeam: boolean;
    canFileLeave: boolean;
    canFileAttendance: boolean;
    canFileOnBehalf: boolean;
};

export type Filters = {
    kind: Kind | '';
    status: Status | 'all';
    employee_id: number | null;
    year: number;
    /** History table: search text, sort column ('' = pending first, newest filed), direction, page size. */
    q: string;
    sort: '' | 'date' | 'filed';
    dir: 'asc' | 'desc';
    per_page: number;
};

export type RequestItem = {
    key: string;
    source: 'leave' | 'attendance';
    kind: Kind;
    id: number;
    status: Status;
    title: string;
    employee: Person | null;
    date_from: string;
    date_to: string;
    reason: string | null;
    filed_at: string;
    filed_by: string | null;
    decided_by: string | null;
    decided_at: string | null;
    remarks: string | null;
    cancellable: boolean;
    details: {
        // leave
        code?: string | null;
        is_paid?: boolean;
        days?: number;
        half_day?: 'am' | 'pm' | null;
        attachment_url?: string | null;
        // day-level requests
        time_in?: string | null;
        break_out?: string | null;
        break_in?: string | null;
        time_out?: string | null;
        ot_hours?: number | null;
        destination?: string | null;
        rest_day?: boolean;
        dtr?: Record<'time_in' | 'break_out' | 'break_in' | 'time_out' | 'ot_hours' | 'ot_hours_approved' | 'scheduled_in' | 'scheduled_out', string | number | null> | null;
    };
};

export type Balance = {
    leave_type_id: number;
    code: string;
    name: string;
    is_paid: boolean;
    balance_tracked: boolean;
    entitled: number;
    used: number;
    reserved: number;
    available: number | null;
    max_days_per_filing: number | null;
    service_note: string | null;
};

export type OutItem = {
    key: string;
    kind: Kind;
    title: string;
    employee: Person;
    date_from: string;
    date_to: string;
    days?: number;
    half_day?: string | null;
    time_from?: string | null;
    time_to?: string | null;
};

/** Employee fields that decide which leave types they can file. */
export type LeaveEligibility = { gender?: string | null; leave_type_ids?: number[] | null };

export type SelfProfile = Person & LeaveEligibility & { balances: Balance[]; upcoming: OutItem[] };

export type TeamOverview = {
    out: OutItem[];
    stats: { oldestPendingDays: number | null; decidedThisMonth: number; leaveDaysThisMonth: number };
};

export type TeamBalanceRow = { employee: Person; balances: Record<string, Balance> };

export type LeaveTypeOption = {
    id: number;
    code: string;
    name: string;
    legal_basis: string | null;
    is_paid: boolean;
    balance_tracked: boolean;
    annual_entitlement: number | null;
    max_days_per_filing: number | null;
    counts_calendar_days: boolean;
    gender: string | null;
    min_service_months: number;
    min_notice_days: number;
    attachment_required_after_days: number | null;
    allow_half_day: boolean;
};

/** Leave types enabled on the employee record (null = all) that also match their gender. */
export function leaveTypesFor(person: LeaveEligibility | null | undefined, types: LeaveTypeOption[]): LeaveTypeOption[] {
    const gender = person?.gender?.toLowerCase();
    return types.filter(
        (t) =>
            (person?.leave_type_ids == null || person.leave_type_ids.includes(t.id)) && (!t.gender || !gender || t.gender.toLowerCase() === gender),
    );
}

export type Badges = { mine: number; inbox: number; inboxByKind: Partial<Record<Kind, number>>; corrections: number };

export type FeedPage = Paginated<RequestItem>;

/** The request catalogue: everything an employee can file, in the order they reach for it. */
export const KINDS: Record<
    Kind,
    { label: string; short: string; icon: LucideIcon; tone: Tone; source: 'leave' | 'attendance'; description: string; when: string }
> = {
    leave: {
        label: 'Leave',
        short: 'Leave',
        icon: Palmtree,
        tone: 'violet',
        source: 'leave',
        description: 'Vacation, sick, emergency and statutory leaves (maternity, paternity, solo parent…).',
        when: 'Before your leave, or right after for sick / emergency',
    },
    overtime: {
        label: 'Overtime',
        short: 'OT',
        icon: Hourglass,
        tone: 'blue',
        source: 'attendance',
        description: 'Get approval before working past your shift. You are paid for the overtime you actually render.',
        when: 'In advance — today or a later day',
    },
    correction: {
        label: 'Time correction',
        short: 'Correction',
        icon: FilePenLine,
        tone: 'sky',
        source: 'attendance',
        description: 'Fix a missed or wrong check-in, break or check-out.',
        when: 'Any day not yet locked by payroll',
    },
    official_business: {
        label: 'Official business',
        short: 'OB',
        icon: Briefcase,
        tone: 'emerald',
        source: 'attendance',
        description: 'A whole day working away from the branch — client visits, suppliers, bank or government errands. No clock-in needed.',
        when: 'Before or after the day',
    },
    undertime: {
        label: 'Undertime',
        short: 'UT',
        icon: CalendarClock,
        tone: 'amber',
        source: 'attendance',
        description: 'Ask to leave before your shift ends. The early hours are still unpaid.',
        when: 'In advance — before you leave',
    },
    schedule_change: {
        label: 'Change of schedule',
        short: 'Schedule',
        icon: ArrowLeftRight,
        tone: 'slate',
        source: 'attendance',
        description: 'Work a different shift on a day, or swap a work day for a rest day.',
        when: 'On or before the day',
    },
};

export const KIND_ORDER: Kind[] = ['leave', 'overtime', 'correction', 'official_business', 'undertime', 'schedule_change'];

/**
 * Kinds kept only so past requests still display. Undertime is detected from the time record and
 * deducted automatically; shifts and rest days are set by HR in the Employee Directory and roster.
 */
export const RETIRED_KINDS: Kind[] = ['undertime', 'schedule_change'];

export const STATUS: Record<Status, { label: string; tone: Tone }> = {
    pending: { label: 'Pending', tone: 'amber' },
    approved: { label: 'Approved', tone: 'emerald' },
    declined: { label: 'Declined', tone: 'rose' },
    cancelled: { label: 'Cancelled', tone: 'slate' },
};

/** Kinds the viewer may file, given their permissions. */
export function fileableKinds(p: Perspective): Kind[] {
    return KIND_ORDER.filter((k) => !RETIRED_KINDS.includes(k) && (KINDS[k].source === 'leave' ? p.canFileLeave : p.canFileAttendance));
}

/** Kinds the viewer may approve here. Time corrections are decided on the day in Time & Attendance › Timesheets. */
export function canDecide(p: Perspective, kind: Kind): boolean {
    if (kind === 'correction') return false;
    return KINDS[kind].source === 'leave' ? p.canApproveLeave : p.canApproveAttendance;
}

export const timeAgo = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    const days = Math.round(mins / 1440);
    return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const fmtDays = (n: number | null | undefined) => {
    const v = Number(n ?? 0);
    return `${Number.isInteger(v) ? v : v.toFixed(1)} day${v === 1 ? '' : 's'}`;
};
