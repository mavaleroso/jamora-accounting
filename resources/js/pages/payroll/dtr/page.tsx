import { Head, router } from '@inertiajs/react';
import { UploadIcon } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import type { BreadcrumbItem } from '@/types';
import { TableShell } from '@/components/ui/table-shell';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'DTR', href: '/payroll/dtr' }];

type Period = { id: number; code: string; start_date: string; end_date: string };
type Employee = { id: number; employee_code: string; firstname: string; lastname: string };
type Entry = {
    id: number;
    work_date: string;
    regular_hours: number;
    ot_hours: number;
    tardiness_minutes: number;
    is_absent: boolean;
    employee?: Employee;
};

type Props = {
    entries: Entry[];
    totalEntries: number;
    pageSize: number;
    currentPage: number;
    payrollPeriodId?: number | null;
    periods: Period[];
    employees: Employee[];
};

export default function DtrPage({ entries, totalEntries, currentPage, payrollPeriodId, periods, employees }: Props) {
    const [createOpen, setCreateOpen] = React.useState(false);
    const [importOpen, setImportOpen] = React.useState(false);
    const [employeeId, setEmployeeId] = React.useState('');
    const [periodId, setPeriodId] = React.useState(payrollPeriodId ? String(payrollPeriodId) : '');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Daily time records" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Daily time records" description="Attendance and overtime entries" />
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setImportOpen(true)}><UploadIcon className="size-4" />Import CSV</Button>
                        <Button onClick={() => setCreateOpen(true)}>Add entry</Button>
                    </div>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Employee</TableHead>
                                <TableHead>Regular hrs</TableHead>
                                <TableHead>OT hrs</TableHead>
                                <TableHead>Tardiness</TableHead>
                                <TableHead>Absent</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {entries.map((e) => (
                                <TableRow key={e.id}>
                                    <TableCell>{e.work_date}</TableCell>
                                    <TableCell>{e.employee ? `${e.employee.employee_code} — ${e.employee.firstname} ${e.employee.lastname}` : '—'}</TableCell>
                                    <TableCell>{e.regular_hours}</TableCell>
                                    <TableCell>{e.ot_hours}</TableCell>
                                    <TableCell>{e.tardiness_minutes} min</TableCell>
                                    <TableCell><Badge variant={e.is_absent ? 'destructive' : 'secondary'}>{e.is_absent ? 'Yes' : 'No'}</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
                <p className="text-muted-foreground text-sm">{entries.length} of {totalEntries} (page {currentPage})</p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add DTR entry</DialogTitle></DialogHeader>
                    <form className="grid gap-4" onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        fd.set('employee_id', employeeId);
                        if (periodId) fd.set('payroll_period_id', periodId);
                        router.post('/payroll/dtr', fd, { preserveScroll: true, onSuccess: () => setCreateOpen(false) });
                    }}>
                        <div>
                            <Label>Employee *</Label>
                            <Select value={employeeId} onValueChange={setEmployeeId} required>
                                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                                <SelectContent>{employees.map((emp) => <SelectItem key={emp.id} value={String(emp.id)}>{emp.employee_code} — {emp.firstname} {emp.lastname}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Payroll period</Label>
                            <Select value={periodId} onValueChange={setPeriodId}>
                                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                                <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.code}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div><Label>Work date *</Label><Input name="work_date" type="date" required /></div>
                        <div><Label>Regular hours</Label><Input name="regular_hours" type="number" step="0.01" defaultValue="8" /></div>
                        <div><Label>OT hours</Label><Input name="ot_hours" type="number" step="0.01" defaultValue="0" /></div>
                        <div><Label>Tardiness (minutes)</Label><Input name="tardiness_minutes" type="number" step="0.01" defaultValue="0" /></div>
                        <div className="flex items-center gap-2"><Input name="is_absent" type="checkbox" value="1" className="size-4" /><Label className="font-normal">Absent</Label></div>
                        <Button type="submit" disabled={!employeeId}>Save entry</Button>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Import CSV</DialogTitle></DialogHeader>
                    <form className="grid gap-4" onSubmit={(e) => {
                        e.preventDefault();
                        router.post('/payroll/dtr/import', new FormData(e.currentTarget), { preserveScroll: true, onSuccess: () => setImportOpen(false) });
                    }}>
                        <div><Label>CSV file *</Label><Input name="file" type="file" accept=".csv,.txt" required /></div>
                        <div><Label>Payroll period</Label>
                            <Select name="payroll_period_id">
                                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                                <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.code}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <Button type="submit">Import</Button>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
