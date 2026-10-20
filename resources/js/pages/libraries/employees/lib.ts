import { formatPhpCurrency } from '@/lib/currency';

/** A company (branch / entity) the user can open. */
export type Company = { id: number; code: string; name: string };

const COMPANY_DOTS = ['bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500'];

/** A stable colour per company, by its place in the list of companies. */
export const companyDot = (companies: Company[], id?: number | null) => {
    const i = companies.findIndex((c) => c.id === id);
    return i < 0 ? 'bg-muted-foreground' : COMPANY_DOTS[i % COMPANY_DOTS.length];
};

export type ShiftTemplate = {
    id: number;
    /** The company it belongs to; null = shared by every company. */
    entity_id?: number | null;
    code: string;
    name: string;
    start_time: string;
    end_time: string;
    break_minutes?: number;
    color?: string | null;
};

export type Employee = {
    id: number;
    /** The company (employer) the employee belongs to. */
    entity_id: number;
    entity?: Company | null;
    user_id?: number | null;
    employee_code: string;
    firstname: string;
    middlename?: string | null;
    lastname: string;
    name?: string;
    avatar?: string | null;
    avatar_url?: string | null;
    gender?: string | null;
    civil_status?: string | null;
    birth_date?: string | null;
    position?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null;
    emergency_contact_phone?: string | null;
    dependents?: number | null;
    default_shift_template_id?: number | null;
    default_shift_template?: ShiftTemplate | null;
    rest_days?: number[] | null;
    /** When the employee's unpaid break starts (HH:MM:SS); its length comes from the shift. Null = no preset. */
    break_start?: string | null;
    /** Leave types the employee may file; null = all. */
    leave_type_ids?: number[] | null;
    hire_date?: string | null;
    regularization_date?: string | null;
    separation_date?: string | null;
    employment_status: string;
    employment_type?: string | null;
    pay_type: string;
    basic_pay: string | number;
    vacation_leave_credits?: string | number | null;
    sick_leave_credits?: string | number | null;
    sss_number?: string | null;
    philhealth_number?: string | null;
    pagibig_number?: string | null;
    tin?: string | null;
    bank_name?: string | null;
    bank_account_name?: string | null;
    bank_account_no?: string | null;
    /** The payroll bank: a registered bank account of the employee's company, from which pay is released. */
    charge_bank_account_id?: number | null;
    charge_bank_account?: CompanyBank | null;
    is_active: boolean;
    /** How SSS / PhilHealth / Pag-IBIG are deducted; a missing agency (or null) = automatic. */
    contribution_settings?: Partial<Record<ContributionAgency, ContributionSetting>> | null;
    /** The login linked to this employee (every new employee gets one). */
    user?: { id: number; username: string | null; email: string | null; status: boolean; roles?: { id: number; name: string }[] } | null;
};

/** A bank account registered for a company (Banks), from which payroll is released. */
export type CompanyBank = { id: number; entity_id: number; name: string; bank_name: string | null; account_number: string | null };

