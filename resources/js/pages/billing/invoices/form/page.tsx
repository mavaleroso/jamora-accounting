import { Head, router } from '@inertiajs/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Invoices', href: '/billing/invoices' },
    { title: 'Create', href: '/billing/invoices/create' },
];

type Partner = { id: number; code: string; name: string };

type Line = {
    description: string;
    quantity: string;
    unit_price: string;
    discount_amount: string;
};

type Props = { partners: Partner[] };

export default function InvoiceFormPage({ partners }: Props) {
    const [partnerId, setPartnerId] = React.useState('');
    const [pricingType, setPricingType] = React.useState('retail');
    const [lines, setLines] = React.useState<Line[]>([
        { description: '', quantity: '1', unit_price: '0', discount_amount: '0' },
    ]);
    const [processing, setProcessing] = React.useState(false);

    const updateLine = (index: number, field: keyof Line, value: string) => {
        setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        fd.set('partner_id', partnerId);
        fd.set('pricing_type', pricingType);
        lines.forEach((line, i) => {
            fd.set(`lines[${i}][description]`, line.description);
            fd.set(`lines[${i}][quantity]`, line.quantity);
            fd.set(`lines[${i}][unit_price]`, line.unit_price);
            fd.set(`lines[${i}][discount_amount]`, line.discount_amount);
        });
        setProcessing(true);
        router.post('/billing/invoices', fd, { onFinish: () => setProcessing(false) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Create invoice" />
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
                <Heading title="Create invoice" description="New billing invoice" />
                <Card>
                    <CardHeader><CardTitle>Header</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div>
                            <Label>Partner *</Label>
                            <Select value={partnerId} onValueChange={setPartnerId} required>
                                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                                <SelectContent>
                                    {partners.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.code} — {p.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div><Label>Invoice no *</Label><Input name="invoice_no" required /></div>
                        <div><Label>BIR SI/OR no</Label><Input name="bir_si_or_no" /></div>
                        <div><Label>Invoice date *</Label><Input name="invoice_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
                        <div><Label>Due date</Label><Input name="due_date" type="date" /></div>
                        <div>
                            <Label>Pricing type *</Label>
                            <Select value={pricingType} onValueChange={setPricingType}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="retail">Retail</SelectItem>
                                    <SelectItem value="wholesale">Wholesale</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-4 sm:col-span-2">
                            <div className="flex items-center gap-2"><Checkbox name="is_senior_pwd" value="1" /><Label className="font-normal">Senior/PWD</Label></div>
                            <div className="flex items-center gap-2"><Checkbox name="is_vat_exempt" value="1" /><Label className="font-normal">VAT exempt</Label></div>
                        </div>
                        <div className="sm:col-span-2"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Lines</CardTitle>
                        <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, { description: '', quantity: '1', unit_price: '0', discount_amount: '0' }])}>
                            <PlusIcon className="size-4" />Add line
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Qty</TableHead><TableHead>Unit price</TableHead><TableHead>Discount</TableHead><TableHead></TableHead></TableRow></TableHeader>
                            <TableBody>
                                {lines.map((line, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Input value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} required /></TableCell>
                                        <TableCell><Input type="number" step="0.0001" value={line.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} /></TableCell>
                                        <TableCell><Input type="number" step="0.01" value={line.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} /></TableCell>
                                        <TableCell><Input type="number" step="0.01" value={line.discount_amount} onChange={(e) => updateLine(i, 'discount_amount', e.target.value)} /></TableCell>
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
                    <Button type="submit" disabled={processing || !partnerId}>{processing ? 'Saving...' : 'Create invoice'}</Button>
                    <Button type="button" variant="outline" onClick={() => router.visit('/billing/invoices')}>Cancel</Button>
                </div>
            </form>
        </AppLayout>
    );
}
