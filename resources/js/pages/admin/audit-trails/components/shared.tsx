import { cn } from '@/lib/utils';
import type { AuditEvent } from '@/types';

export const EVENT: Record<AuditEvent, { label: string; className: string }> = {
    created: { label: 'Created', className: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
    updated: { label: 'Updated', className: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300' },
    deleted: { label: 'Deleted', className: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300' },
    restored: { label: 'Restored', className: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300' },
    request: { label: 'Action', className: 'border-border bg-muted text-muted-foreground' },
};

export function EventBadge({ event, className }: { event: AuditEvent; className?: string }) {
    const e = EVENT[event] ?? EVENT.request;
    return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', e.className, className)}>{e.label}</span>;
}

export function fmtDateTime(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function fmtValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map((v) => fmtValue(v)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

/** "status: draft → approved · amount: 1,200 → 1,250 (+2 more)" */
export function summarize(changes: { label: string; from: unknown; to: unknown }[], event: AuditEvent): string {
    if (changes.length === 0) return '';
    if (event === 'created' || event === 'deleted') return `${changes.length} field${changes.length === 1 ? '' : 's'}`;
    const short = (v: unknown) => {
        const s = fmtValue(v).replace(/\s+/g, ' ');
        return s.length > 28 ? `${s.slice(0, 27)}…` : s;
    };
    const parts = changes.slice(0, 2).map((c) => (c.from === null || c.from === undefined ? `${c.label}: ${short(c.to)}` : c.to === null || c.to === undefined ? `${c.label}: ${short(c.from)} removed` : `${c.label}: ${short(c.from)} → ${short(c.to)}`));
    return parts.join(' · ') + (changes.length > 2 ? ` (+${changes.length - 2} more)` : '');
}
