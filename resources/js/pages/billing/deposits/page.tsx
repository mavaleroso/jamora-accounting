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

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Deposits', href: '/billing/deposits' }];

type Partner = { id: number; code: string; name: string };
type Deposit = {
    id: number;
    deposit_date: string;
    amount: number;
    status: string;
    payment_method?: string | null;
    reference?: string | null;
    partner?: Partner;
};

type Props = {
    deposits: Deposit[];
    totalDeposits: number;
    pageSize: number;
    currentPage: number;
    partners: Partner[];
};

export default function DepositsPage({ deposits, totalDeposits, currentPage, partners }: Props) {
    const [open, setOpen] = React.useState(false);
    const [partnerId, setPartnerId] = React.useState('');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Customer deposits" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Customer deposits" description="Advance payments from partners" />
                    <Button onClick={() => setOpen(true)}><PlusIcon className="size-4" />Record deposit</Button>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Partner</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Reference</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {deposits.map((d) => (
                                <TableRow key={d.id}>
                                    <TableCell>{d.deposit_date}</TableCell>
                                    <TableCell>{d.partner?.name ?? '—'}</TableCell>
                                    <TableCell>{formatPhpCurrency(Number(d.amount))}</TableCell>
                                    <TableCell><Badge variant="outline">{d.status}</Badge></TableCell>
                                    <TableCell>{d.reference ?? '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
                <p className="text-muted-foreground text-sm">{deposits.length} of {totalDeposits} (page {currentPage})</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Record deposit</DialogTitle></DialogHeader>
                    <form className="grid gap-4" onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        fd.set('partner_id', partnerId);
                        router.post('/billing/deposits', fd, { preserveScroll: true, onSuccess: () => { setOpen(false); setPartnerId(''); } });
                    }}>
                        <div>
                            <Label>Partner *</Label>
                            <Select value={partnerId} onValueChange={setPartnerId} required>
                                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                                <SelectContent>{partners.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div><Label>Deposit date *</Label><Input name="deposit_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
                        <div><Label>Amount *</Label><Input name="amount" type="number" step="0.01" required /></div>
                        <div><Label>Payment method</Label><Input name="payment_method" /></div>
                        <div><Label>Reference</Label><Input name="reference" /></div>
                        <Button type="submit" disabled={!partnerId}>Save deposit</Button>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
