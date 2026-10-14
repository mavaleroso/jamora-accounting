import { CalendarDays, Plane } from 'lucide-react';
import type * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { cn } from '@/lib/utils';
import { fmtDate, fmtDays, fmtTime, fullName, KINDS, TONE, type Balance, type OutItem } from '../lib';
import { fmtRange } from './request-card';

function Panel({ title, icon: Icon, action, children }: { title: string; icon: typeof Plane; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border bg-card shadow-sm">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4 text-muted-foreground" /> {title}
                </h3>
                {action}
            </header>
            <div className="p-4">{children}</div>
        </section>
    );
}

/** Leave credits for one employee. Tracked types show a meter; per-occurrence types show their cap. */
export function BalancesPanel({ balances, year, onFile }: { balances: Balance[]; year: number; onFile?: () => void }) {
    const tracked = balances.filter((b) => b.balance_tracked);
    const occurrence = balances.filter((b) => !b.balance_tracked);

    return (
        <Panel title={`Leave credits ${year}`} icon={Plane}>
            {balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave types are set up yet.</p>
            ) : (
                <div className="space-y-4">
                    <ul className="space-y-3">
                        {tracked.map((b) => {
                            const total = Math.max(b.entitled, 0);
                            const usedPct = total ? Math.min(100, (b.used / total) * 100) : 0;
                            const heldPct = total ? Math.min(100 - usedPct, (b.reserved / total) * 100) : 0;
                            return (
                                <li key={b.leave_type_id} className="space-y-1.5">
                                    <div className="flex items-baseline justify-between gap-2 text-sm">
                                        <span className="font-medium">{b.name}</span>
                                        <span className="tabular-nums">
                                            <span className="font-semibold">{Number(b.available ?? 0)}</span>
                                            <span className="text-muted-foreground"> / {total}</span>
                                        </span>
                                    </div>
                                    <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                                        <div className="bg-violet-500" style={{ width: `${usedPct}%` }} />
                                        <div className="bg-amber-400" style={{ width: `${heldPct}%` }} />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        {b.used > 0 ? `${fmtDays(b.used)} used` : 'None used'}
                                        {b.reserved > 0 && ` · ${fmtDays(b.reserved)} pending`}
                                        {b.service_note && ` · ${b.service_note}`}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                    {occurrence.length > 0 && (
                        <div className="space-y-1.5 border-t pt-3">
                            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Per occurrence</p>
                            <ul className="space-y-1">
                                {occurrence.map((b) => (
                                    <li key={b.leave_type_id} className="flex items-center justify-between gap-2 text-sm">
                                        {onFile ? (
                                            <button type="button" className="text-left hover:underline" onClick={onFile}>
                                                {b.name}
                                            </button>
                                        ) : (
                                            <span>{b.name}</span>
                                        )}
                                        <span className="text-xs text-muted-foreground">{b.max_days_per_filing ? `up to ${fmtDays(b.max_days_per_filing)}` : 'as needed'}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <p className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <span className="size-2 rounded-full bg-violet-500" /> Used
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <span className="size-2 rounded-full bg-amber-400" /> Pending approval
                        </span>
                    </p>
                </div>
            )}
        </Panel>
    );
}

function whenLabel(item: OutItem, today: string) {
    if (item.date_from <= today && item.date_to >= today) return 'Today';
    return fmtDate(item.date_from, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Approved leave and official business in a window, grouped by start day. */
export function OutPanel({ title, items, today, showEmployee, empty }: { title: string; items: OutItem[]; today: string; showEmployee: boolean; empty: string }) {
    const outToday = items.filter((i) => i.date_from <= today && i.date_to >= today).length;

    return (
        <Panel
            title={title}
            icon={CalendarDays}
            action={showEmployee && outToday > 0 ? <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE.violet)}>{outToday} out today</span> : undefined}
        >
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{empty}</p>
            ) : (
                <ul className="space-y-3">
                    {items.map((i) => {
                        const meta = KINDS[i.kind];
                        return (
                            <li key={i.key} className="flex items-start gap-3">
                                {showEmployee ? (
                                    <PersonAvatar src={i.employee.avatar_url} seed={i.employee.employee_code} name={fullName(i.employee)} className="size-8" />
                                ) : (
                                    <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-md border', TONE[meta.tone])}>
                                        <meta.icon className="size-3.5" />
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="truncate text-sm font-medium">{showEmployee ? fullName(i.employee) : i.title}</span>
                                        <span className={cn('shrink-0 text-[11px]', whenLabel(i, today) === 'Today' ? 'font-semibold text-violet-600 dark:text-violet-400' : 'text-muted-foreground')}>
                                            {whenLabel(i, today)}
                                        </span>
                                    </div>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {showEmployee && `${i.title} · `}
                                        {i.kind === 'official_business'
                                            ? `${fmtTime(i.time_from)} – ${fmtTime(i.time_to)}`
                                            : `${fmtRange(i.date_from, i.date_to)}${i.half_day ? ' · half day' : i.days ? ` · ${fmtDays(i.days)}` : ''}`}
                                    </p>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Panel>
    );
}
