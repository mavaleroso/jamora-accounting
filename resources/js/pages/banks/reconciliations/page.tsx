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

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Reconciliations', href: '/banks/reconciliations' }];

type BankAccount = { id: number; code: string; name: string; bank_name: string };
type Reconciliation = {
    id: number;
    statement_date: string;
    statement_ending_balance: number;
    cleared_balance: number;
    difference: number;
    status: string;
    bank_account?: BankAccount;
};

type Props = {
    reconciliations: Reconciliation[];
    bankAccounts: BankAccount[];
};

export default function ReconciliationsPage({ reconciliations, bankAccounts }: Props) {
    const [open, setOpen] = React.useState(false);
    const [bankAccountId, setBankAccountId] = React.useState('');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bank reconciliations" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Bank reconciliations" description="Reconcile bank statements" />
                    <Button onClick={() => setOpen(true)}><PlusIcon className="size-4" />Start reconciliation</Button>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Bank account</TableHead>
                                <TableHead>Statement date</TableHead>
                                <TableHead>Ending balance</TableHead>
                                <TableHead>Cleared</TableHead>
                                <TableHead>Difference</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {reconciliations.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell>{r.bank_account ? `${r.bank_account.code} — ${r.bank_account.name}` : '—'}</TableCell>
                                    <TableCell>{r.statement_date}</TableCell>
                                    <TableCell>{formatPhpCurrency(Number(r.statement_ending_balance))}</TableCell>
                                    <TableCell>{formatPhpCurrency(Number(r.cleared_balance))}</TableCell>
                                    <TableCell>{formatPhpCurrency(Number(r.difference))}</TableCell>
                                    <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                                    <TableCell>
                                        {r.status === 'open' && (
                                            <Button size="sm" onClick={() => router.post(`/banks/reconciliations/${r.id}/complete`)}>Complete</Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Start reconciliation</DialogTitle></DialogHeader>
                    <form className="grid gap-4" onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        fd.set('bank_account_id', bankAccountId);
                        router.post('/banks/reconciliations', fd, { preserveScroll: true, onSuccess: () => setOpen(false) });
                    }}>
                        <div>
                            <Label>Bank account *</Label>
                            <Select value={bankAccountId} onValueChange={setBankAccountId} required>
                                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                                <SelectContent>{bankAccounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div><Label>Statement date *</Label><Input name="statement_date" type="date" required /></div>
                        <div><Label>Ending balance *</Label><Input name="statement_ending_balance" type="number" step="0.01" required /></div>
                        <Button type="submit" disabled={!bankAccountId}>Start</Button>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
