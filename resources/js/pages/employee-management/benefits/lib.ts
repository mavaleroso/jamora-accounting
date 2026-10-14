import { formatPhpCurrency } from '@/lib/currency';

export { fmtDate, TONE } from '../attendance/lib';

export const BENEFITS_URL = '/employee-management/benefits';

export type PayrollMode = 'statutory' | 'earning' | 'contribution' | 'none';
export type EnrollmentStatus = 'active' | 'scheduled' | 'pending' | 'waived' | 'ended';
type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate' | 'blue';

export type Program = {
    id: number;
    code: string;
    name: string;
    category: string;
    contribution_basis: 'fixed' | 'percent_of_basic' | 'statutory_sss' | 'statutory_philhealth' | 'statutory_pagibig';
    payroll_mode: PayrollMode;
    description: string | null;
    is_taxable: boolean;
    is_active: boolean;
    is_global: boolean;
    default_employee_share: number;
    default_employer_share: number;
    employee_rate: number;
    employer_rate: number;
    enrolled: number;
    enrollments_total: number;
    monthly_employee: number;
    monthly_employer: number;
};

export type Enrollment = {
    id: number;
    employee_id: number;
    program_id: number;
    employee_share: number;
    employer_share: number;
    participation_status: 'active' | 'pending' | 'waived';
    status: EnrollmentStatus;
    effective_date: string | null;
    end_date: string | null;
    notes: string | null;
};

type Share = { employee: number; employer: number };

export type EmployeeRow = {
    id: number;
    employee_code: string;
    firstname: string;
    lastname: string;
    name: string;
    avatar_url: string | null;
    position: string | null;
    department: string | null;
    pay_type: 'monthly' | 'daily' | 'hourly';
    basic_pay: number;
    monthly_rate: number;
    statutory: { sss: Share & { ec: number; msc: number | null }; philhealth: Share; pagibig: Share };
    missing_ids: string[];
};

export const MODE: Record<PayrollMode, { label: string; tone: Tone; effect: string }> = {
    statutory: { label: 'Statutory', tone: 'blue', effect: 'Computed by payroll for every employee.' },
    earning: { label: 'Allowance', tone: 'emerald', effect: 'Paid to the employee on the payslip.' },
    contribution: { label: 'Contribution', tone: 'violet', effect: 'Employee share deducted from pay; employer share booked as benefit expense.' },
    none: { label: 'Tracked only', tone: 'slate', effect: 'Recorded here only — payroll is not affected.' },
};

export const STATUS: Record<EnrollmentStatus, { label: string; tone: Tone; hint: string }> = {
    active: { label: 'Active', tone: 'emerald', hint: 'Applied on every payroll.' },
    scheduled: { label: 'Starts later', tone: 'sky', hint: 'Applied from the start date.' },
    pending: { label: 'Pending', tone: 'amber', hint: 'Not applied until activated (e.g. awaiting provider confirmation).' },
    waived: { label: 'Waived', tone: 'slate', hint: 'Employee declined — not applied.' },
    ended: { label: 'Ended', tone: 'slate', hint: 'Past its end date.' },
};

export const CATEGORY_LABEL: Record<string, string> = {
    statutory: 'Statutory',
    allowance: 'Allowance',
    insurance: 'Insurance / HMO',
    savings: 'Savings / retirement',
    company: 'Company benefit',
};

export const peso = (n: number | string | null | undefined) => formatPhpCurrency(Number(n ?? 0));

/** What an employee would get by default — mirrors BenefitCalculator::computeShares for company programs. */
export function defaultShares(program: Program, employee: Pick<EmployeeRow, 'monthly_rate'>): Share {
    if (program.contribution_basis === 'percent_of_basic') {
        const round = (n: number) => Math.round(n * 100) / 100;
        return {
            employee: round((employee.monthly_rate * program.employee_rate) / 100),
            employer: round((employee.monthly_rate * program.employer_rate) / 100),
        };
    }
    return { employee: program.default_employee_share, employer: program.default_employer_share };
}

/** "₱1,500.00 / mo allowance", "EE ₱300.00 · ER ₱1,200.00 / mo", "EE 2% · ER 3% of monthly rate" */
export function programAmounts(p: Program): string {
    const percent = p.contribution_basis === 'percent_of_basic';
    const amount = (fixed: number, rate: number) => (percent ? `${rate}%` : peso(fixed));
    if (p.payroll_mode === 'earning') {
        return `${amount(p.default_employer_share, p.employer_rate)}${percent ? ' of monthly rate' : ' / month'}`;
    }
    return `EE ${amount(p.default_employee_share, p.employee_rate)} · ER ${amount(p.default_employer_share, p.employer_rate)}${percent ? ' of monthly rate' : ' / month'}`;
}

/** An enrollment still counts (not ended / waived) — used to block duplicate enrollment. */
export const isOpen = (e: Enrollment) => e.status !== 'ended' && e.status !== 'waived';
