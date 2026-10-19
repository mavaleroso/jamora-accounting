import { formatPhpCurrency } from '@/lib/currency';

export { fmtDate, TONE } from '../../employee-management/attendance/lib';
export { fmtRange } from '../../employee-management/requests/components/request-card';

export const PAYROLL_URL = '/payroll/runs';

export type RunStatus = 'draft' | 'approved' | 'posted' | 'paid' | 'void';
type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate' | 'blue';

export const RUN_STATUS: Record<RunStatus | 'none', { label: string; tone: Tone; hint: string }> = {
    none: { label: 'Not started', tone: 'slate', hint: 'Compute when the cut-off’s time records are approved.' },
    draft: { label: 'Draft', tone: 'amber', hint: 'Review the register and adjustments, then approve.' },
    approved: { label: 'Approved', tone: 'sky', hint: 'Time records are locked. Post to the general ledger.' },
    posted: { label: 'Posted', tone: 'violet', hint: 'Booked in accounting. Release pay on pay day.' },
    paid: { label: 'Paid', tone: 'emerald', hint: 'Net pay released; payslips are final.' },
    void: { label: 'Void', tone: 'slate', hint: 'Discarded draft.' },
};

/** The four steps of a payroll run, in order. */
export const STEPS = [
    { key: 'computed', label: 'Compute', status: 'draft' },
    { key: 'approved', label: 'Review & approve', status: 'approved' },
    { key: 'posted', label: 'Post to GL', status: 'posted' },
    { key: 'paid', label: 'Release pay', status: 'paid' },
] as const;

const ORDER: Record<RunStatus | 'none', number> = { none: 0, void: 0, draft: 1, approved: 2, posted: 3, paid: 4 };
export const stepIndex = (status: RunStatus | null | undefined) => ORDER[status ?? 'none'];

export const peso = (n: number | string | null | undefined) => formatPhpCurrency(Number(n ?? 0));

/** Compact peso for tiles: ₱1.24M / ₱312.5K / ₱950.00 */
export function pesoShort(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(2)}M`;
    if (abs >= 100_000) return `₱${(n / 1_000).toFixed(1)}K`;
    return peso(n);
}

export type Check = { key: string; level: 'error' | 'warning' | 'info'; count: number; message: string };

export type PayslipRow = {
    id: number;
    employee: {
        id: number;
        employee_code: string;
        firstname: string;
        lastname: string;
        name: string;
        avatar_url: string | null;
        position: string | null;
        pay_type: 'monthly' | 'daily' | 'hourly';
        basic_rate: number;
        bank_name: string | null;
        bank_account_hint: string | null;
    } | null;
    basic_pay: number;
    ot_pay: number;
    holiday_pay: number;
    night_diff_pay: number;
    taxable_allowances: number;
    non_taxable_allowances: number;
    absences: number;
    tardiness: number;
    unpaid_leave: number;
    gross_pay: number;
    sss: number;
    sss_er: number;
    sss_ec: number;
    philhealth: number;
    philhealth_er: number;
    pagibig: number;
    pagibig_er: number;
    employer_benefits: number;
    taxable_income: number;
    withholding_tax: number;
    other_deductions: number;
    benefit_deductions: number;
    net_pay: number;
    thirteenth_month_accrual: number;
    is_mwe: boolean;
    total_deductions: number;
    employer_contributions: number;
    meta: {
        pay_type?: string;
        rates?: { monthly: number; daily: number; hourly: number };
        days?: {
            worked: number;
            absent: number;
            paid_leave: number;
            unpaid_leave: number;
            unworked_holiday: number;
            not_employed: number;
            no_record: number;
        };
        hours_worked?: number;
        late_minutes?: number;
        undertime_minutes?: number;
        ot_hours?: number;
        night_diff_hours?: number;
        premiums?: Record<string, number>;
        contribution_share?: number;
        contribution_base?: number;
        sss_msc?: number | null;
        /** Contributions set to "not deducted" on the employee record. */
        contribution_modes?: Partial<Record<'sss' | 'philhealth' | 'pagibig', 'none'>>;
        adjustments?: { id: number; kind: 'earning' | 'deduction'; category: string; description: string; amount: number; taxable: boolean }[];
        benefits?: PayslipBenefit[];
        warnings?: string[];
    };
};

export type AdjustmentCategory = { key: string; kind: 'earning' | 'deduction'; label: string; taxable: boolean };

export const PAY_TYPE: Record<string, string> = { monthly: 'Monthly-paid', daily: 'Daily-paid', hourly: 'Hourly-paid' };

export const DAY_TYPE_LABEL: Record<string, string> = {
    rest_day: 'Rest day work',
    special_holiday: 'Special holiday work',
    special_holiday_rest_day: 'Special holiday on rest day',
    regular_holiday: 'Regular holiday work',
    regular_holiday_rest_day: 'Regular holiday on rest day',
};

/** Statutory remittance deadlines for contributions of a given month (PH, private employers). */
export function remittanceDue(agency: string, periodEnd: string): string {
    const [y, m] = periodEnd.split('-').map(Number);
    const next = (day: number) => new Date(y, m, day); // month m (1-based) as index = next month
    const lastOfNext = new Date(y, m + 1, 0);
    const fmt = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    switch (agency) {
        case 'BIR':
            return fmt(next(10)); // eFPS filers: staggered 11th–15th
        case 'SSS':
            return fmt(lastOfNext);
        case 'Benefits':
            return 'Per provider billing';
        default:
            return `${fmt(next(15))} (11th–15th by employer no.)`;
    }
}

/** A benefit enrollment applied to a payslip (Benefits Administration). Amounts are for the cut-off. */
export type PayslipBenefit = {
    id: number;
    code: string;
    name: string;
    mode: 'earning' | 'contribution';
    earning: number;
    /** Per-day allowance: the days worked it was paid for. */
    days?: number;
    taxable: boolean;
    employee: number;
    employer: number;
};
