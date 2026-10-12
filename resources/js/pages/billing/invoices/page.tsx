import { Head, Link, router } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Invoices', href: '/billing/invoices' }];

type Partner = { id: number; code: string; name: string };
type InvoiceLine = { id: number; line_no: number; description: string; quantity: number; unit_price: number; amount: number };
type Invoice = {
    id: number;
    invoice_no: string;
    bir_si_or_no?: string | null;
    invoice_date: string;
    due_date?: string | null;
    status: string;
    total_amount: number;
    amount_paid: number;
    balance_due: number;
    partner?: Partner;
    lines?: InvoiceLine[];
    payments?: { id: number; paid_date: string; amount: number; payment_method: string }[];
};

type Props = {
    invoices: Invoice[];
    totalInvoices: number;
    pageSize: number;
    currentPage: number;
    invoice?: Invoice;
    viewMode?: string;
};

export default function InvoicesPage({ invoices, totalInvoices, currentPage, invoice, viewMode }: Props) {
    const [collectAmount, setCollectAmount] = React.useState('');
    const [collectDate, setCollectDate] = React.useState(new Date().toISOString().slice(0, 10));

    if (viewMode === 'show' && invoice) {
        return (
            <AppLayout breadcrumbs={[...breadcrumbs, { title: invoice.invoice_no, href: `/billing/invoices/${invoice.id}` }]}>
                <Head title={`Invoice ${invoice.invoice_no}`} />
                <div className="flex flex-col gap-4 p-4">
                    <div className="flex items-center justify-between">
                        <Heading title={invoice.invoice_no} description={`Partner: ${invoice.partner?.name ?? '—'}`} />
                        <Link href="/billing/invoices"><Button variant="outline">Back to list</Button></Link>
                    </div>
                    <Card>
                        <CardHeader><CardTitle className="flex items-center gap-2">Status <Badge>{invoice.status}</Badge></CardTitle></CardHeader>
                        <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                            <div>Date: {invoice.invoice_date}</div>
                            <div>Total: {formatPhpCurrency(Number(invoice.total_amount))}</div>
                            <div>Balance: {formatPhpCurrency(Number(invoice.balance_due))}</div>
                        </CardContent>
                    </Card>
                    <TableShell>
                        <Table>
                            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Price</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {(invoice.lines ?? []).map((l) => (
                                    <TableRow key={l.id}><TableCell>{l.line_no}</TableCell><TableCell>{l.description}</TableCell><TableCell>{l.quantity}</TableCell><TableCell>{formatPhpCurrency(Number(l.unit_price))}</TableCell><TableCell>{formatPhpCurrency(Number(l.amount))}</TableCell></TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableShell>
                    <div className="flex flex-wrap gap-2">
                        {invoice.status === 'draft' && (
                            <Button onClick={() => router.post(`/billing/invoices/${invoice.id}/confirm`)}>Confirm</Button>
                        )}
                        {Number(invoice.balance_due) > 0 && invoice.status !== 'draft' && (
                            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
                                e.preventDefault();
                                router.post(`/billing/invoices/${invoice.id}/collect`, {
                                    paid_date: collectDate,
                                    amount: collectAmount,
                                    payment_method: 'cash',
                                });
                            }}>
                                <div><Label>Paid date</Label><Input type="date" value={collectDate} onChange={(e) => setCollectDate(e.target.value)} /></div>
                                <div><Label>Amount</Label><Input type="number" step="0.01" value={collectAmount} onChange={(e) => setCollectAmount(e.target.value)} placeholder={String(invoice.balance_due)} /></div>
                                <Button type="submit">Collect payment</Button>
                            </form>
                        )}
                    </div>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Invoices" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Invoices" description="Billing invoices" />
                    <Link href="/billing/invoices/create"><Button><PlusIcon className="size-4" />Create invoice</Button></Link>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Partner</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Total</TableHead>
                                <TableHead>Balance</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoices.map((inv) => (
                                <TableRow key={inv.id}>
                                    <TableCell className="font-mono">{inv.invoice_no}</TableCell>
                                    <TableCell>{inv.partner?.name ?? '—'}</TableCell>
                                    <TableCell>{inv.invoice_date}</TableCell>
                                    <TableCell><Badge variant="outline">{inv.status}</Badge></TableCell>
                                    <TableCell>{formatPhpCurrency(Number(inv.total_amount))}</TableCell>
                                    <TableCell>{formatPhpCurrency(Number(inv.balance_due))}</TableCell>
                                    <TableCell><Link href={`/billing/invoices/${inv.id}`}><Button variant="ghost" size="sm">View</Button></Link></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
                <p className="text-muted-foreground text-sm">{invoices.length} of {totalInvoices} (page {currentPage})</p>
            </div>
        </AppLayout>
    );
}