/** "Payroll Account · BDO ••1234" */
export const bankLabel = (b: Pick<CompanyBank, 'name' | 'bank_name' | 'account_number'>) =>
    [b.name, [b.bank_name, b.account_number ? `••${b.account_number.slice(-4)}` : null].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

/** A user who can be linked to a new employee, and the companies where they already are one. */
export type LinkableUser = {
    id: number;
    name: string;
    username: string | null;
    email: string | null;
    role: string | null;
    employee_entity_ids?: number[];
};

export type LeaveTypeOption = {
    id: number;
    code: string;
    name: string;
    legal_basis: string | null;
    is_paid: boolean;
    gender: string | null;
};

/** "All leave types" / "VL, SL, EL" / "None" for an employee's leave type setting. */
export function leaveTypesLabel(ids: number[] | null | undefined, types: LeaveTypeOption[]): string {
    if (ids == null) return 'All leave types';
    const picked = types.filter((t) => ids.includes(t.id));
    if (picked.length === 0) return 'None';
    if (picked.length === types.length) return 'All leave types';
    return picked.map((t) => t.code).join(', ');
}

/** The shift an employee normally works, as far as breaks are concerned. */
export type RegularShift = { name?: string; start: string; end: string; break_minutes: number };

/** A co-worker's preset break on their regular shift. Co-workers may share the same break time. */
export type BreakSlot = { id: number; entity_id: number; name: string; break_start: string; break_end: string };

export type Policy = {
    daysPerYear: number;
    hoursPerDay: number;
    defaultRestDays: number[];
    /** The shift every employee of the current company works unless rostered otherwise (Libraries › Shifts). */
    defaultShift?: RegularShift;
    /** Each company's default shift, by company id: an employee works their own company's. */
    defaultShifts?: Record<number, RegularShift>;
    /** Every preset break lasts exactly this long (company policy: one hour). */
    presetBreakMinutes?: number;
    statutory?: StatutoryTables;
};

/** Monthly contribution tables from config/people.php (statutory). */
export type StatutoryTables = {
    sss: {
        rate_employee: number;
        rate_employer: number;
        msc_min: number;
        msc_max: number;
        msc_step: number;
        ec_low: number;
        ec_high: number;
        ec_threshold: number;
    };
    philhealth: { rate: number; floor: number; ceiling: number };
    pagibig: { rate_employee: number; rate_employee_low: number; low_threshold: number; rate_employer: number; max_fund_salary: number };
};

export type ContributionAgency = 'sss' | 'philhealth' | 'pagibig';
/** auto = deducted, computed from the contribution table on the salary; none = not deducted. */
export type ContributionMode = 'auto' | 'none';
export type ContributionSetting = { mode: ContributionMode | string };

export const CONTRIBUTION_MODES: { value: ContributionMode; label: string }[] = [
    { value: 'auto', label: 'Automatic' },
    { value: 'none', label: 'Not deducted' },
];

export const CONTRIBUTIONS: {
    key: ContributionAgency;
    label: string;
    agency: string;
    idField: 'sss_number' | 'philhealth_number' | 'pagibig_number';
    idLabel: string;
    idPlaceholder: string;
}[] = [
    {
        key: 'sss',
        label: 'SSS',
        agency: 'Social Security System',
        idField: 'sss_number',
        idLabel: 'SSS number',
        idPlaceholder: '00-0000000-0',
    },
    {
        key: 'philhealth',
        label: 'PhilHealth',
        agency: 'Philippine Health Insurance',
        idField: 'philhealth_number',
        idLabel: 'PhilHealth number (PIN)',
        idPlaceholder: '00-000000000-0',
    },
    {
        key: 'pagibig',
        label: 'Pag-IBIG',
        agency: 'Home Development Mutual Fund',
        idField: 'pagibig_number',
        idLabel: 'Pag-IBIG MID number',
        idPlaceholder: '0000-0000-0000',
    },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Monthly SSS / PhilHealth / Pag-IBIG from the tables, as payroll computes them automatically
 * (App\Services\People\BenefitCalculator). SSS employer share excludes EC.
 */
export function statutoryEstimate(monthly: number, t: StatutoryTables) {
    const s = t.sss;
    const msc = Math.max(s.msc_min, Math.min(s.msc_max, Math.round(monthly / s.msc_step) * s.msc_step));
    const ec = msc < s.ec_threshold ? s.ec_low : s.ec_high;
    const phBase = Math.max(t.philhealth.floor, Math.min(t.philhealth.ceiling, monthly));
    const phTotal = round2(phBase * t.philhealth.rate);
    const phEe = round2(phTotal / 2);
    const h = t.pagibig;
    const hBase = Math.min(h.max_fund_salary, monthly);
    return {
        sss: { employee: round2(msc * s.rate_employee), employer: round2(msc * s.rate_employer), ec, msc },
        philhealth: { employee: phEe, employer: round2(phTotal - phEe) },
        pagibig: {
            employee: round2(hBase * (monthly <= h.low_threshold ? h.rate_employee_low : h.rate_employee)),
            employer: round2(hBase * h.rate_employer),
        },
    };
}

export const PRESET_POSITIONS = [
    'Lead Optometrist',
    'Consultant Optometrist',
    'Optical Technician & Edger',
    'Branch Manager',
    'Senior Optical Stylist',
    'Sales Associate & Dispenser',
    'Front Desk Receptionist',
    'Finance & Accounting Officer',
    'Inventory & Billing Clerk',
];

export const EMERGENCY_RELATIONSHIPS = ['Mother', 'Father', 'Spouse', 'Partner', 'Sibling', 'Child', 'Relative', 'Friend'];

/** No one younger may be employed (RA 9231). */
export const MIN_WORKING_AGE = 15;

export const EMPLOYMENT_STATUSES = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'separated', label: 'Separated' },
];

