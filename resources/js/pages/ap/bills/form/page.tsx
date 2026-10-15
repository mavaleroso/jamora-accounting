import { formatAmount, todayIso } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Bills & Payables', href: '/ap/bills' },
    { title: 'Enter bill', href: '/ap/bills/create' },
];

type Vendor = { id: number; code: string; name: string };
type AccountOpt = { id: number; code: string; name: string; classification: string };
type Line = { description: string; account_id: number | ''; amount: string };
type Props = { vendors: Vendor[]; accounts: AccountOpt[]; vatRate: number; nextBillNo: string };

const VAT_OPTIONS = [
    { value: 'exclusive', label: 'VAT-exclusive (add 12%)', hint: 'Amounts entered are net; input VAT is added on top.' },
    { value: 'inclusive', label: 'VAT-inclusive', hint: 'Amounts include VAT; input VAT is extracted.' },
    { value: 'non_vat', label: 'Non-VAT supplier', hint: 'No input VAT can be claimed.' },
];

function addDays(iso: string, days: number) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BillFormPage({ vendors, accounts, vatRate, nextBillNo }: Props) {
    const form = useForm({
        vendor_id: '' as number | '',
        bill_no: nextBillNo,
        vendor_invoice_no: '',
        bill_date: todayIso(),
        due_date: addDays(todayIso(), 30),
        vat_treatment: 'exclusive',
        notes: '',
        lines: [{ description: '', account_id: '', amount: '' }] as Line[],
    });
    const { data, setData, errors, processing } = form;
    const err = errors as Record<string, string>;

    const totals = useMemo(() => {
        const sum = data.lines.reduce((s, l) => s + Number(l.amount || 0), 0);
        const r = (n: number) => Math.round(n * 100) / 100;
        if (data.vat_treatment === 'inclusive') {
            const vat = r((sum * vatRate) / (1 + vatRate));
            return { net: r(sum - vat), vat, total: r(sum) };
        }
        if (data.vat_treatment === 'non_vat') return { net: r(sum), vat: 0, total: r(sum) };
        const vat = r(sum * vatRate);
        return { net: r(sum), vat, total: r(sum + vat) };
    }, [data.lines, data.vat_treatment, vatRate]);

    const updateLine = (i: number, patch: Partial<Line>) =>
        setData(
            'lines',
            data.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)),
        );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Enter bill" />
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    form.post('/ap/bills');
                }}
            >
                <PageBody>
                    <PageHeader
                        title="Enter supplier bill"
                        description="Saved as a draft. Posting it records the payable and debits the selected expense accounts."
                        actions={
                            <>
                                <Button type="button" variant="outline" asChild>
                                    <Link href="/ap/bills">Cancel</Link>
                                </Button>
                                <Button type="submit" disabled={processing}>
                                    {processing ? 'Saving…' : 'Save draft'}
                                </Button>
                            </>
                        }
                    />

                    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
                        <div className="flex min-w-0 flex-col gap-5">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Supplier & terms</CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
                                        <Label>Supplier *</Label>
                                        <Combobox
                                            options={vendors.map((v) => ({ id: v.id, name: `${v.name} · ${v.code}` }))}
                                            value={data.vendor_id}
                                            onValueChange={(v) => setData('vendor_id', v)}
                                            placeholder="Search suppliers…"
                                        />
                                        <InputError message={errors.vendor_id} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label>Supplier invoice no.</Label>
                                        <Input
                                            value={data.vendor_invoice_no}
                                            onChange={(e) => setData('vendor_invoice_no', e.target.value)}
                                            className="font-mono"
                                            placeholder="As printed on their invoice"
                                        />
                                        <InputError message={errors.vendor_invoice_no} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label>Internal bill no. *</Label>
                                        <Input value={data.bill_no} onChange={(e) => setData('bill_no', e.target.value)} className="font-mono" />
                                        <InputError message={errors.bill_no} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label>Bill date *</Label>
                                        <Input type="date" value={data.bill_date} onChange={(e) => setData('bill_date', e.target.value)} />
                                        <InputError message={errors.bill_date} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label>Due date *</Label>
                                        <Input type="date" value={data.due_date} onChange={(e) => setData('due_date', e.target.value)} />
                                        <div className="flex gap-1">
                                            {[0, 15, 30, 60].map((d) => (
                                                <Button
                                                    key={d}
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-xs"
                                                    onClick={() => setData('due_date', addDays(data.bill_date, d))}
                                                >
                                                    {d === 0 ? 'On receipt' : `Net ${d}`}
                                                </Button>
                                            ))}
                                        </div>
                                        <InputError message={errors.due_date} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label>VAT treatment *</Label>
                                        <Select value={data.vat_treatment} onValueChange={(v) => setData('vat_treatment', v)}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {VAT_OPTIONS.map((o) => (
                                                    <SelectItem key={o.value} value={o.value}>
                                                        {o.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-muted-foreground text-xs">
                                            {VAT_OPTIONS.find((o) => o.value === data.vat_treatment)?.hint}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Expense lines</CardTitle>
                                    <CardDescription>
                                        Charge each line to the account it belongs to (e.g. Rent, Utilities, Inventory).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    <InputError message={errors.lines} />
                                    {data.lines.map((line, i) => (
                                        <div key={i} className="grid gap-3 rounded-lg border p-3 md:grid-cols-12">
                                            <div className="grid gap-1.5 md:col-span-5">
                                                <Label className="text-xs">Description *</Label>
                                                <Input
                                                    value={line.description}
                                                    onChange={(e) => updateLine(i, { description: e.target.value })}
                                                    placeholder="e.g. October store rent"
                                                />
                                                <InputError message={err[`lines.${i}.description`]} />
                                            </div>
                                            <div className="grid gap-1.5 md:col-span-4">
                                                <Label className="text-xs">Account *</Label>
                                                <Combobox
                                                    options={accounts.map((a) => ({ id: a.id, name: `${a.code} · ${a.name}` }))}
                                                    value={line.account_id}
                                                    onValueChange={(v) => updateLine(i, { account_id: v })}
                                                    placeholder="Select account"
                                                />
                                                <InputError message={err[`lines.${i}.account_id`]} />
                                            </div>
                                            <div className="grid gap-1.5 md:col-span-2">
                                                <Label className="text-xs">Amount *</Label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={line.amount}
                                                    onChange={(e) => updateLine(i, { amount: e.target.value })}
                                                    className="text-right font-mono"
                                                />
                                                <InputError message={err[`lines.${i}.amount`]} />
                                            </div>
                                            <div className="flex items-end md:col-span-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    disabled={data.lines.length === 1}
                                                    onClick={() =>
                                                        setData(
                                                            'lines',
                                                            data.lines.filter((_, j) => j !== i),
                                                        )
                                                    }
                                                >
                                                    <Trash2Icon className="size-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="self-start"
                                        onClick={() => setData('lines', [...data.lines, { description: '', account_id: '', amount: '' }])}
                                    >
                                        <PlusIcon className="size-4" />
                                        Add line
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Notes</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Textarea rows={3} value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="xl:sticky xl:top-4 xl:self-start">
                            <CardHeader>
                                <CardTitle className="text-base">Summary</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-2 text-sm">
                                <div className="flex justify-between">
                                    <span>Net amount</span>
                                    <span className="font-mono tabular-nums">{formatAmount(totals.net)}</span>
                                </div>
                                <div className="text-muted-foreground flex justify-between">
                                    <span>Input VAT</span>
                                    <span className="font-mono tabular-nums">{formatAmount(totals.vat)}</span>
                                </div>
                                <Separator className="my-1" />
                                <div className="flex items-baseline justify-between">
                                    <span className="font-medium">Amount payable</span>
                                    <span className="font-mono text-xl font-semibold tabular-nums">₱{formatAmount(totals.total)}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </PageBody>
            </form>
        </AppLayout>
    );
}
