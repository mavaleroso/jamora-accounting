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
    /** A pending OT request exists for this day (payable OT comes only from approved requests). */
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
    status: 'open' | 'approved' | 'locked';
    approved_at?: string | null;
    approver?: { id: number; firstname: string; lastname: string } | null;
    notes?: string | null;
    employee?: Person;
};

export type AttendanceRequestRow = {
    id: number;
    employee_id: number;
    request_type: 'correction' | 'overtime';
    work_date: string;
    requested_time_in: string | null;
    requested_break_out: string | null;
    requested_break_in: string | null;
    requested_time_out: string | null;
    requested_ot_hours: string | number | null;
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

export type BoardStatus = 'late' | 'expected' | 'working' | 'on_break' | 'done' | 'absent' | 'on_leave' | 'holiday' | 'rest_day';

export type BoardRow = {
    employee: Person;
    status: BoardStatus;
    late_by: number | null;
    tardiness_minutes: number;
    schedule: { shift_name: string; start: string | null; end: string | null; source: string };
    leave: string | null;
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
    today: DtrRow | null;
    week: {
        date: string;
        is_rest_day: boolean;
        entry: Pick<DtrRow, 'id' | 'time_in' | 'time_out' | 'regular_hours' | 'ot_hours' | 'tardiness_minutes' | 'attendance_status' | 'status'> | null;
    }[];
    weekTotals: { regular_hours: number; ot_hours: number; tardiness_minutes: number };
    pendingRequests: number;
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
    exceptions_only: boolean;
    request_status: string;
};

export type Kpis = {
    regularHours: number;
    otRendered: number;
    otApproved: number;
    tardinessMinutes: number;
    undertimeMinutes: number;
    lateDays: number;
    absences: number;
    incomplete: number;
    exceptions: number;
    daysWorked: number;
};

export type Approval = { open: number; approved: number; locked: number; readyToApprove: number };

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
    open: { label: 'For review', tone: 'amber' },
    approved: { label: 'Approved', tone: 'emerald' },
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

/** What a record still needs, in plain words — drives the "Issues" column. */
export function recordIssues(row: DtrRow): string[] {
    const issues: string[] = [];
    if (row.attendance_status === 'incomplete') issues.push(!row.time_in ? 'No check-in' : 'No check-out');
    if (row.is_absent) issues.push('Absent');
    if (Number(row.tardiness_minutes) > 0) issues.push(`Late ${fmtMinutes(row.tardiness_minutes)}`);
    if (Number(row.undertime_minutes) > 0) issues.push(`Undertime ${fmtMinutes(row.undertime_minutes)}`);
    const unpaidOt = Number(row.ot_hours) - Number(row.ot_hours_approved);
    if (unpaidOt > 0) issues.push(`OT ${fmtHours(unpaidOt)} ${row.ot_request_pending ? 'request pending' : 'no request'}`);
    if (row.location_status === 'out_of_bounds') issues.push('Outside geofence');
    return issues;
}

export function periodPresets(today: string) {
    const t = parseLocalDate(today);
    const day = (t.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(t);
    monday.setDate(t.getDate() - day);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const lastMonday = new Date(monday);
    lastMonday.setDate(monday.getDate() - 7);
    const lastSunday = new Date(monday);
    lastSunday.setDate(monday.getDate() - 1);
    const monthStart = new Date(t.getFullYear(), t.getMonth(), 1);
    const monthEnd = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    // PH semi-monthly payroll cut-offs: 1–15 and 16–end of month
    const cutStart = t.getDate() <= 15 ? monthStart : new Date(t.getFullYear(), t.getMonth(), 16);
    const cutEnd = t.getDate() <= 15 ? new Date(t.getFullYear(), t.getMonth(), 15) : monthEnd;

    return [
        { id: 'today', label: 'Today', from: today, to: today },
        { id: 'week', label: 'This week', from: toIsoDate(monday), to: toIsoDate(sunday) },
        { id: 'last_week', label: 'Last week', from: toIsoDate(lastMonday), to: toIsoDate(lastSunday) },
        { id: 'cutoff', label: 'This cut-off', from: toIsoDate(cutStart), to: toIsoDate(cutEnd) },
        { id: 'month', label: 'This month', from: toIsoDate(monthStart), to: toIsoDate(monthEnd) },
    ];
}

export const firstError = (errors: Record<string, string>) => Object.values(errors)[0] ?? 'Something went wrong.';
