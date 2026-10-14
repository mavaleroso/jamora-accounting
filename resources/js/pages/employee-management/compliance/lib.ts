import { formatPhpCurrency } from '@/lib/currency';

export { TONE } from '../attendance/lib';

export const COMPLIANCE_URL = '/employee-management/compliance';

export type Status = 'pending' | 'prepared' | 'submitted' | 'verified';
export type Stamp = { by: string | null; by_id: number | null; at: string } | null;
export type PayrollFigure = { amount: number; runs: number; unreleased: number; basis: string } | null;

export type Item = {
    id: number;
    title: string;
    form_code: string | null;
    agency: string | null;
    category: string;
    frequency: string | null;
    period: string;
    owner_role: string;
    status: Status;
    reference_no: string | null;
    notes: string | null;
    due_date: string | null;
    amount: number | null;
    evidence_url: string | null;
    is_overdue: boolean;
    is_late: boolean;
    days_late: number;
    payroll: PayrollFigure;
    prepared: Stamp;
    submitted: Stamp;
    verified: Stamp;
};

export const STEPS: { key: Status; label: string }[] = [
    { key: 'pending', label: 'To prepare' },
    { key: 'prepared', label: 'Prepared' },
    { key: 'submitted', label: 'Filed' },
    { key: 'verified', label: 'Verified' },
];

/** The action that moves an item forward, by its current status. */
export const NEXT_ACTION: Record<Status, { step: 'prepare' | 'submit' | 'verify'; label: string } | null> = {
    pending: { step: 'prepare', label: 'Prepare' },
    prepared: { step: 'submit', label: 'Record filing' },
    submitted: { step: 'verify', label: 'Verify' },
    verified: null,
};

export const CATEGORY: Record<string, string> = {
    statutory_tax: 'Tax (BIR)',
    statutory_payroll: 'Payroll contributions',
    local_government: 'Local government',
    regulatory: 'Regulatory (DOLE)',
};

export const peso = (n: number | null | undefined) => formatPhpCurrency(Number(n ?? 0));

const parse = (v: string) => {
    const [y, m, d] = v.slice(0, 10).split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const fmtDate = (v: string | null, year = true) =>
    v ? parse(v).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }) : '—';

export const fmtStamp = (v: string) => new Date(v).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Whole days from `today` to `date` (negative = past). */
export const daysUntil = (date: string, today: string) => Math.round((parse(date).getTime() - parse(today).getTime()) / 86_400_000);

export function dueLabel(item: Item, today: string): { text: string; tone: 'rose' | 'amber' | 'slate' | 'emerald' } {
    if (!item.due_date) return { text: 'No due date', tone: 'slate' };
    if (item.status === 'submitted' || item.status === 'verified') {
        return item.is_late ? { text: `Filed ${item.days_late}d late`, tone: 'rose' } : { text: 'Filed on time', tone: 'emerald' };
    }
    const d = daysUntil(item.due_date, today);
    if (d < 0) return { text: `${-d}d overdue`, tone: 'rose' };
    if (d === 0) return { text: 'Due today', tone: 'amber' };
    if (d <= 7) return { text: `Due in ${d}d`, tone: 'amber' };
    return { text: `Due in ${d}d`, tone: 'slate' };
}

/** Payroll figure disagrees with the recorded amount (by more than a centavo). */
export const mismatch = (item: Item) => item.payroll !== null && item.amount !== null && Math.abs(item.payroll.amount - item.amount) > 0.01;
