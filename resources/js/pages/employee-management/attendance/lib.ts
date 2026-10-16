export type Person = {
    id: number;
    employee_code: string;
    firstname: string;
    lastname: string;
    name?: string;
    position?: string | null;
    department?: string | null;
    biometric_id?: string | null;
    avatar_url?: string | null;
};

export type DtrRow = {
    id: number;
    employee_id: number;
    work_date: string;
    scheduled_in: string | null;
    scheduled_out: string | null;
    time_in: string | null;
    break_out: string | null;
    break_in: string | null;
    time_out: string | null;
    regular_hours: string | number;
    ot_hours: string | number;
    ot_hours_approved: string | number;
    /** A pending OT pre-approval exists for this day (payable OT comes only from approved requests). */
    ot_request_pending?: boolean;
    tardiness_minutes: string | number;
    undertime_minutes: string | number;
    night_diff_hours: string | number;
    day_type: string;
    attendance_status: string;
    is_absent: boolean;
    distance_meters?: string | number | null;
    location_status?: string | null;
    source?: string | null;
    status: 'open' | 'approved' | 'rejected' | 'locked';
    approved_at?: string | null;
    approver?: { id: number; firstname: string; lastname: string } | null;
    notes?: string | null;
    /** What the employee got done, entered at check-out. */
    accomplishment?: string | null;
    employee?: Person;
    /** Employee-filed time correction waiting on this day; approving the day applies it. */
    pending_correction?: PendingCorrection | null;
};

export type PendingCorrection = {
    id: number;
    requested_time_in: string | null;
    requested_break_out: string | null;
    requested_break_in: string | null;
    requested_time_out: string | null;
    reason: string;
    created_at: string;
};

/** Hours per staff for the selected period (rejected days excluded, OT = approved OT only). */
export type SummaryRow = {
    employee: Person;
    days_worked: number;
    regular_hours: number;
    ot_hours: number;
    total_hours: number;
    pending: number;
    /** Open days bulk approval can take (no missing punch). */
    ready: number;
    approved: number;
    locked: number;
    rejected: number;
    /** Approved leave days in the period (paid time off). */
    leave_days: number;
};

export type PayPeriodOption = { id: number; code: string; from: string; to: string };

export type AttendanceRequestRow = {
    id: number;
    employee_id: number;
    request_type: 'correction' | 'overtime' | 'official_business' | 'undertime' | 'schedule_change';
    work_date: string;
    requested_time_in: string | null;
    requested_break_out: string | null;
    requested_break_in: string | null;
    requested_time_out: string | null;
    requested_ot_hours: string | number | null;
    destination?: string | null;
    requested_rest_day?: boolean;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    review_remarks?: string | null;
    reviewed_at?: string | null;
    created_at: string;
    employee?: Person;
    dtr_entry?: DtrRow | null;
    reviewer?: { firstname: string; lastname: string } | null;
    filer?: { firstname: string; lastname: string } | null;
};

export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    from: number | null;
    to: number | null;
    prev_page_url: string | null;
    next_page_url: string | null;
};

export type BoardStatus = 'late' | 'expected' | 'working' | 'on_break' | 'official_business' | 'done' | 'absent' | 'on_leave' | 'holiday' | 'rest_day';

export type BoardRow = {
    employee: Person;
    status: BoardStatus;
    late_by: number | null;
    tardiness_minutes: number;
    schedule: { shift_name: string; start: string | null; end: string | null; source: string };
    leave: string | null;
    /** Destination when on approved official business today. */
    official_business?: string | null;
    dtr: Pick<DtrRow, 'id' | 'time_in' | 'break_out' | 'break_in' | 'time_out' | 'location_status' | 'distance_meters' | 'status'> | null;
};

export type Board = {
    rows: BoardRow[];
    counts: Partial<Record<BoardStatus, number>>;
    holiday: string | null;
    generated_at: string;
};