export const EMPLOYMENT_TYPES = [
    { value: 'probationary', label: 'Probationary' },
    { value: 'regular', label: 'Regular' },
    { value: 'contractual', label: 'Contractual' },
    { value: 'project', label: 'Project-based' },
    { value: 'seasonal', label: 'Seasonal' },
];

export const CIVIL_STATUSES = [
    { value: 'single', label: 'Single' },
    { value: 'married', label: 'Married' },
    { value: 'widowed', label: 'Widowed' },
    { value: 'separated', label: 'Legally separated' },
    { value: 'solo_parent', label: 'Solo parent' },
];

export const PAY_TYPES = [
    { value: 'monthly', label: 'Monthly', unit: '/mo' },
    { value: 'daily', label: 'Daily', unit: '/day' },
    { value: 'hourly', label: 'Hourly', unit: '/hr' },
];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Art. 296 Labor Code: probationary employment shall not exceed six (6) months. */
export const PROBATION_MONTHS = 6;

export const STATUTORY_FIELDS = [
    { key: 'sss_number', label: 'SSS' },
    { key: 'philhealth_number', label: 'PhilHealth' },
    { key: 'pagibig_number', label: 'Pag-IBIG' },
    { key: 'tin', label: 'TIN' },
] as const;

export const labelOf = (list: { value: string; label: string }[], value?: string | null) =>
    list.find((o) => o.value === value)?.label ?? (value ? value.replace(/_/g, ' ') : '—');

export const fullName = (e: Pick<Employee, 'name' | 'firstname' | 'lastname'>) => e.name ?? `${e.firstname} ${e.lastname}`;

/** "2026-01-15T00:00:00.000000Z" → "2026-01-15" */
export const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

const parseDate = (value?: string | null) => {
    const v = toDateInput(value);
    if (!v) return null;
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, m - 1, d);
};

export const formatDate = (value?: string | null) => {
    const d = parseDate(value);
    return d ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
};

/** Age in whole years today, or null without a birth date. */
export const age = (birthDate?: string | null) => {
    const b = parseDate(birthDate);
    if (!b) return null;
    const now = new Date();
    const hadBirthday = now.getMonth() > b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() >= b.getDate());
    return now.getFullYear() - b.getFullYear() - (hadBirthday ? 0 : 1);
};

export const addMonths = (value: string | null | undefined, months: number) => {
    const d = parseDate(value);
    if (!d) return null;
    d.setMonth(d.getMonth() + months);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Length of service, e.g. "2y 3m", up to the separation date when present. */
export const tenure = (hire?: string | null, until?: string | null) => {
    const start = parseDate(hire);
    if (!start) return null;
    const end = parseDate(until) ?? new Date();
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (end.getDate() < start.getDate()) months -= 1;
    if (months < 0) return 'Starts soon';
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0 && m === 0) return '< 1m';
    return [y ? `${y}y` : '', m ? `${m}m` : ''].filter(Boolean).join(' ');
};

export const formatTime = (value?: string | null) => {
    if (!value) return '';
    const [h, m] = value.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
};

export const shiftRange = (t?: Pick<ShiftTemplate, 'start_time' | 'end_time'> | null) =>
    t ? `${formatTime(t.start_time)} – ${formatTime(t.end_time)}` : '';

/**
 * The employee's regular shift (their default template, else the company default) with the length of a preset break
 * on it: always exactly `presetBreakMinutes` (one hour), or 0 when the shift has no break.
 */
