import { router } from '@inertiajs/react';
import { MapPinOff, MoreHorizontal, PartyPopper, Pencil, RefreshCw, Search, Users } from 'lucide-react';
import * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { BOARD_STATUS, DOT, fmtMinutes, fmtTime, fullName, TONE, type Board, type BoardRow, type BoardStatus } from '../lib';

const CHIP_ORDER: BoardStatus[] = ['late', 'expected', 'working', 'on_break', 'done', 'on_leave', 'absent', 'holiday', 'rest_day'];

type Props = {
    board: Board;
    canManage: boolean;
    onEdit: (row: BoardRow) => void;
    onViewTimesheet: (employeeId: number) => void;
};

export function TodayBoard({ board, canManage, onEdit, onViewTimesheet }: Props) {
    const [filter, setFilter] = React.useState<BoardStatus | 'all'>('all');
    const [search, setSearch] = React.useState('');
    const [refreshing, setRefreshing] = React.useState(false);
    const [, tick] = React.useState(0);

    const refresh = React.useCallback(() => {
        setRefreshing(true);
        router.reload({ only: ['board'], onFinish: () => setRefreshing(false) });
    }, []);

    // Keep the board live without the user doing anything.
    React.useEffect(() => {
        const t = setInterval(refresh, 60_000);
        const label = setInterval(() => tick((n) => n + 1), 15_000);
        return () => {
            clearInterval(t);
            clearInterval(label);
        };
    }, [refresh]);

    const counts = board.counts;
    const scheduled = board.rows.filter((r) => !['rest_day', 'on_leave', 'holiday'].includes(r.status)).length;
    const clockedIn = (counts.working ?? 0) + (counts.on_break ?? 0) + (counts.done ?? 0);
    const updatedAgo = Math.max(0, Math.round((Date.now() - new Date(board.generated_at).getTime()) / 60000));

    const rows = board.rows.filter((r) => {
        if (filter !== 'all' && r.status !== filter) return false;
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return [fullName(r.employee), r.employee.employee_code, r.employee.position, r.employee.department].some((v) => v?.toLowerCase().includes(q));
    });

    return (
        <div className="space-y-4">
            {board.holiday && (
                <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                    <PartyPopper className="size-4" /> Today is <span className="font-semibold">{board.holiday}</span>. Anyone working gets holiday premium pay.
                </div>
            )}

            {/* Summary */}
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-2xl font-bold tabular-nums">
                        {clockedIn}
                        <span className="text-base font-normal text-muted-foreground"> / {scheduled} scheduled in</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted sm:w-72">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${scheduled ? (clockedIn / scheduled) * 100 : 0}%` }} />
                    </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    Updated {updatedAgo === 0 ? 'just now' : `${updatedAgo}m ago`}
                    <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
                        <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} /> Refresh
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex flex-wrap gap-1.5">
                    <Chip active={filter === 'all'} onClick={() => setFilter('all')} label="Everyone" count={board.rows.length} />
                    {CHIP_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
                        <Chip key={s} active={filter === s} onClick={() => setFilter(s)} label={BOARD_STATUS[s].label} count={counts[s] ?? 0} dot={DOT[BOARD_STATUS[s].tone]} />
                    ))}
                </div>
                <div className="relative lg:ml-auto lg:w-64">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a person…" className="pl-8" />
                </div>
            </div>

            {/* List */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-muted-foreground">
                        <Users className="size-8 opacity-40" />
                        {board.rows.length === 0 ? 'No active employees in this branch.' : 'Nobody matches this filter.'}
                    </div>
                ) : (
                    <ul className="divide-y">
                        {rows.map((r) => {
                            const meta = BOARD_STATUS[r.status];
                            return (
                                <li key={r.employee.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/30">
                                    <div className="flex min-w-[220px] flex-1 items-center gap-3">
                                        <PersonAvatar src={r.employee.avatar_url} seed={r.employee.employee_code} name={fullName(r.employee)} />
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-medium">{fullName(r.employee)}</div>
                                            <div className="truncate text-xs text-muted-foreground">{r.employee.position ?? r.employee.employee_code}</div>
                                        </div>
                                    </div>

                                    <div className="w-36 text-xs text-muted-foreground">
                                        {r.schedule.start ? (
                                            <span className="font-mono">
                                                {fmtTime(r.schedule.start)} – {fmtTime(r.schedule.end)}
                                            </span>
                                        ) : (
                                            '—'
                                        )}
                                    </div>

                                    <div className="w-40">
                                        <Badge variant="outline" className={TONE[meta.tone]} title={meta.hint}>
                                            {meta.label}
                                        </Badge>
                                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                                            {r.status === 'late' && r.late_by != null && `${fmtMinutes(r.late_by)} past start`}
                                            {['working', 'on_break', 'done'].includes(r.status) && r.tardiness_minutes > 0 && `Late ${fmtMinutes(r.tardiness_minutes)}`}
                                            {r.status === 'on_leave' && r.leave}
                                        </div>
                                    </div>

                                    <div className="flex w-56 items-center gap-1.5 font-mono text-xs">
                                        <Punch label="In" value={r.dtr?.time_in} />
                                        <Punch label="Brk" value={r.dtr?.break_out} sub={r.dtr?.break_in} />
                                        <Punch label="Out" value={r.dtr?.time_out} />
                                        {r.dtr?.location_status === 'out_of_bounds' && (
                                            <span title="Punched outside the geofence">
                                                <MapPinOff className="size-3.5 text-rose-500" />
                                            </span>
                                        )}
                                    </div>

                                    <div className="ml-auto">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${fullName(r.employee)}`}>
                                                    <MoreHorizontal className="size-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {canManage && (
                                                    <DropdownMenuItem onClick={() => onEdit(r)} disabled={r.dtr?.status === 'locked'}>
                                                        <Pencil className="size-4" /> {r.dtr ? 'Edit today’s punches' : 'Add punches for today'}
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onClick={() => onViewTimesheet(r.employee.id)}>View timesheet</DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

function Chip({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
            )}
        >
            {dot && <span className={cn('size-2 rounded-full', dot)} />}
            {label}
            <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-muted-foreground')}>{count}</span>
        </button>
    );
}

function Punch({ label, value, sub }: { label: string; value?: string | null; sub?: string | null }) {
    return (
        <span className={cn('rounded border px-1.5 py-0.5', value ? 'bg-background' : 'border-dashed text-muted-foreground/60')} title={label}>
            {value ? fmtTime(value).replace(' ', '') : label}
            {sub !== undefined && value && <span className="text-muted-foreground">–{sub ? fmtTime(sub).replace(' ', '') : '…'}</span>}
        </span>
    );
}
