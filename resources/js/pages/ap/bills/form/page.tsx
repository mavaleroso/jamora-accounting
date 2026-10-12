import { Head, router } from '@inertiajs/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import type { AccountOption, BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Bills', href: '/ap/bills' },
    { title: 'Create', href: '/ap/bills/create' },
];

type Vendor = { id: number; code: string; name: string };
type Line = { description: string; account_id: string; amount: string };

type Props = {
    vendors: Vendor[];
    accounts: AccountOption[];
};

export default function BillFormPage({ vendors, accounts }: Props) {
    const [vendorId, setVendorId] = React.useState('');
    const [lines, setLines] = React.useState<Line[]>([{ description: '', account_id: '', amount: '0' }]);
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set('vendor_id', vendorId);
        lines.forEach((line, i) => {
            fd.set(`lines[${i}][description]`, line.description);
            if (line.account_id) fd.set(`lines[${i}][account_id]`, line.account_id);
            fd.set(`lines[${i}][amount]`, line.amount);
        });
        setProcessing(true);
        router.post('/ap/bills', fd, { onFinish: () => setProcessing(false) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Create bill" />
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
                <Heading title="Create bill" description="New accounts payable bill" />
                <Card>
                    <CardHeader><CardTitle>Header</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label>Vendor *</Label>
                            <Select value={vendorId} onValueChange={setVendorId} required>
                                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                                <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.code} — {v.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div><Label>Bill no *</Label><Input name="bill_no" required /></div>
                        <div><Label>Vendor invoice no</Label><Input name="vendor_invoice_no" /></div>
                        <div><Label>Bill date *</Label><Input name="bill_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
                        <div><Label>Due date</Label><Input name="due_date" type="date" /></div>
                        <div className="sm:col-span-2"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Lines</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, { description: '', account_id: '', amount: '0' }])}>
                            <PlusIcon className="size-4" />Add line
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Account</TableHead><TableHead>Amount</TableHead><TableHead></TableHead></TableRow></TableHeader>
                            <TableBody>
                                {lines.map((line, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Input value={line.description} onChange={(e) => setLines((l) => l.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} required /></TableCell>
                                        <TableCell>
                                            <Select value={line.account_id} onValueChange={(v) => setLines((l) => l.map((x, j) => j === i ? { ...x, account_id: v } : x))}>
                                                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                                                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell><Input type="number" step="0.01" value={line.amount} onChange={(e) => setLines((l) => l.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} required /></TableCell>
                                        <TableCell>
                                            {lines.length > 1 && (
                                                <Button type="button" variant="ghost" size="icon" onClick={() => setLines((l) => l.filter((_, j) => j !== i))}>
                                                    <Trash2Icon className="size-4" />
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                <div className="flex gap-2">
                    <Button type="submit" disabled={processing || !vendorId}>{processing ? 'Saving...' : 'Create bill'}</Button>
                    <Button type="button" variant="outline" onClick={() => router.visit('/ap/bills')}>Cancel</Button>
                </div>
            </form>
        </AppLayout>
    );
}
