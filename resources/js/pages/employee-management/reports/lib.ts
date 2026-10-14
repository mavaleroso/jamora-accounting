import { formatPhpCurrency } from '@/lib/currency';

export const REPORTS_URL = '/employee-management/reports';

/**
 * Categorical slots (dataviz reference palette), validated in order for light and dark surfaces.
 * Assigned by entity in a fixed order — never by rank — so a category keeps its color under any filter.
 * Light slots 3–5 are under 3:1 on the surface: charts using them always show visible labels.
 */
export const SERIES = [
    { light: '#2a78d6', dark: '#3987e5' },
    { light: '#eb6834', dark: '#d95926' },
    { light: '#1baf7a', dark: '#199e70' },
    { light: '#eda100', dark: '#c98500' },
    { light: '#e87ba4', dark: '#d55181' },
] as const;
export const slot = (i: number) => SERIES[Math.min(i, SERIES.length - 1)];

export type Person = { id: number; code: string; name: string; department: string | null; position: string | null; avatarUrl: string | null };
type Count = { key: string; count: number };

export type Workforce = {
    active: number;
    atStart: number;
    hires: number;
    separations: number;
    turnoverRate: number;
    avgTenureYears: number | null;
    byDepartment: { department: string; count: number; regular: number }[];
    byType: Count[];
    byPayType: Count[];
    byGender: Count[];
    trend: { month: string; headcount: number; hires: number; separations: number }[];
    movements: (Person & { type: 'hire' | 'separation'; date: string })[];
    attention: { probationDue: (Person & { due: string })[]; missingIds: number; noBank: number };
};

export type AttendanceSummary = {
    daysWorked: number;
    absences: number;
    lateCount: number;
    lateMinutes: number;
    undertimeMinutes: number;
    otRendered: number;
    otApproved: number;
    nightDiffHours: number;
    leaveDays: number;
    rate: number | null;
};

export type Attendance = AttendanceSummary & {
    through: string | null;
    incomplete: number;
    unapproved: number;
    daily: { date: string; rate: number; present: number; late: number; absent: number }[];
    byDepartment: (AttendanceSummary & { department: string })[];
    byEmployee: (AttendanceSummary & Person)[];
};

export type Leave = {
    filed: number;
    approved: number;
    pending: number;
    declined: number;
    daysTaken: number;
    unpaidDays: number;
    byType: { type: string; requests: number; days: number }[];
    balances: { type: string; employees: number; entitled: number; used: number; available: number; value: number | null }[];
    upcoming: (Person & { type: string; start: string; end: string; days: number })[];
};

export type PayTotals = { gross: number; net: number; overtime: number; employer: number; employeeContributions: number; tax: number; thirteenth: number; employees: number };

export type Payroll = PayTotals & {
    runs: number;
    unreleased: number;
    monthlyRunRate: number;
    trend: (PayTotals & { month: string })[];
    byDepartment: (PayTotals & { department: string })[];
};

export type Filters = { preset: string; from: string | null; to: string | null; department: string | null };

export const peso = (n: number | null | undefined) => formatPhpCurrency(Number(n ?? 0));

/** ₱1.24M / ₱312.5K / ₱950 */
export function pesoShort(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
    if (abs >= 10_000) return `₱${(n / 1_000).toFixed(1)}K`;
    return `₱${Math.round(n).toLocaleString('en-PH')}`;
}

export const num = (n: number, digits = 0) => n.toLocaleString('en-PH', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const pct = (n: number | null | undefined, digits = 1) => (n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`);

export function hours(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
}

const parse = (v: string) => {
    const [y, m, d] = v.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const monthLabel = (ym: string, long = false) => parse(ym).toLocaleDateString('en-PH', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' });
export const dayLabel = (d: string) => parse(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
export const fullDate = (d: string) => parse(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

export function rangeLabel(from: string, to: string): string {
    const a = parse(from);
    const b = parse(to);
    const sameYear = a.getFullYear() === b.getFullYear();
    return `${a.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} – ${b.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export const LABELS: Record<string, string> = {
    regular: 'Regular',
    probationary: 'Probationary',
    contractual: 'Contractual',
    project: 'Project-based',
    seasonal: 'Seasonal',
    monthly: 'Monthly-paid',
    daily: 'Daily-paid',
    hourly: 'Hourly-paid',
    female: 'Female',
    male: 'Male',
    unspecified: 'Not specified',
};
export const label = (key: string) => LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
