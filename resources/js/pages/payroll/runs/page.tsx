import { Head, router } from '@inertiajs/react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import type { BreadcrumbItem } from '@/types';
import { TableShell } from '@/components/ui/table-shell';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Payroll runs', href: '/payroll/runs' }];

type Period = { id: number; code: string; start_date: string; end_date: string; status: string };
type Run = {
    id: number;
    run_no: string;
    status: string;
    gross_total: number;
    deduction_total: number;
    net_total: number;
    period?: Period;
};

type Props = {
    runs: Run[];
    totalRuns: number;
    pageSize: number;
    currentPage: number;
    periods: Period[];
};

export default function PayrollRunsPage({ runs, totalRuns, currentPage, periods }: Props) {
    const [periodId, setPeriodId] = React.useState('');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payroll runs" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Payroll runs" description="Compute and post payroll" />
                    <form className="flex items-end gap-2" onSubmit={(e) => {
                        e.preventDefault();
                        router.post('/payroll/runs/compute', { payroll_period_id: Number(periodId) });
                    }}>
                        <div>
                            <Label>Period</Label>
                            <Select value={periodId} onValueChange={setPeriodId}>
                                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Select period" /></SelectTrigger>
                                <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.code}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <Button type="submit" disabled={!periodId}>Compute payroll</Button>
                    </form>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Run #</TableHead>
                                <TableHead>Period</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Gross</TableHead>
                                <TableHead>Net</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {runs.map((run) => (
                                <TableRow key={run.id}>
                                    <TableCell className="font-mono">{run.run_no}</TableCell>
                                    <TableCell>{run.period?.code ?? '—'}</TableCell>
                                    <TableCell><Badge variant="outline">{run.status}</Badge></TableCell>
                                    <TableCell>{formatPhpCurrency(Number(run.gross_total))}</TableCell>
                                    <TableCell>{formatPhpCurrency(Number(run.net_total))}</TableCell>
                                    <TableCell>
                                        {run.status === 'computed' && (
                                            <Button size="sm" onClick={() => router.post(`/payroll/runs/${run.id}/post`)}>Post</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
                <p className="text-muted-foreground text-sm">{runs.length} of {totalRuns} (page {currentPage})</p>
            </div>
        </AppLayout>
    );
}
