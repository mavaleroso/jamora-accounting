import { formatAmount, todayIso } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import InputError from '@/components/input-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { Head, Link, useForm } from '@inertiajs/react';
import { InfoIcon, MessageSquarePlusIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Invoices & Billing', href: '/billing/invoices' },
    { title: 'New invoice', href: '/billing/invoices/create' },
];

type Partner = { id: number; code: string; name: string; type: string };
type Item = {
    id: number;
    sku: string;
    name: string;
    category: string | null;
    selling_price: string;
    wholesale_price: string | null;
    qty_on_hand: string;
};

const LINE_TYPES = [
    { value: 'product', label: 'Product' },
    { value: 'eye_exam', label: 'Eye exam' },
    { value: 'service', label: 'Service' },
    { value: 'edging', label: 'Edging' },
    { value: 'repair', label: 'Repair' },
] as const;

type Line = {
    line_type: string;
    inventory_item_id: number | '';
    description: string;
    quantity: string;
    unit_price: string;
    discount_amount: string;
    notes: string;
    showNotes?: boolean;
};

type Props = {
    partners: Partner[];
    items: Item[];
    vatRate: number;
    seniorDiscountRate: number;
    nextInvoiceNo: string;
};

const blankLine = (): Line => ({
    line_type: 'product',
    inventory_item_id: '',
    description: '',
    quantity: '1',
    unit_price: '0.00',
    discount_amount: '0.00',
    notes: '',
});
const round2 = (n: number) => Math.round(n * 100) / 100;

const TERMS = [
    { label: 'Due on receipt', days: 0 },
    { label: 'Net 15', days: 15 },
    { label: 'Net 30', days: 30 },
    { label: 'Net 60', days: 60 },
];

function addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function InvoiceFormPage({ partners, items, vatRate, seniorDiscountRate, nextInvoiceNo }: Props) {
    const form = useForm({
        partner_id: '' as number | '',
        invoice_no: nextInvoiceNo,
        bir_si_or_no: '',
        invoice_date: todayIso(),
        due_date: todayIso(),
        pricing_type: 'retail' as 'retail' | 'wholesale',
        is_senior_pwd: false,
        is_vat_exempt: false,
        notes: '',
        lines: [blankLine()] as Line[],
    });
    const { data, setData, errors, processing } = form;
    const [terms, setTerms] = useState('0');

    const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
    const priceFor = (item: Item, pricing: string) => (pricing === 'wholesale' && item.wholesale_price ? item.wholesale_price : item.selling_price);

    const updateLine = (index: number, patch: Partial<Line>) =>
        setData(
            'lines',
            data.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)),
        );

    const pickItem = (index: number, id: number | '') => {
        const item = id === '' ? undefined : itemById.get(id);
        updateLine(index, {
            inventory_item_id: id,
            description: item ? item.name : data.lines[index].description,
            unit_price: item ? Number(priceFor(item, data.pricing_type)).toFixed(2) : data.lines[index].unit_price,
        });
    };

    // Switching retail ↔ wholesale re-prices every line that came from the item list.
    const changePricing = (pricing: 'retail' | 'wholesale') => {
        setData((prev) => ({
            ...prev,
            pricing_type: pricing,
            lines: prev.lines.map((l) => {
                const item = l.inventory_item_id === '' ? undefined : itemById.get(l.inventory_item_id);
                return item ? { ...l, unit_price: Number(priceFor(item, pricing)).toFixed(2) } : l;
            }),
        }));
    };

    const changeDate = (date: string) => setData((prev) => ({ ...prev, invoice_date: date, due_date: addDays(date, Number(terms)) }));

    // Mirrors InvoiceService::computeTotals so staff see exactly what will be booked.
    const totals = useMemo(() => {
        const gross = data.lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0);
        const lineDiscounts = data.lines.reduce((s, l) => s + Number(l.discount_amount || 0), 0);
        const net = Math.max(0, gross - lineDiscounts);

        if (data.is_senior_pwd) {
            const base = round2(net / (1 + vatRate));
            const senior = round2(base * seniorDiscountRate);
            return { gross, lineDiscounts, vatRemoved: round2(net - base), senior, vat: 0, vatable: 0, total: round2(base - senior) };
        }
        const vat = data.is_vat_exempt ? 0 : round2((net * vatRate) / (1 + vatRate));
        return { gross, lineDiscounts, vatRemoved: 0, senior: 0, vat, vatable: data.is_vat_exempt ? 0 : round2(net - vat), total: round2(net) };
    }, [data.lines, data.is_senior_pwd, data.is_vat_exempt, vatRate, seniorDiscountRate]);

    const confirm = useConfirm();
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await confirm({
            title: 'Create this invoice?',
            description: `The ${formatAmount(totals.total, { currency: true })} invoice is saved as a draft. Nothing is posted until you confirm it.`,
            confirmLabel: 'Create invoice',
        });
        if (!ok) return;
        form.transform((d) => ({
            ...d,
            lines: d.lines.map((l) => ({
                line_type: l.line_type,
                description: l.description,
                quantity: l.quantity,
                unit_price: l.unit_price,
                discount_amount: l.discount_amount,
                notes: l.notes,
                inventory_item_id: l.inventory_item_id === '' ? null : l.inventory_item_id,
            })),
        }));
        form.post('/billing/invoices');
    };

    const lineError = (i: number, field: string) => (errors as Record<string, string>)[`lines.${i}.${field}`];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="New invoice" />
            <form onSubmit={submit}>
                <PageBody>
                    <PageHeader
                        title="New invoice"
                        description="Saved as a draft. Confirming it posts the sale to receivables and the sales journal."
                        actions={
                            <>
                                <Button type="button" variant="outline" asChild>
                                    <Link href="/billing/invoices">Cancel</Link>
                                </Button>
                                <Button type="submit" disabled={processing}>
                                    {processing ? 'Saving…' : 'Save draft'}
                                </Button>
                            </>
                        }
                    />

                    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
                        <div className="flex min-w-0 flex-col gap-5">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Customer & reference</CardTitle>
                                    <CardDescription>Enter the number printed on the manually issued BIR-accredited invoice / OR.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
                                        <Label>Customer / patient *</Label>
                                        <Combobox
                                            options={partners.map((p) => ({ id: p.id, name: `${p.name} · ${p.code}` }))}
                                            value={data.partner_id}
                                            onValueChange={(v) => setData('partner_id', v)}
                                            placeholder="Search customers…"
                                            aria-invalid={!!errors.partner_id}
                                        />
                                        <InputError message={errors.partner_id} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="invoice_no">System invoice no. *</Label>
                                        <Input
                                            id="invoice_no"
                                            value={data.invoice_no}
                                            onChange={(e) => setData('invoice_no', e.target.value)}
                                            className="font-mono"
                                        />
                                        <InputError message={errors.invoice_no} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="bir">BIR SI / OR no.</Label>
                                        <Input
                                            id="bir"
                                            value={data.bir_si_or_no}
                                            onChange={(e) => setData('bir_si_or_no', e.target.value)}
                                            placeholder="From the official booklet"
                                            className="font-mono"
                                        />
                                        <InputError message={errors.bir_si_or_no} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="invoice_date">Invoice date *</Label>
                                        <Input id="invoice_date" type="date" value={data.invoice_date} onChange={(e) => changeDate(e.target.value)} />
                                        <InputError message={errors.invoice_date} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label>Terms</Label>
                                        <Select
                                            value={terms}
                                            onValueChange={(v) => {
                                                setTerms(v);
                                                setData('due_date', addDays(data.invoice_date, Number(v)));
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {TERMS.map((t) => (
                                                    <SelectItem key={t.days} value={String(t.days)}>
                                                        {t.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="due_date">Due date</Label>
                                        <Input
                                            id="due_date"
                                            type="date"
                                            value={data.due_date}
                                            onChange={(e) => setData('due_date', e.target.value)}
                                        />
                                        <InputError message={errors.due_date} />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-1.5">
                                        <CardTitle className="text-base">Line items</CardTitle>
                                        <CardDescription>
                                            Prices are VAT-inclusive. Pick an item to use its {data.pricing_type} price.
                                        </CardDescription>
                                    </div>
                                    <ToggleGroup
                                        type="single"
                                        variant="outline"
                                        size="sm"
                                        value={data.pricing_type}
                                        onValueChange={(v) => v && changePricing(v as 'retail' | 'wholesale')}
                                    >
                                        <ToggleGroupItem value="retail" className="px-3">
                                            Retail
                                        </ToggleGroupItem>
                                        <ToggleGroupItem value="wholesale" className="px-3">
                                            Wholesale
                                        </ToggleGroupItem>
                                    </ToggleGroup>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-3">
                                    <InputError message={errors.lines} />
                                    {data.lines.map((line, i) => {
                                        const amount = Number(line.quantity || 0) * Number(line.unit_price || 0) - Number(line.discount_amount || 0);
                                        return (
                                            <div key={i} className="bg-muted/20 rounded-lg border p-3">
                                                <div className="grid gap-3 md:grid-cols-12">
                                                    <div className="grid gap-1.5 md:col-span-2">
                                                        <Label className="text-xs">Type</Label>
                                                        <Select
                                                            value={line.line_type}
                                                            onValueChange={(v) =>
                                                                updateLine(i, {
                                                                    line_type: v,
                                                                    inventory_item_id: v === 'product' ? line.inventory_item_id : '',
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {LINE_TYPES.map((t) => (
                                                                    <SelectItem key={t.value} value={t.value}>
                                                                        {t.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div className="grid gap-1.5 md:col-span-4">
                                                        <Label className="text-xs">
                                                            {line.line_type === 'product' ? 'Item / description *' : 'Description *'}
                                                        </Label>
                                                        {line.line_type === 'product' && items.length > 0 && (
                                                            <Combobox
                                                                options={items.map((it) => ({ id: it.id, name: `${it.name} · ${it.sku}` }))}
                                                                value={line.inventory_item_id}
                                                                onValueChange={(v) => pickItem(i, v)}
                                                                placeholder="Pick from inventory (optional)"
                                                            />
                                                        )}
                                                        <Input
                                                            value={line.description}
                                                            onChange={(e) => updateLine(i, { description: e.target.value })}
                                                            placeholder={
                                                                line.line_type === 'edging' ? 'e.g. Edging — progressive lens pair' : 'Description'
                                                            }
                                                            aria-invalid={!!lineError(i, 'description')}
                                                        />
                                                        <InputError message={lineError(i, 'description')} />
                                                    </div>
                                                    <div className="grid gap-1.5 md:col-span-1">
                                                        <Label className="text-xs">Qty</Label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={line.quantity}
                                                            onChange={(e) => updateLine(i, { quantity: e.target.value })}
                                                            className="text-right"
                                                        />
                                                        <InputError message={lineError(i, 'quantity')} />
                                                    </div>
                                                    <div className="grid gap-1.5 md:col-span-2">
                                                        <Label className="text-xs">Unit price</Label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={line.unit_price}
                                                            onChange={(e) => updateLine(i, { unit_price: e.target.value })}
                                                            className="text-right font-mono"
                                                        />
                                                    </div>
                                                    <div className="grid gap-1.5 md:col-span-1">
                                                        <Label className="text-xs">Discount</Label>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={line.discount_amount}
                                                            onChange={(e) => updateLine(i, { discount_amount: e.target.value })}
                                                            className="text-right font-mono"
                                                        />
                                                    </div>
                                                    <div className="flex items-end justify-between gap-2 md:col-span-2">
                                                        <div className="grid gap-1.5">
                                                            <Label className="text-muted-foreground text-xs">Amount</Label>
                                                            <div className="h-9 py-2 font-mono text-sm font-medium tabular-nums">
                                                                {formatAmount(amount)}
                                                            </div>
                                                        </div>
                                                        <div className="flex">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                title="Add note"
                                                                onClick={() => updateLine(i, { showNotes: !line.showNotes })}
                                                            >
                                                                <MessageSquarePlusIcon className="size-4" />
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="icon"
                                                                title="Remove line"
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
                                                </div>
                                                {(line.showNotes || line.notes) && (
                                                    <Textarea
                                                        className="mt-3"
                                                        rows={2}
                                                        value={line.notes}
                                                        onChange={(e) => updateLine(i, { notes: e.target.value })}
                                                        placeholder={
                                                            ['edging', 'repair'].includes(line.line_type)
                                                                ? 'Job notes — frame, lens, Rx, promised date…'
                                                                : 'Line notes'
                                                        }
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="self-start"
                                        onClick={() => setData('lines', [...data.lines, blankLine()])}
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
                                    <Textarea
                                        rows={3}
                                        value={data.notes}
                                        onChange={(e) => setData('notes', e.target.value)}
                                        placeholder="Internal notes (not printed)"
                                    />
                                </CardContent>
                            </Card>
                        </div>

                        <div className="flex flex-col gap-5 xl:sticky xl:top-4 xl:self-start">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Tax treatment</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    <label className="flex items-start justify-between gap-3">
                                        <span>
                                            <span className="block text-sm font-medium">Senior citizen / PWD</span>
                                            <span className="text-muted-foreground block text-xs">
                                                VAT-exempt plus {seniorDiscountRate * 100}% discount on the VAT-exclusive price.
                                            </span>
                                        </span>
                                        <Switch
                                            checked={data.is_senior_pwd}
                                            onCheckedChange={(v) =>
                                                setData((p) => ({ ...p, is_senior_pwd: v, is_vat_exempt: v ? true : p.is_vat_exempt }))
                                            }
                                        />
                                    </label>
                                    <label className="flex items-start justify-between gap-3">
                                        <span>
                                            <span className="block text-sm font-medium">VAT-exempt sale</span>
                                            <span className="text-muted-foreground block text-xs">No output VAT is charged.</span>
                                        </span>
                                        <Switch
                                            checked={data.is_vat_exempt}
                                            disabled={data.is_senior_pwd}
                                            onCheckedChange={(v) => setData('is_vat_exempt', v)}
                                        />
                                    </label>
                                    {data.is_senior_pwd && (
                                        <Alert>
                                            <InfoIcon className="size-4" />
                                            <AlertDescription className="text-xs">
                                                Record the senior/PWD ID number in the notes for BIR substantiation.
                                            </AlertDescription>
                                        </Alert>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Summary</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-2 text-sm">
                                    <SummaryRow label="Gross amount" value={totals.gross} />
                                    {totals.lineDiscounts > 0 && <SummaryRow label="Line discounts" value={-totals.lineDiscounts} />}
                                    {data.is_senior_pwd ? (
                                        <>
                                            <SummaryRow label="Less: VAT (exempt)" value={-totals.vatRemoved} />
                                            <SummaryRow label={`Less: Senior/PWD ${seniorDiscountRate * 100}%`} value={-totals.senior} />
                                        </>
                                    ) : (
                                        <>
                                            <SummaryRow
                                                label={data.is_vat_exempt ? 'VAT-exempt sales' : 'VATable sales'}
                                                value={data.is_vat_exempt ? totals.total : totals.vatable}
                                                muted
                                            />
                                            <SummaryRow label={`VAT (${vatRate * 100}%)`} value={totals.vat} muted />
                                        </>
                                    )}
                                    <Separator className="my-1" />
                                    <div className="flex items-baseline justify-between">
                                        <span className="font-medium">Amount due</span>
                                        <span className="font-mono text-xl font-semibold tabular-nums">₱{formatAmount(totals.total)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </PageBody>
            </form>
        </AppLayout>
    );
}

function SummaryRow({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
    return (
        <div className={muted ? 'text-muted-foreground flex justify-between' : 'flex justify-between'}>
            <span>{label}</span>
            <span className="font-mono tabular-nums">{formatAmount(value)}</span>
        </div>
    );
}
