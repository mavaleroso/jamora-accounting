import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

const toneClass: Record<Tone, string> = {
    neutral: 'border-border bg-muted/50 text-foreground',
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    danger: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
    muted: 'border-border bg-transparent text-muted-foreground',
};

/** Status vocabulary shared by invoices, bills, deposits, reconciliations, journals and inventory reviews. */
const statusMap: Record<string, { label: string; tone: Tone }> = {
    draft: { label: 'Draft', tone: 'neutral' },
    pending: { label: 'Pending', tone: 'warning' },
    confirmed: { label: 'Open', tone: 'info' },
    posted: { label: 'Posted', tone: 'info' },
    partially_paid: { label: 'Partially paid', tone: 'warning' },
    paid: { label: 'Paid', tone: 'success' },
    void: { label: 'Void', tone: 'muted' },
    voided: { label: 'Void', tone: 'muted' },
    open: { label: 'Open', tone: 'info' },
    applied: { label: 'Applied', tone: 'success' },
    refunded: { label: 'Refunded', tone: 'muted' },
    reconciled: { label: 'Reconciled', tone: 'success' },
    overdue: { label: 'Overdue', tone: 'danger' },
    matched: { label: 'Matched', tone: 'success' },
    needs_review: { label: 'Needs review', tone: 'warning' },
    unmatched: { label: 'Unmatched', tone: 'danger' },
    cleared: { label: 'Cleared', tone: 'success' },
    uncleared: { label: 'Uncleared', tone: 'warning' },
};

export function statusLabel(status: string): string {
    return statusMap[status]?.label ?? status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
    const meta = statusMap[status] ?? { label: statusLabel(status), tone: 'neutral' as Tone };

    return (
        <Badge variant="outline" className={cn('font-medium whitespace-nowrap', toneClass[meta.tone], className)}>
            {meta.label}
        </Badge>
    );
}
