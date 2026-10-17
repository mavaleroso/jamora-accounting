import { DataTable, DataTableColumnHeader } from '@/components/data-table';
import { PersonAvatar } from '@/components/person-avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ColumnDef } from '@tanstack/react-table';
import * as React from 'react';
import { fullName, type LeaveTypeOption, type TeamBalanceRow } from '../lib';

/** Available / entitled credits per employee for every balance-tracked leave type. */
export function TeamBalances({
    rows,
    leaveTypes,
    year,
    today,
    onYear,
}: {
    rows: TeamBalanceRow[];
    leaveTypes: LeaveTypeOption[];
    year: number;
    today: string;
    onYear: (year: number) => void;
}) {
    const thisYear = Number(today.slice(0, 4));
    const tracked = React.useMemo(() => leaveTypes.filter((t) => t.balance_tracked), [leaveTypes]);

    const columns = React.useMemo<ColumnDef<TeamBalanceRow>[]>(
        () => [
            {
                id: 'employee',
                accessorFn: (r) => fullName(r.employee).toLowerCase(),
                header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
                filterFn: (row, _id, value: string) => {
                    const e = row.original.employee;
                    return `${fullName(e)} ${e.employee_code} ${e.position ?? ''} ${e.department ?? ''}`.toLowerCase().includes(value.toLowerCase());
                },
                enableHiding: false,
                cell: ({ row: { original: r } }) => (
                    <div className="flex min-w-[200px] items-center gap-2.5">
                        <PersonAvatar src={r.employee.avatar_url} seed={r.employee.employee_code} name={fullName(r.employee)} className="size-8" />
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{fullName(r.employee)}</div>
                            <div className="text-muted-foreground truncate text-[11px]">{r.employee.position ?? r.employee.employee_code}</div>
                        </div>
                    </div>
                ),
            },
            ...tracked.map(
                (t): ColumnDef<TeamBalanceRow> => ({
                    id: t.code,
                    // Sorts by days available; employees without this leave type sort last.
                    accessorFn: (r) => r.balances[t.code]?.available ?? -1,
                    header: ({ column }) => (
                        <div title={t.name}>
                            <DataTableColumnHeader column={column} title={t.code} className="justify-center" />
                        </div>
                    ),
                    cell: ({ row: { original: r } }) => {
                        const b = r.balances[t.code];
                        if (!b) return <div className="text-muted-foreground/50 text-center">—</div>;
                        const low = b.available !== null && b.available <= 1;
                        return (
                            <div className="text-center whitespace-nowrap tabular-nums" title={`${b.name}: ${b.used} used, ${b.reserved} pending`}>
                                <span className={cn('font-semibold', low && 'text-rose-600 dark:text-rose-400')}>{Number(b.available ?? 0)}</span>
                                <span className="text-muted-foreground">/{b.entitled}</span>
                                {b.reserved > 0 && (
                                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                        {b.reserved}
                                    </span>
                                )}
                            </div>
                        );
                    },
                }),
            ),
        ],
        [tracked],
    );

    return (
        <DataTable
            columns={columns}
            data={rows}
            filterableColumns={{ employee: 'Employee' }}
            filterPlaceholder="Search employee, position…"
            columnLabels={Object.fromEntries([['employee', 'Employee'], ...tracked.map((t) => [t.code, t.name])])}
            enableRowSelection={false}
            initialSorting={[{ id: 'employee', desc: false }]}
            title={`${year} leave credits`}
            description="Available of entitled days · amber = credits on hold for pending requests"
            toolbarFilterExtra={
                <Select value={String(year)} onValueChange={(v) => onYear(Number(v))}>
                    <SelectTrigger className="h-9 w-full lg:w-28" aria-label="Year">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
                            <SelectItem key={y} value={String(y)}>
                                {y}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            }
            emptyTitle="No employees match."
        />
    );
}
