import { Link, router } from '@inertiajs/react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, FilePenLine, Inbox, Plus, Timer, X } from 'lucide-react';
import * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
    ATTENDANCE_URL,
    fmtDate,
    fmtHours,
    fmtTime,
    firstError,
    fullName,
    REQUEST_STATUS,
    TONE,
    type AttendanceRequestRow,
    type Filters,
    type Paginated,
    type Perspective,
} from '../lib';

type Props = {
    requests: Paginated<AttendanceRequestRow>;
    counts: Record<'pending' | 'approved' | 'rejected' | 'cancelled', number>;
    filters: Filters;
    perspective: Perspective;
    onFilter: (changes: Partial<Filters>) => void;
    onReview: (request: AttendanceRequestRow, decision: 'approved' | 'rejected') => void;
    onNew: () => void;
};

const TABS = [
    { id: 'pending', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all', label: 'All' },
] as const;

const TYPE_LABEL: Record<AttendanceRequestRow['request_type'], string> = {
    correction: 'Correction',
    overtime: 'Overtime',
    official_business: 'Official business',
    undertime: 'Undertime',
    schedule_change: 'Change of schedule',
};

const PUNCHES = [
    ['time_in', 'In'],
    ['break_out', 'Break out'],
    ['break_in', 'Break in'],
    ['time_out', 'Out'],
] as const;

const timeAgo = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
};

