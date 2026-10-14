import { ArrowRight, Check, Paperclip, X } from 'lucide-react';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmtDate, fmtDays, fmtHours, fmtTime, fullName, KINDS, STATUS, timeAgo, TONE, type RequestItem } from '../lib';

type Props = {
    item: RequestItem;
    /** Show who filed it (team views). */
    showEmployee: boolean;
    /** Viewer may approve / decline this request. */
    canDecide: boolean;
    /** Viewer may withdraw this request. */
    canCancel: boolean;
    /** Highlight as waiting for the viewer's decision. */
    emphasize?: boolean;
    onDecide: (item: RequestItem, decision: 'approved' | 'declined') => void;
    onCancel: (item: RequestItem) => void;
};

export function fmtRange(from: string, to: string) {
    const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    if (from === to) return fmtDate(from, opts);
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    return `${fmtDate(from, { month: 'short', day: 'numeric' })} – ${fmtDate(to, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
}

const PUNCHES = [
    ['time_in', 'In'],
    ['break_out', 'Break out'],
    ['break_in', 'Break in'],
    ['time_out', 'Out'],
] as const;

/** One line saying exactly what the request asks for. */
function What({ item }: { item: RequestItem }) {
    const d = item.details;
    switch (item.kind) {
        case 'leave':
            return (
                <span>
                    <span className="font-semibold">{d.half_day ? `Half day (${d.half_day === 'am' ? 'morning' : 'afternoon'})` : fmtDays(d.days)}</span>
                    {d.is_paid === false && <span className="text-muted-foreground"> · unpaid</span>}
                </span>
            );
        case 'overtime':
            return (
                <span>
                    <span className="font-semibold">{fmtHours(d.ot_hours)}</span> overtime planned
                    {d.dtr && Number(d.dtr.ot_hours) > 0 && (
                        <span className="text-muted-foreground">
                            {' '}
                            · {fmtHours(d.dtr.ot_hours)} rendered, out {fmtTime(d.dtr.time_out as string)}
                        </span>
                    )}
                </span>
            );
        case 'correction':
            return (
                <span className="flex flex-wrap gap-1.5">
                    {PUNCHES.filter(([k]) => d[k]).map(([k, label]) => (
                        <span key={k} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs">
                            <span className="font-sans text-muted-foreground">{label}</span>
                            <span className={cn(d.dtr?.[k] ? 'line-through opacity-60' : 'text-rose-600 dark:text-rose-400')}>{d.dtr?.[k] ? fmtTime(d.dtr[k] as string) : 'none'}</span>
                            <ArrowRight className="size-3 text-muted-foreground" />
                            <span className="font-semibold">{fmtTime(d[k])}</span>
                        </span>
                    ))}
                </span>
            );
        case 'official_business':
            return (
                <span>
                    <span className="font-semibold">
                        {fmtTime(d.time_in)} – {fmtTime(d.time_out)}
                    </span>
                    {d.destination && <span className="text-muted-foreground"> · {d.destination}</span>}
                </span>
            );
        case 'undertime':
            return (
                <span>
                    Leave at <span className="font-semibold">{fmtTime(d.time_out)}</span>
                    {d.dtr?.scheduled_out && <span className="text-muted-foreground"> · shift ends {fmtTime(d.dtr.scheduled_out as string)}</span>}
                </span>
            );
        case 'schedule_change':
            return d.rest_day ? (
                <span className="font-semibold">Rest day instead of work</span>
            ) : (
                <span>
                    New shift{' '}
                    <span className="font-semibold">
                        {fmtTime(d.time_in)} – {fmtTime(d.time_out)}
                    </span>
                </span>
            );
    }
}

export function RequestCard({ item, showEmployee, canDecide, canCancel, emphasize, onDecide, onCancel }: Props) {
    const meta = KINDS[item.kind];
    const st = STATUS[item.status];
    const pending = item.status === 'pending';

    return (
        <li className={cn('rounded-xl border bg-card p-4 shadow-sm', emphasize && pending && 'border-l-4 border-l-amber-400')}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 gap-3">
                    {showEmployee && item.employee ? (
                        <PersonAvatar src={item.employee.avatar_url} seed={item.employee.employee_code} name={fullName(item.employee)} />
                    ) : (
                        <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-md border', TONE[meta.tone])}>
                            <meta.icon className="size-4" />
                        </span>
                    )}
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {showEmployee && <span className="font-medium">{fullName(item.employee)}</span>}
                            {showEmployee ? (
                                <Badge variant="outline" className={cn('gap-1', TONE[meta.tone])}>
                                    <meta.icon className="size-3" /> {item.title}
                                </Badge>
                            ) : (
                                <span className="font-medium">{item.title}</span>
                            )}
                            <span className="text-sm text-muted-foreground">{fmtRange(item.date_from, item.date_to)}</span>
                            <Badge variant="outline" className={TONE[st.tone]}>
                                {st.label}
                            </Badge>
                        </div>

                        <div className="text-sm">
                            <What item={item} />
                        </div>

                        {item.reason && <p className="text-sm text-muted-foreground">“{item.reason}”</p>}

                        {item.details.attachment_url && (
                            <a href={item.details.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <Paperclip className="size-3" /> Supporting document
                            </a>
                        )}

                        <div className="text-[11px] text-muted-foreground">
                            Filed {timeAgo(item.filed_at)}
                            {item.filed_by && ` by ${item.filed_by}`}
                            {!pending && item.decided_by && item.decided_at && (
                                <>
                                    {' '}
                                    · {st.label.toLowerCase()} by {item.decided_by} {timeAgo(item.decided_at)}
                                </>
                            )}
                        </div>
                        {item.remarks && (
                            <div className={cn('rounded-md border px-2.5 py-1.5 text-xs', item.status === 'declined' ? TONE.rose : 'bg-muted/40')}>
                                <span className="font-medium">{item.status === 'cancelled' ? 'Cancellation note' : 'Reviewer note'}:</span> {item.remarks}
                            </div>
                        )}
                    </div>
                </div>

                {(canDecide && pending) || (canCancel && item.cancellable) ? (
                    <div className="flex shrink-0 gap-2 sm:flex-col">
                        {canDecide && pending && (
                            <>
                                <Button size="sm" onClick={() => onDecide(item, 'approved')}>
                                    <Check className="size-4" /> Approve
                                </Button>
                                <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => onDecide(item, 'declined')}>
                                    <X className="size-4" /> Decline
                                </Button>
                            </>
                        )}
                        {canCancel && item.cancellable && (
                            <Button size="sm" variant="ghost" onClick={() => onCancel(item)}>
                                {pending ? 'Withdraw' : 'Cancel leave'}
                            </Button>
                        )}
                    </div>
                ) : null}
            </div>
        </li>
    );
}
