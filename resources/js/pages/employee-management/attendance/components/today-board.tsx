import { DataTable, DataTableColumnHeader } from '@/components/data-table';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { MapPinOff, MoreHorizontal, PartyPopper, Pencil, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { BOARD_STATUS, DOT, fmtMinutes, fmtTime, fullName, TONE, type Board, type BoardRow, type BoardStatus } from '../lib';

const CHIP_ORDER: BoardStatus[] = [
    'late',
    'expected',
    'working',
    'on_break',
    'official_business',
    'done',
    'on_leave',
    'absent',
    'holiday',
    'rest_day',
];

const COLUMN_LABELS: Record<string, string> = {
    employee: 'Employee',
    schedule: 'Schedule',
    status: 'Status',
    time_in: 'In',
    break: 'Break',
    time_out: 'Out',
};

function todayColumns({ canManage, onEdit, onViewTimesheet }: Pick<Props, 'canManage' | 'onEdit' | 'onViewTimesheet'>): ColumnDef<BoardRow>[] {
    return [
        {
            id: 'actions',
            cell: ({ row: { original: r } }) => (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${fullName(r.employee)}`}>
                            <MoreHorizontal className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {canManage && (
                            <DropdownMenuItem onClick={() => onEdit(r)} disabled={r.dtr?.status === 'locked'}>
                                <Pencil className="size-4" /> {r.dtr ? 'Edit today’s punches' : 'Add punches for today'}
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onViewTimesheet(r.employee.id)}>View timesheet</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ),
            enableSorting: false,
            enableHiding: false,
        },
        {
            id: 'employee',
            accessorFn: (r) => fullName(r.employee),
            header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
            filterFn: (row, _id, value: string) => {
                const e = row.original.employee;
                const q = value.toLowerCase();
                return [fullName(e), e.employee_code, e.position, e.department].some((v) => v?.toLowerCase().includes(q));
            },
            cell: ({ row: { original: r } }) => (
                <div className="flex min-w-[200px] items-center gap-3">
                    <PersonAvatar src={r.employee.avatar_url} seed={r.employee.employee_code} name={fullName(r.employee)} />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{fullName(r.employee)}</div>
                        <div className="text-muted-foreground truncate text-xs">{r.employee.position ?? r.employee.employee_code}</div>
                    </div>
                </div>
            ),
            enableHiding: false,
        },
        {
            id: 'schedule',
            accessorFn: (r) => r.schedule.start ?? '',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Schedule" />,
            cell: ({ row: { original: r } }) =>
                r.schedule.start ? (
                    <span className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                        {fmtTime(r.schedule.start)} – {fmtTime(r.schedule.end)}
                    </span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
        {
            id: 'status',
            // Sorts in the same order as the filter chips: who needs attention first.
            accessorFn: (r) => CHIP_ORDER.indexOf(r.status),
            header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
            cell: ({ row: { original: r } }) => {
                const meta = BOARD_STATUS[r.status];
                return (
                    <div className="min-w-[130px]">
                        <Badge variant="outline" className={TONE[meta.tone]} title={meta.hint}>
                            {meta.label}
                        </Badge>
                        <div className="text-muted-foreground mt-0.5 text-[11px]">
                            {r.status === 'late' && r.late_by != null && `${fmtMinutes(r.late_by)} past start`}
                            {['working', 'on_break', 'done'].includes(r.status) &&
                                r.tardiness_minutes > 0 &&
                                `Late ${fmtMinutes(r.tardiness_minutes)}`}
                            {r.status === 'on_leave' && r.leave}
                            {r.status === 'official_business' && r.official_business}
                        </div>
                    </div>
                );
            },
        },
        {
            id: 'time_in',
            accessorFn: (r) => r.dtr?.time_in ?? '',
            header: ({ column }) => <DataTableColumnHeader column={column} title="In" />,
            cell: ({ row: { original: r } }) => (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs whitespace-nowrap">
                    <Punch value={r.dtr?.time_in} />
                    {r.dtr?.location_status === 'out_of_bounds' && (
                        <span title="Punched outside the geofence">
                            <MapPinOff className="size-3.5 text-rose-500" />
                        </span>
                    )}
                </span>
            ),
        },
        {
            id: 'break',
            header: 'Break',
            cell: ({ row: { original: r } }) => (
                <span className="font-mono text-xs whitespace-nowrap">
                    <Punch value={r.dtr?.break_out} />
                    {r.dtr?.break_out && <span className="text-muted-foreground"> – {r.dtr.break_in ? fmtTime(r.dtr.break_in) : '…'}</span>}
                </span>
            ),
            enableSorting: false,
        },
        {
            id: 'time_out',
            accessorFn: (r) => r.dtr?.time_out ?? '',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Out" />,
            cell: ({ row: { original: r } }) => (
                <span className="font-mono text-xs whitespace-nowrap">
                    <Punch value={r.dtr?.time_out} />
                </span>
            ),
        },
    ];
}

type Props = {
    board: Board;
    canManage: boolean;
    onEdit: (row: BoardRow) => void;
    onViewTimesheet: (employeeId: number) => void;
};

export function TodayBoard({ board, canManage, onEdit, onViewTimesheet }: Props) {
    const [filter, setFilter] = React.useState<BoardStatus | 'all'>('all');
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

    const rows = React.useMemo(() => (filter === 'all' ? board.rows : board.rows.filter((r) => r.status === filter)), [board.rows, filter]);
    const columns = React.useMemo(() => todayColumns({ canManage, onEdit, onViewTimesheet }), [canManage, onEdit, onViewTimesheet]);

    return (
        <div className="space-y-4">
            {board.holiday && (
                <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                    <PartyPopper className="size-4" /> Today is <span className="font-semibold">{board.holiday}</span>. Anyone working gets holiday
                    premium pay.
                </div>
            )}

            {/* Summary */}
            <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="text-2xl font-bold tabular-nums">
                        {clockedIn}
                        <span className="text-muted-foreground text-base font-normal"> / {scheduled} scheduled in</span>
                    </div>
                    <div className="bg-muted mt-1 h-2 w-full overflow-hidden rounded-full sm:w-72">
                        <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${scheduled ? (clockedIn / scheduled) * 100 : 0}%` }}
                        />
                    </div>
                </div>
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    Updated {updatedAgo === 0 ? 'just now' : `${updatedAgo}m ago`}
                    <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
                        <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} /> Refresh
                    </Button>
                </div>
            </div>

            <DataTable
                columns={columns}
                data={rows}
                filterableColumns={{ employee: 'Name' }}
                filterPlaceholder="Find a person…"
                columnLabels={COLUMN_LABELS}
                enableRowSelection={false}
                toolbarFilterExtra={
                    <div className="flex flex-wrap gap-1.5">
                        <Chip active={filter === 'all'} onClick={() => setFilter('all')} label="Everyone" count={board.rows.length} />
                        {CHIP_ORDER.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
                            <Chip
                                key={s}
                                active={filter === s}
                                onClick={() => setFilter(s)}
                                label={BOARD_STATUS[s].label}
                                count={counts[s] ?? 0}
                                dot={DOT[BOARD_STATUS[s].tone]}
                            />
                        ))}
                    </div>
                }
                emptyTitle={board.rows.length === 0 ? 'No active employees in this branch.' : 'Nobody matches this filter.'}
            />
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

function Punch({ value }: { value?: string | null }) {
    return value ? <>{fmtTime(value)}</> : <span className="text-muted-foreground/60">—</span>;
}