export function RequestsPanel({ requests, counts, filters, perspective, onFilter, onReview, onNew }: Props) {
    const { canManage, canViewTeam } = perspective;
    const total = counts.pending + counts.approved + counts.rejected + counts.cancelled;

    const cancel = (r: AttendanceRequestRow) =>
        router.post(`${ATTENDANCE_URL}/requests/${r.id}/cancel`, {}, { preserveScroll: true, onError: (e) => toast.error(firstError(e)) });

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-md border bg-muted p-0.5">
                    {TABS.map((t) => {
                        const n = t.id === 'all' ? total : counts[t.id];
                        const active = filters.request_status === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => onFilter({ request_status: t.id })}
                                className={cn(
                                    'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {t.label}
                                <span
                                    className={cn(
                                        'rounded-full px-1.5 text-[10px] leading-4 tabular-nums',
                                        t.id === 'pending' && n > 0 ? 'bg-amber-500 text-white' : 'bg-background text-muted-foreground ring-1 ring-border',
                                    )}
                                >
                                    {n}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {(!canViewTeam || canManage) && (
                    <Button variant="outline" onClick={onNew}>
                        <Plus className="size-4" /> {canManage ? 'File on behalf' : 'New request'}
                    </Button>
                )}
            </div>

            {requests.data.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
                    <Inbox className="size-8 text-muted-foreground/50" />
                    <p className="text-sm font-medium">
                        {filters.request_status === 'pending' ? (canManage ? 'Inbox zero — nothing waiting on you.' : 'No pending requests.') : 'No requests here.'}
                    </p>
                    {!canViewTeam && (
                        <p className="text-xs text-muted-foreground">
                            Missed a punch? Request a correction from your timesheet. Overtime (filed in advance), leave and other requests are in{' '}
                            <Link href="/employee-management/requests" className="text-primary hover:underline">
                                My Requests
                            </Link>
                            .
                        </p>
                    )}
                </div>
            ) : (
                <ul className="space-y-3">
                    {requests.data.map((r) => {
                        const st = REQUEST_STATUS[r.status];
                        const isOt = r.request_type === 'overtime';
                        const changes = PUNCHES.filter(([k]) => r[`requested_${k}`]);
                        return (
                            <li key={r.id} className={cn('rounded-xl border bg-card p-4 shadow-sm', r.status === 'pending' && canManage && 'border-l-4 border-l-amber-400')}>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                    <div className="flex min-w-0 flex-1 gap-3">
                                        {canViewTeam && (
                                            <PersonAvatar src={r.employee?.avatar_url} seed={r.employee?.employee_code ?? String(r.employee_id)} name={fullName(r.employee)} />
                                        )}
                                        <div className="min-w-0 flex-1 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                {canViewTeam && <span className="font-medium">{fullName(r.employee)}</span>}
                                                <Badge variant="outline" className={cn('gap-1', isOt ? TONE.violet : TONE.sky)}>
                                                    {isOt ? <Timer className="size-3" /> : <FilePenLine className="size-3" />}
                                                    {TYPE_LABEL[r.request_type]}
                                                </Badge>
                                                <span className="text-sm text-muted-foreground">{fmtDate(r.work_date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                                <Badge variant="outline" className={TONE[st.tone]}>
                                                    {st.label}
                                                </Badge>
                                            </div>

                                            {/* What changes */}
                                            {r.request_type === 'official_business' ? (
                                                <div className="text-sm">
                                                    <span className="font-semibold">
                                                        {fmtTime(r.requested_time_in)} – {fmtTime(r.requested_time_out)}
                                                    </span>
                                                    {r.destination && <span className="text-muted-foreground"> · {r.destination}</span>}
                                                </div>
                                            ) : r.request_type === 'undertime' ? (
                                                <div className="text-sm">
                                                    Leave at <span className="font-semibold">{fmtTime(r.requested_time_out)}</span>
                                                </div>
                                            ) : r.request_type === 'schedule_change' ? (
                                                <div className="text-sm font-semibold">
                                                    {r.requested_rest_day ? 'Rest day instead of work' : `New shift ${fmtTime(r.requested_time_in)} – ${fmtTime(r.requested_time_out)}`}
                                                </div>
                                            ) : isOt ? (
                                                <div className="text-sm">
                                                    <span className="font-semibold">{fmtHours(r.requested_ot_hours)}</span> overtime
                                                    {r.dtr_entry && (
                                                        <span className="text-muted-foreground">
                                                            {' '}
                                                            · {fmtHours(r.dtr_entry.ot_hours)} rendered (out {fmtTime(r.dtr_entry.time_out)})
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex flex-wrap gap-2">
                                                    {changes.map(([k, label]) => (
                                                        <span key={k} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs">
                                                            <span className="font-sans text-muted-foreground">{label}</span>
                                                            <span className={cn(r.dtr_entry?.[k] ? 'line-through opacity-60' : 'text-rose-600 dark:text-rose-400')}>
                                                                {r.dtr_entry?.[k] ? fmtTime(r.dtr_entry[k]) : 'none'}
                                                            </span>
                                                            <ArrowRight className="size-3 text-muted-foreground" />
                                                            <span className="font-semibold">{fmtTime(r[`requested_${k}`])}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            <p className="text-sm text-muted-foreground">“{r.reason}”</p>

                                            <div className="text-[11px] text-muted-foreground">
                                                Filed {timeAgo(r.created_at)}
                                                {r.filer && canViewTeam && ` by ${r.filer.firstname} ${r.filer.lastname}`}
                                                {r.reviewer && r.reviewed_at && (
                                                    <>
                                                        {' '}
                                                        · {st.label.toLowerCase()} by {r.reviewer.firstname} {r.reviewer.lastname} {timeAgo(r.reviewed_at)}
                                                    </>
                                                )}
                                            </div>
                                            {r.review_remarks && (
                                                <div className={cn('rounded-md border px-2.5 py-1.5 text-xs', r.status === 'rejected' ? TONE.rose : 'bg-muted/40')}>
                                                    <span className="font-medium">Reviewer note:</span> {r.review_remarks}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {r.status === 'pending' && (
                                        <div className="flex shrink-0 gap-2 sm:flex-col">
                                            {canManage ? (
                                                <>
                                                    <Button size="sm" onClick={() => onReview(r, 'approved')}>
                                                        <Check className="size-4" /> Approve
                                                    </Button>
                                                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onReview(r, 'rejected')}>
                                                        <X className="size-4" /> Reject
                                                    </Button>
                                                </>
                                            ) : (
                                                !canViewTeam && (
                                                    <Button size="sm" variant="ghost" onClick={() => cancel(r)}>
                                                        Cancel request
                                                    </Button>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {requests.last_page > 1 && (
                <div className="flex items-center justify-end gap-1 text-sm">
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={!requests.prev_page_url}
                        onClick={() => requests.prev_page_url && router.get(requests.prev_page_url, {}, { preserveScroll: true, preserveState: true })}
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                    <span className="min-w-[64px] text-center tabular-nums">
                        {requests.current_page} / {requests.last_page}
                    </span>
                    <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        disabled={!requests.next_page_url}
                        onClick={() => requests.next_page_url && router.get(requests.next_page_url, {}, { preserveScroll: true, preserveState: true })}
                        aria-label="Next page"
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}
