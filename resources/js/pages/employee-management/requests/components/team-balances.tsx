import { Search } from 'lucide-react';
import * as React from 'react';
import { PersonAvatar } from '@/components/person-avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fullName, type LeaveTypeOption, type TeamBalanceRow } from '../lib';

/** Available / entitled credits per employee for every balance-tracked leave type. */
export function TeamBalances({ rows, leaveTypes, year, today, onYear }: { rows: TeamBalanceRow[]; leaveTypes: LeaveTypeOption[]; year: number; today: string; onYear: (year: number) => void }) {
    const [q, setQ] = React.useState('');
    const tracked = leaveTypes.filter((t) => t.balance_tracked);
    const thisYear = Number(today.slice(0, 4));
    const needle = q.trim().toLowerCase();
    const visible = needle
        ? rows.filter((r) => `${fullName(r.employee)} ${r.employee.employee_code} ${r.employee.position ?? ''} ${r.employee.department ?? ''}`.toLowerCase().includes(needle))
        : rows;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee, position…" className="pl-8" />
                </div>
                <Select value={String(year)} onValueChange={(v) => onYear(Number(v))}>
                    <SelectTrigger className="w-28">
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
                <p className="text-xs text-muted-foreground sm:ml-auto">Available of entitled days · amber = credits on hold for pending requests</p>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead className="min-w-56">Employee</TableHead>
                            {tracked.map((t) => (
                                <TableHead key={t.id} className="text-center whitespace-nowrap" title={t.name}>
                                    {t.code}
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visible.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={tracked.length + 1} className="h-24 text-center text-muted-foreground">
                                    No employees match.
                                </TableCell>
                            </TableRow>
                        ) : (
                            visible.map((r) => (
                                <TableRow key={r.employee.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2.5">
                                            <PersonAvatar src={r.employee.avatar_url} seed={r.employee.employee_code} name={fullName(r.employee)} className="size-8" />
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">{fullName(r.employee)}</div>
                                                <div className="truncate text-[11px] text-muted-foreground">{r.employee.position ?? r.employee.employee_code}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    {tracked.map((t) => {
                                        const b = r.balances[t.code];
                                        if (!b) {
                                            return (
                                                <TableCell key={t.id} className="text-center text-muted-foreground/50">
                                                    —
                                                </TableCell>
                                            );
                                        }
                                        const low = b.available !== null && b.available <= 1;
                                        return (
                                            <TableCell key={t.id} className="text-center tabular-nums" title={`${b.name}: ${b.used} used, ${b.reserved} pending`}>
                                                <span className={cn('font-semibold', low && 'text-rose-600 dark:text-rose-400')}>{Number(b.available ?? 0)}</span>
                                                <span className="text-muted-foreground">/{b.entitled}</span>
                                                {b.reserved > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-300">{b.reserved}</span>}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