export type MyDay = {
    employee: Person;
    schedule: {
        shift_name: string;
        start: string | null;
        end: string | null;
        break_minutes: number;
        grace_minutes: number;
        is_rest_day: boolean;
        source: string;
    };
    holiday: { name: string; type: string } | null;
    officialBusiness?: { destination: string | null } | null;
    today: DtrRow | null;
    week: {
        date: string;
        is_rest_day: boolean;
        entry: Pick<DtrRow, 'id' | 'time_in' | 'time_out' | 'regular_hours' | 'ot_hours' | 'tardiness_minutes' | 'attendance_status' | 'status'> | null;
    }[];
    weekTotals: { regular_hours: number; ot_hours: number; tardiness_minutes: number };
    pendingRequests: number;
};

/** One day in the employee's accomplishment report. */
export type AccomplishmentRow = {
    date: string;
    dtr_id: number | null;
    time_in: string | null;
    break_out: string | null;
    break_in: string | null;
    time_out: string | null;
    regular_hours: number | null;
    ot_hours_approved: number | null;
    tardiness_minutes: number;
    undertime_minutes: number;
    status: DtrRow['status'] | null;
    attendance_status: string | null;
    accomplishment: string | null;
    /** Destination ('' when none given) on an approved official business day, otherwise null. */
    official_business: string | null;
    editable: boolean;
    locked_reason: string | null;
};

export type Accomplishments = {
    rows: AccomplishmentRow[];
    /** Days that can be written or changed: the current pay period, up to today. */
    window: { from: string; to: string };
    missing: number;
};

export type BranchLocation = {
    id?: number;
    name: string;
    latitude: number;
    longitude: number;
    geofence_radius: number;
    geofence_enforced: boolean;
};

export type Perspective = { canManage: boolean; canViewTeam: boolean; hasSelf: boolean };

export type Filters = {
    employee_id: number | null;
    date_from: string;
    date_to: string;
    status: string;
    request_status: string;
};

export type Approval = { open: number; approved: number; rejected: number; locked: number; readyToApprove: number; corrections: number };

export const ATTENDANCE_URL = '/employee-management/attendance';

/** "13:05:00" → "1:05 PM" */
export function fmtTime(value?: string | null): string {
    if (!value) return '—';
    const [h, m] = value.split(':').map(Number);
    if (Number.isNaN(h)) return '—';
    return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "13:05:00" → "13:05" for <input type="time"> */
export const toTimeInput = (value?: string | null) => (value ? value.slice(0, 5) : '');

const parseLocalDate = (value: string) => {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
};

export const toIsoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function fmtDate(value: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
    return parseLocalDate(value).toLocaleDateString('en-PH', opts);
}

export const weekday = (value: string, style: 'short' | 'long' = 'short') =>
    parseLocalDate(value).toLocaleDateString('en-PH', { weekday: style });

/** 75 → "1h 15m" */
export function fmtMinutes(minutes: number | string | null | undefined): string {
    const m = Math.round(Number(minutes ?? 0));
    if (m <= 0) return '0m';
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
}

export const fmtHours = (value: number | string | null | undefined) => {
    const n = Number(value ?? 0);
    return `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '')}h`;
};

export const fullName = (p?: Pick<Person, 'name' | 'firstname' | 'lastname'> | null) =>
    p ? (p.name ?? `${p.firstname} ${p.lastname}`) : '—';

type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate' | 'blue';

export const TONE: Record<Tone, string> = {
    emerald: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    amber: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    rose: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
    sky: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
    violet: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
    blue: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
    slate: 'border-border bg-muted text-muted-foreground',
};

export const DOT: Record<Tone, string> = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    sky: 'bg-sky-500',
    violet: 'bg-violet-500',
    blue: 'bg-blue-500',
    slate: 'bg-muted-foreground/40',
};

