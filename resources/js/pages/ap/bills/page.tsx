import { Head, Link, router } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatPhpCurrency } from '@/lib/currency';
import type { BreadcrumbItem } from '@/types';
import { TableShell } from '@/components/ui/table-shell';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Bills', href: '/ap/bills' }];

type Vendor = { id: number; code: string; name: string };
type Bill = {
    id: number;
    bill_no: string;
    bill_date: string;
    status: string;
    total_amount: number;
    balance_due: number;
    vendor?: Vendor;
};

type Props = {
    bills: Bill[];
    totalBills: number;
    pageSize: number;
    currentPage: number;
};

export default function BillsPage({ bills, totalBills, currentPage }: Props) {
    const [payBillId, setPayBillId] = React.useState<number | null>(null);
    const [payAmount, setPayAmount] = React.useState('');
    const [payDate, setPayDate] = React.useState(new Date().toISOString().slice(0, 10));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bills" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Bills" description="Accounts payable bills" />
                    <Link href="/ap/bills/create"><Button><PlusIcon className="size-4" />Create bill</Button></Link>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Bill #</TableHead>
                                <TableHead>Vendor</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Balance</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bills.map((bill) => (
                                <TableRow key={bill.id}>
                                    <TableCell className="font-mono">{bill.bill_no}</TableCell>
                                    <TableCell>{bill.vendor?.name ?? '—'}</TableCell>
                                    <TableCell>{bill.bill_date}</TableCell>
                                    <TableCell><Badge variant="outline">{bill.status}</Badge></TableCell>
                                    <TableCell>{formatPhpCurrency(Number(bill.total_amount))}</TableCell>
                                    <TableCell>{formatPhpCurrency(Number(bill.balance_due))}</TableCell>
                                    <TableCell className="space-x-2">
                                        {bill.status === 'draft' && (
                                            <Button size="sm" variant="outline" onClick={() => router.post(`/ap/bills/${bill.id}/post`)}>Post</Button>
                                        )}
                                        {Number(bill.balance_due) > 0 && bill.status !== 'draft' && (
                                            <Button size="sm" onClick={() => { setPayBillId(bill.id); setPayAmount(String(bill.balance_due)); }}>Pay</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
                <p className="text-muted-foreground text-sm">{bills.length} of {totalBills} (page {currentPage})</p>
                {payBillId && (
                    <form className="flex flex-wrap items-end gap-2 rounded-xl border-2 border-border bg-muted/50 p-4 shadow-sm" onSubmit={(e) => {
                        e.preventDefault();
                        router.post(`/ap/bills/${payBillId}/pay`, { paid_date: payDate, amount: payAmount, payment_method: 'bank' }, {
                            onSuccess: () => setPayBillId(null),
                        });
                    }}>
                        <div><Label>Paid date</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
                        <div><Label>Amount</Label><Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
                        <Button type="submit">Record payment</Button>
                        <Button type="button" variant="outline" onClick={() => setPayBillId(null)}>Cancel</Button>
                    </form>
                )}
            </div>
        </AppLayout>
    );
}
