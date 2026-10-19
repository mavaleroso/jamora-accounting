import { formatPhpCurrency } from '@/lib/currency';

/** Accounting-style amount: negatives in parentheses, e.g. (1,250.00). */
export function formatAmount(value: number | string | null | undefined, { currency = false }: { currency?: boolean } = {}): string {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return '—';
    const abs = currency
        ? formatPhpCurrency(Math.abs(n))
        : Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `(${abs})` : abs;
}

export function formatDate(value: string | null | undefined, style: 'medium' | 'short' = 'medium'): string {
    if (!value) return '—';
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-PH', style === 'short' ? { month: 'short', day: 'numeric' } : { dateStyle: 'medium' });
}

/** Whole days between a due date and today (positive = overdue). */
export function daysPastDue(dueDate: string | null | undefined, asOf: Date = new Date()): number {
    if (!dueDate) return 0;
    const due = new Date(`${dueDate.slice(0, 10)}T00:00:00`);
    const today = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
    return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

export function todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const paymentMethodLabels: Record<string, string> = {
    cash: 'Cash',
    gcash: 'GCash',
    e_wallet: 'E-wallet',
    card: 'Card',
    intercompany: 'Collected by related entity',
    check: 'Check',
    bank_transfer: 'Bank transfer',
    bank: 'Bank',
    deposit: 'Deposit applied',
};