export const regularShift = (template: ShiftTemplate | null | undefined, policy: Policy): RegularShift | null => {
    const shift = template
        ? { start: template.start_time, end: template.end_time, break_minutes: template.break_minutes ?? 60 }
        : (policy.defaultShift ?? null);
    return shift && { ...shift, break_minutes: shift.break_minutes > 0 ? (policy.presetBreakMinutes ?? 60) : 0 };
};

const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + (m || 0);
};

const toClock = (minutes: number) => {
    const m = ((minutes % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * The break window [start, end] (HH:MM) when a break starting at `breakStart` lies wholly within the shift, else
 * null. Mirrors App\Services\People\WorkSchedule::fitBreak.
 */
export function fitBreak(breakStart: string | null | undefined, shift: RegularShift | null): [string, string] | null {
    if (!breakStart || !shift || shift.break_minutes <= 0) return null;
    const start = toMinutes(shift.start);
    let end = toMinutes(shift.end);
    if (end <= start) end += 1440;
    let from = toMinutes(breakStart);
    if (from < start) from += 1440;
    const to = from + shift.break_minutes;
    return to <= end ? [toClock(from), toClock(to)] : null;
}

/** Break start times that fit the shift, every `step` minutes from the shift start. */
export function breakStartOptions(shift: RegularShift | null, step = 30): string[] {
    if (!shift || shift.break_minutes <= 0) return [];
    const start = toMinutes(shift.start);
    let end = toMinutes(shift.end);
    if (end <= start) end += 1440;
    const options: string[] = [];
    for (let t = start; t + shift.break_minutes <= end; t += step) options.push(toClock(t));
    return options;
}

/** Whether two windows (HH:MM, possibly past midnight) share any minute. */
export function windowsOverlap(a: [string, string], b: [string, string]): boolean {
    const span = ([s, e]: [string, string]) => {
        const from = toMinutes(s);
        let to = toMinutes(e);
        if (to <= from) to += 1440;
        return [from, to] as const;
    };
    const [as, ae] = span(a);
    const [bs, be] = span(b);
    // Compare on the same day and shifted by a day, for windows either side of midnight.
    return [-1440, 0, 1440].some((shift) => as < be + shift && bs + shift < ae);
}

export const breakRange = (window: [string, string] | null) => (window ? `${formatTime(window[0])} – ${formatTime(window[1])}` : '');

export const restDayLabel = (days: number[] | null | undefined, fallback: number[]) => {
    const list = days && days.length > 0 ? days : fallback;
    return list
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAYS[d])
        .join(', ');
};

/** Daily / monthly equivalents using the configured days-per-year factor. */
export const payEquivalents = (payType: string, amount: number, policy: Policy) => {
    const { daysPerYear, hoursPerDay } = policy;
    const daily = payType === 'monthly' ? (amount * 12) / daysPerYear : payType === 'hourly' ? amount * hoursPerDay : amount;
    return { daily, monthly: (daily * daysPerYear) / 12, hourly: daily / hoursPerDay };
};

export const payUnit = (payType: string) => PAY_TYPES.find((p) => p.value === payType)?.unit ?? '';

export const formatPay = (e: Pick<Employee, 'basic_pay' | 'pay_type'>) => `${formatPhpCurrency(Number(e.basic_pay))}${payUnit(e.pay_type)}`;

/** The value, or null when empty or marked "-" (not on file yet). */
export const onFile = (value?: string | null) => (value && value.trim() !== '-' ? value : null);

// Records synced from optical-new mark IDs not on file yet with "-".
export const missingStatutory = (e: Employee) => STATUTORY_FIELDS.filter((f) => !e[f.key] || e[f.key]?.trim() === '-');

export const statusBadgeClass = (status: string) =>
    ({
        active: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
        inactive: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
        separated: 'border-border bg-muted text-muted-foreground',
    })[status] ?? 'bg-muted text-muted-foreground';

export const typeBadgeClass = (type?: string | null) =>
    ({
        probationary: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
        regular: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
    })[type ?? ''] ?? 'border-border bg-background text-foreground';