export const BOARD_STATUS: Record<BoardStatus, { label: string; tone: Tone; hint: string }> = {
    late: { label: 'Late — not in', tone: 'rose', hint: 'Past shift start + grace, no check-in' },
    expected: { label: 'Expected', tone: 'slate', hint: 'Shift has not started yet' },
    working: { label: 'Working', tone: 'emerald', hint: 'Checked in' },
    on_break: { label: 'On break', tone: 'amber', hint: 'Break started, not back yet' },
    official_business: { label: 'Official business', tone: 'emerald', hint: 'Working off-site all day; no clock-in needed' },
    done: { label: 'Done', tone: 'blue', hint: 'Checked out' },
    absent: { label: 'Absent', tone: 'rose', hint: 'Marked absent by daily close' },
    on_leave: { label: 'On leave', tone: 'violet', hint: 'Approved leave today' },
    holiday: { label: 'Holiday', tone: 'sky', hint: 'Holiday, not scheduled' },
    rest_day: { label: 'Rest day', tone: 'slate', hint: 'Scheduled day off' },
};

export const ATTENDANCE_STATUS: Record<string, { label: string; tone: Tone }> = {
    present: { label: 'Present', tone: 'emerald' },
    late: { label: 'Late', tone: 'amber' },
    undertime: { label: 'Undertime', tone: 'amber' },
    absent: { label: 'Absent', tone: 'rose' },
    on_leave: { label: 'On leave', tone: 'violet' },
    rest_day: { label: 'Rest day', tone: 'slate' },
    holiday: { label: 'Holiday', tone: 'sky' },
    incomplete: { label: 'Missing punch', tone: 'rose' },
};

export const RECORD_STATUS: Record<string, { label: string; tone: Tone }> = {
    open: { label: 'Pending', tone: 'amber' },
    approved: { label: 'Approved', tone: 'emerald' },
    rejected: { label: 'Rejected', tone: 'rose' },
    locked: { label: 'Locked', tone: 'slate' },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
    pending: { label: 'Pending', tone: 'amber' },
    approved: { label: 'Approved', tone: 'emerald' },
    rejected: { label: 'Rejected', tone: 'rose' },
    cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const DAY_TYPE: Record<string, string> = {
    regular: 'Regular day',
    rest_day: 'Rest day',
    special_holiday: 'Special holiday',
    special_holiday_rest_day: 'Special holiday + rest day',
    regular_holiday: 'Regular holiday',
    regular_holiday_rest_day: 'Regular holiday + rest day',
};

const fmtRange = (from: string, to: string) => {
    const a = parseLocalDate(from);
    const b = parseLocalDate(to);
    const month = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short' });
    const tail = b.getFullYear() !== new Date().getFullYear() ? `, ${b.getFullYear()}` : '';
    return a.getMonth() === b.getMonth() ? `${month(a)} ${a.getDate()}–${b.getDate()}${tail}` : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}${tail}`;
};

/**
 * Pay periods to pick from, newest first. Uses the periods set up in Payroll (1–15 / 16–end by
 * default, or custom cut-offs); falls back to the calendar halves when none are set up yet.
 */
export function periodOptions(periods: PayPeriodOption[], today: string) {
    if (periods.length > 0) {
        return periods.map((p) => ({ id: `pp-${p.id}`, label: fmtRange(p.from, p.to), from: p.from, to: p.to, current: p.from <= today && p.to >= today }));
    }

    const t = parseLocalDate(today);
    const offset = t.getDate() <= 15 ? 1 : 0; // start from the half that contains today
    const halves = Array.from({ length: 6 }, (_, i) => {
        const n = i + offset;
        const m = new Date(t.getFullYear(), t.getMonth() - Math.floor(n / 2), 1);
        return n % 2 === 0
            ? { from: toIsoDate(new Date(m.getFullYear(), m.getMonth(), 16)), to: toIsoDate(new Date(m.getFullYear(), m.getMonth() + 1, 0)) }
            : { from: toIsoDate(m), to: toIsoDate(new Date(m.getFullYear(), m.getMonth(), 15)) };
    });

    return halves.map((h) => ({ id: h.from, label: fmtRange(h.from, h.to), from: h.from, to: h.to, current: h.from <= today && h.to >= today }));
}

/** Visible text of saved rich text, for previews and tooltips. */
export function htmlToText(html?: string | null): string {
    if (!html) return '';
    return html
        .replace(/<(br|\/p|\/li)\b[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

export const firstError = (errors: Record<string, string>) => Object.values(errors)[0] ?? 'Something went wrong.';
