import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { AuditTrail } from '@/types';

const AUDIT_TRAIL_TIME_ZONE = 'Asia/Manila';

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleString('en-PH', {
        timeZone: AUDIT_TRAIL_TIME_ZONE,
        dateStyle: 'short',
        timeStyle: 'short',
    });
}

function formatUser(trail: AuditTrail): string {
    return trail.user?.name ?? trail.user?.username ?? '--';
}

function formatSubject(trail: AuditTrail): string {
    if (trail.subject_type && trail.subject_id) {
        const shortType = trail.subject_type.split('\\').pop();
        return `${shortType} #${trail.subject_id}`;
    }
    if (trail.subject_id) return String(trail.subject_id);
    return '--';
}

function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '--';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

type ViewAuditTrailDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    auditTrail: AuditTrail | null;
};

export function ViewAuditTrailDialog({
    open,
    onOpenChange,
    auditTrail,
}: ViewAuditTrailDialogProps) {
    if (!auditTrail) return null;

    const rows: { label: string; value: string }[] = [
        { label: 'ID', value: String(auditTrail.id) },
        { label: 'User', value: formatUser(auditTrail) },
        { label: 'Action', value: auditTrail.action ?? '--' },
        { label: 'Method', value: auditTrail.method ?? '--' },
        { label: 'Subject', value: formatSubject(auditTrail) },
        { label: 'Subject Type', value: auditTrail.subject_type ?? '--' },
        { label: 'Subject ID', value: auditTrail.subject_id ?? '--' },
        { label: 'Route', value: auditTrail.route_name ?? '--' },
        { label: 'URL', value: auditTrail.url ?? '--' },
        { label: 'IP Address', value: auditTrail.ip_address ?? '--' },
        { label: 'User Agent', value: auditTrail.user_agent ?? '--' },
        { label: 'Description', value: auditTrail.description ?? '--' },
        { label: 'Created At', value: formatDateTime(auditTrail.created_at) },
    ];

    const rawPayload =
        auditTrail.request_payload && typeof auditTrail.request_payload === 'object'
            ? auditTrail.request_payload
            : null;
    const changesRaw =
        rawPayload && typeof rawPayload.__changes === 'object' && rawPayload.__changes
            ? (rawPayload.__changes as Record<string, { from?: unknown; to?: unknown }>)
            : null;
    const changeEntries = changesRaw
        ? Object.entries(changesRaw).map(([field, value]) => ({
              field,
              from: value?.from,
              to: value?.to,
          }))
        : [];

    const payloadText =
        auditTrail.request_payload &&
        Object.keys(auditTrail.request_payload).length > 0
            ? JSON.stringify(auditTrail.request_payload, null, 2)
            : '--';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
                <DialogHeader>
                    <DialogTitle>Audit trail details</DialogTitle>
                    <DialogDescription>
                        Full request metadata and payload for this audit entry.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                            {(auditTrail.action ?? 'action').toUpperCase()}
                        </Badge>
                        <Badge variant="outline">
                            {(auditTrail.method ?? '--').toUpperCase()}
                        </Badge>
                        {auditTrail.subject_type && (
                            <Badge variant="outline">
                                {formatSubject(auditTrail)}
                            </Badge>
                        )}
                    </div>

                    <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                        {rows.map(({ label, value }) => (
                            <div key={label} className="space-y-1">
                                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="text-sm break-words">{value}</dd>
                            </div>
                        ))}
                    </div>

                    {changeEntries.length > 0 && (
                        <div className="rounded-lg border bg-background p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <p className="text-sm font-semibold text-foreground">
                                    Changes
                                </p>
                                <span className="text-xs text-muted-foreground">
                                    {changeEntries.length} field
                                    {changeEntries.length === 1 ? '' : 's'}
                                </span>
                            </div>
                            <div className="grid gap-2">
                                {changeEntries.map((entry) => (
                                    <div
                                        key={entry.field}
                                        className="grid gap-2 rounded-md border border-border/60 bg-muted/30 p-3 sm:grid-cols-3"
                                    >
                                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            {entry.field}
                                        </div>
                                        <div className="text-xs">
                                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                From
                                            </div>
                                            <div className="mt-1 rounded-md border bg-background px-2 py-1 text-[11px]">
                                                {formatValue(entry.from)}
                                            </div>
                                        </div>
                                        <div className="text-xs">
                                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                                To
                                            </div>
                                            <div className="mt-1 rounded-md border bg-background px-2 py-1 text-[11px]">
                                                {formatValue(entry.to)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="rounded-lg border bg-muted/20 p-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Request Payload
                        </div>
                        <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
                            {payloadText}
                        </pre>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
