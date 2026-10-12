import { Head, router } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { TableShell } from '@/components/ui/table-shell';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Payroll periods', href: '/payroll/periods' }];

type Period = {
    id: number;
    code: string;
    start_date: string;
    end_date: string;
    pay_date?: string | null;
    status: string;
};

type Props = {
    periods: Period[];
    totalPeriods: number;
    pageSize: number;
    currentPage: number;
};

export default function PayrollPeriodsPage({ periods, totalPeriods, currentPage }: Props) {
    const [open, setOpen] = React.useState(false);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Payroll periods" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Payroll periods" description="Semi-monthly payroll periods" />
                    <Button onClick={() => setOpen(true)}><PlusIcon className="size-4" />Create period</Button>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Start</TableHead>
                                <TableHead>End</TableHead>
                                <TableHead>Pay date</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {periods.map((p) => (
                                <TableRow key={p.id}>
                                    <TableCell className="font-mono">{p.code}</TableCell>
                                    <TableCell>{p.start_date}</TableCell>
                                    <TableCell>{p.end_date}</TableCell>
                                    <TableCell>{p.pay_date ?? '—'}</TableCell>
                                    <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
                <p className="text-muted-foreground text-sm">{periods.length} of {totalPeriods} (page {currentPage})</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Create payroll period</DialogTitle></DialogHeader>
                    <form className="grid gap-4" onSubmit={(e) => {
                        e.preventDefault();
                        router.post('/payroll/periods', new FormData(e.currentTarget), { preserveScroll: true, onSuccess: () => setOpen(false) });
                    }}>
                        <div><Label>Code *</Label><Input name="code" required placeholder="2026-01-SM1" /></div>
                        <div><Label>Start date *</Label><Input name="start_date" type="date" required /></div>
                        <div><Label>End date *</Label><Input name="end_date" type="date" required /></div>
                        <div><Label>Pay date</Label><Input name="pay_date" type="date" /></div>
                        <Button type="submit">Create period</Button>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
