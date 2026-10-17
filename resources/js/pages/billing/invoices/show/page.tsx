import { ConfirmDialog, useConfirm } from '@/components/confirm-dialog';
import { daysPastDue, formatAmount, formatDate, paymentMethodLabels, todayIso } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { StatusBadge } from '@/components/finance/status-badge';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { hasPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { BanknoteIcon, CheckCircle2Icon, PiggyBankIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

type Line = {
    id: number;
    line_no: number;
    line_type: string;
    description: string;
    quantity: string;
    unit_price: string;
    discount_amount: string;
    amount: string;
    notes: string | null;
};
type Payment = {
    id: number;
    paid_date: string;
    amount: string;
    payment_method: string;
    reference: string | null;
    bank_account?: { id: number; code: string; name: string } | null;
};
type Invoice = {
    id: number;
    invoice_no: string;
    bir_si_or_no: string | null;
    invoice_date: string;
    due_date: string | null;
    pricing_type: string;
    status: string;
    is_senior_pwd: boolean;
    is_vat_exempt: boolean;
    subtotal: string;
    discount_amount: string;
    vat_amount: string;
    total_amount: string;
    amount_paid: string;
    balance_due: string;
    notes: string | null;
    partner: { id: number; code: string; name: string; type: string; tin?: string | null; address?: string | null };
    lines: Line[];
    payments: Payment[];
    journal_entry?: { id: number; entry_no: string; status: string } | null;
};
type Deposit = { id: number; deposit_date: string; amount: string; applied_amount: string; reference: string | null; payment_method: string | null };
type BankAccount = { id: number; code: string; name: string; bank_name: string; is_shared: boolean };

type Props = { invoice: Invoice; openDeposits: Deposit[]; bankAccounts: BankAccount[]; paymentMethods: string[] };

const lineTypeLabel: Record<string, string> = { product: 'Product', service: 'Service', edging: 'Edging', repair: 'Repair', eye_exam: 'Eye exam' };

export default function InvoiceShowPage({ invoice, openDeposits, bankAccounts, paymentMethods }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canManage = hasPermission(auth, 'billing.manage');
    const canCollect = hasPermission(auth, 'billing.collect');
    const canAudit = hasPermission(auth, 'admin.audit-trails.view');
    const [payOpen, setPayOpen] = useState(false);
    const [depositOpen, setDepositOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const isOpen = ['confirmed', 'partially_paid'].includes(invoice.status);
    const late = isOpen ? daysPastDue(invoice.due_date) : 0;
    const balance = Number(invoice.balance_due);
    const grossLines = invoice.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);

    return (
        <AppLayout
            breadcrumbs={
                [
                    { title: 'Invoices & Billing', href: '/billing/invoices' },
                    { title: invoice.invoice_no, href: `/billing/invoices/${invoice.id}` },
                ] satisfies BreadcrumbItem[]
            }
        >
            <Head title={`Invoice ${invoice.invoice_no}`} />
            <PageBody>
                <PageHeader
                    title={invoice.invoice_no}
                    description={
                        <span className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={late > 0 ? 'overdue' : invoice.status} />
                            <span>{invoice.partner.name}</span>
                            <span>·</span>
                            <span className="capitalize">{invoice.pricing_type}</span>
                            {invoice.is_senior_pwd && <Badge variant="outline">Senior/PWD</Badge>}
                            {invoice.is_vat_exempt && !invoice.is_senior_pwd && <Badge variant="outline">VAT-exempt</Badge>}
                        </span>
                    }
                    actions={
                        <>
                            {invoice.status === 'draft' && canManage && (
                                <>
                                    <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                                        <Trash2Icon className="size-4" />
                                        Delete draft
                                    </Button>
                                    <Button onClick={() => setConfirmOpen(true)}>
                                        <CheckCircle2Icon className="size-4" />
                                        Confirm invoice
                                    </Button>
                                </>
                            )}
                            {isOpen && canCollect && openDeposits.length > 0 && (
                                <Button variant="outline" onClick={() => setDepositOpen(true)}>
                                    <PiggyBankIcon className="size-4" />
                                    Apply deposit
                                </Button>
                            )}
                            {isOpen && canCollect && (
                                <Button onClick={() => setPayOpen(true)}>
                                    <BanknoteIcon className="size-4" />
                                    Record payment
                                </Button>
                            )}
                        </>
                    }
                />

                <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                    <div className="flex min-w-0 flex-col gap-5">
                        <Card>
                            <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                <Field label="Bill to" value={invoice.partner.name} hint={invoice.partner.code} />
                                <Field label="BIR SI / OR no." value={invoice.bir_si_or_no || '—'} mono />
                                <Field label="Invoice date" value={formatDate(invoice.invoice_date)} />
                                <Field
                                    label="Due date"
                                    value={formatDate(invoice.due_date)}
                                    hint={late > 0 ? `${late} days overdue` : undefined}
                                    hintClass="text-red-600 dark:text-red-400 font-medium"
                                />
                            </CardContent>
                        </Card>

                        <TableShell>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">#</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Unit price</TableHead>
                                        <TableHead className="text-right">Discount</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoice.lines.map((l) => (
                                        <TableRow key={l.id}>
                                            <TableCell className="text-muted-foreground align-top">{l.line_no}</TableCell>
                                            <TableCell className="align-top">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{l.description}</span>
                                                    {l.line_type !== 'product' && (
                                                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                                                            {lineTypeLabel[l.line_type] ?? l.line_type}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {l.notes && <p className="text-muted-foreground mt-1 text-xs whitespace-pre-line">{l.notes}</p>}
                                            </TableCell>
                                            <TableCell className="text-right align-top tabular-nums">{Number(l.quantity).toLocaleString()}</TableCell>
                                            <TableCell className="text-right align-top font-mono tabular-nums">
                                                {formatAmount(l.unit_price)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-right align-top font-mono tabular-nums">
                                                {Number(l.discount_amount) > 0 ? formatAmount(-Number(l.discount_amount)) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right align-top font-mono tabular-nums">{formatAmount(l.amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-right">
                                            Gross amount
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">{formatAmount(grossLines)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </TableShell>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Payment history</CardTitle>
                                <CardDescription>Collections and applied deposits, oldest first.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {invoice.payments.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No payments recorded yet.</p>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Method</TableHead>
                                                <TableHead>Reference</TableHead>
                                                <TableHead>Deposited to</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {invoice.payments.map((p) => (
                                                <TableRow key={p.id}>
                                                    <TableCell>{formatDate(p.paid_date)}</TableCell>
                                                    <TableCell>{paymentMethodLabels[p.payment_method] ?? p.payment_method}</TableCell>
                                                    <TableCell className="font-mono text-xs">{p.reference || '—'}</TableCell>
                                                    <TableCell>{p.bank_account ? `${p.bank_account.code} · ${p.bank_account.name}` : '—'}</TableCell>
                                                    <TableCell className="text-right font-mono tabular-nums">{formatAmount(p.amount)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>

                        {invoice.notes && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Notes</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm whitespace-pre-line">{invoice.notes}</CardContent>
                            </Card>
                        )}
                    </div>

                    <div className="flex flex-col gap-5">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Totals</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-2 text-sm">
                                <Row label="Sales (net of VAT)" value={invoice.subtotal} />
                                {Number(invoice.discount_amount) > 0 && (
                                    <Row
                                        label={invoice.is_senior_pwd ? 'Discounts incl. Senior/PWD' : 'Discounts'}
                                        value={-Number(invoice.discount_amount)}
                                    />
                                )}
                                <Row label="Output VAT" value={invoice.vat_amount} muted />
                                <Separator className="my-1" />
                                <Row label="Invoice total" value={invoice.total_amount} strong />
                                <Row label="Paid / applied" value={-Number(invoice.amount_paid)} muted />
                                <Separator className="my-1" />
                                <div className="flex items-baseline justify-between">
                                    <span className="font-medium">Balance due</span>
                                    <span
                                        className={`font-mono text-xl font-semibold tabular-nums ${late > 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                                    >
                                        {formatPhpCurrency(balance)}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Accounting</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm">
                                {invoice.journal_entry ? (
                                    <div className="flex items-center justify-between">
                                        <span>
                                            Sales journal <span className="font-mono">{invoice.journal_entry.entry_no}</span>
                                        </span>
                                        <StatusBadge status={invoice.journal_entry.status} />
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground">Not yet posted. Confirm the invoice to record the receivable.</p>
                                )}
                                {canAudit && (
                                    <Link
                                        href={`/admin/audit-trails?search=${encodeURIComponent(invoice.invoice_no)}`}
                                        className="text-primary mt-3 inline-block text-xs hover:underline"
                                    >
                                        View audit history →
                                    </Link>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </PageBody>

            <PaymentDialog open={payOpen} onOpenChange={setPayOpen} invoice={invoice} bankAccounts={bankAccounts} methods={paymentMethods} />
            <DepositDialog open={depositOpen} onOpenChange={setDepositOpen} invoice={invoice} deposits={openDeposits} />
            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Confirm this invoice?"
                description={`This posts ${formatPhpCurrency(Number(invoice.total_amount))} to accounts receivable and the sales journal. Confirmed invoices can no longer be edited.`}
                confirmLabel="Confirm invoice"
                onConfirm={() =>
                    router.post(`/billing/invoices/${invoice.id}/confirm`, {}, { preserveScroll: true, onFinish: () => setConfirmOpen(false) })
                }
            />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete this draft?"
                description="The draft invoice and its lines will be removed. Nothing has been posted to the books yet."
                confirmLabel="Delete draft"
                variant="destructive"
                onConfirm={() => router.delete(`/billing/invoices/${invoice.id}`)}
            />
        </AppLayout>
    );
}

function Field({ label, value, hint, mono, hintClass }: { label: string; value: string; hint?: string; mono?: boolean; hintClass?: string }) {
    return (
        <div>
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono font-medium' : 'font-medium'}>{value}</div>
            {hint && <div className={hintClass ?? 'text-muted-foreground text-xs'}>{hint}</div>}
        </div>
    );
}

function Row({ label, value, muted, strong }: { label: string; value: number | string; muted?: boolean; strong?: boolean }) {
    return (
        <div className={`flex justify-between ${muted ? 'text-muted-foreground' : ''} ${strong ? 'font-medium' : ''}`}>
            <span>{label}</span>
            <span className="font-mono tabular-nums">{formatAmount(value)}</span>
        </div>
    );
}

function PaymentDialog({
    open,
    onOpenChange,
    invoice,
    bankAccounts,
    methods,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    invoice: Invoice;
    bankAccounts: BankAccount[];
    methods: string[];
}) {
    const form = useForm({
        paid_date: todayIso(),
        amount: Number(invoice.balance_due).toFixed(2),
        payment_method: 'cash',
        reference: '',
        bank_account_id: '',
    });
    const { data, setData, errors, processing } = form;
    const needsBank = ['check', 'bank_transfer'].includes(data.payment_method);
    const needsRef = data.payment_method !== 'cash';
    const confirm = useConfirm();

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await confirm({
            title: 'Record this collection?',
            description: `${formatPhpCurrency(Number(data.amount) || 0)} will be posted as received against invoice ${invoice.invoice_no}. Posted receipts cannot be edited.`,
            confirmLabel: 'Record collection',
        });
        if (!ok) return;
        form.transform((d) => ({ ...d, bank_account_id: needsBank ? d.bank_account_id : null }));
        form.post(`/billing/invoices/${invoice.id}/collect`, {
            preserveScroll: true,
            onSuccess: () => {
                onOpenChange(false);
                form.reset();
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>Record payment</DialogTitle>
                        <DialogDescription>
                            {invoice.invoice_no} · balance {formatPhpCurrency(Number(invoice.balance_due))}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label>Payment method</Label>
                        <ToggleGroup
                            type="single"
                            variant="outline"
                            value={data.payment_method}
                            onValueChange={(v) => v && setData('payment_method', v)}
                            className="w-full"
                        >
                            {methods.map((m) => (
                                <ToggleGroupItem key={m} value={m} className="flex-1 text-xs">
                                    {paymentMethodLabels[m] ?? m}
                                </ToggleGroupItem>
                            ))}
                        </ToggleGroup>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="paid_date">Date received</Label>
                            <Input id="paid_date" type="date" value={data.paid_date} onChange={(e) => setData('paid_date', e.target.value)} />
                            <InputError message={errors.paid_date} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label htmlFor="amount">Amount</Label>
                            <Input
                                id="amount"
                                type="number"
                                step="0.01"
                                min="0.01"
                                max={invoice.balance_due}
                                value={data.amount}
                                onChange={(e) => setData('amount', e.target.value)}
                                className="text-right font-mono"
                            />
                            <InputError message={errors.amount} />
                        </div>
                    </div>
                    {needsRef && (
                        <div className="grid gap-1.5">
                            <Label htmlFor="reference">
                                {data.payment_method === 'check'
                                    ? 'Check no.'
                                    : data.payment_method === 'gcash'
                                      ? 'GCash reference no.'
                                      : data.payment_method === 'card'
                                        ? 'Card approval code'
                                        : 'Transfer reference'}
                            </Label>
                            <Input
                                id="reference"
                                value={data.reference}
                                onChange={(e) => setData('reference', e.target.value)}
                                className="font-mono"
                            />
                            <InputError message={errors.reference} />
                        </div>
                    )}
                    {needsBank && (
                        <div className="grid gap-1.5">
                            <Label>Deposited to</Label>
                            <Select value={data.bank_account_id} onValueChange={(v) => setData('bank_account_id', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select bank account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                            {b.code} · {b.name} {b.is_shared ? '(shared)' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={errors.bank_account_id} />
                        </div>
                    )}
                    <p className="text-muted-foreground text-xs">
                        {data.payment_method === 'cash' && 'Debits Cash on Hand.'}
                        {data.payment_method === 'gcash' && 'Debits GCash Clearing until the wallet is settled to the bank.'}
                        {data.payment_method === 'card' && 'Debits Card Clearing until the acquirer settles.'}
                        {needsBank && 'Debits the selected bank and adds the receipt to its register for reconciliation.'}
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {processing ? 'Recording…' : 'Record payment'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function DepositDialog({
    open,
    onOpenChange,
    invoice,
    deposits,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    invoice: Invoice;
    deposits: Deposit[];
}) {
    const remaining = (d: Deposit) => Number(d.amount) - Number(d.applied_amount);
    const first = deposits[0];
    const form = useForm({
        customer_deposit_id: first ? String(first.id) : '',
        amount: first ? Math.min(remaining(first), Number(invoice.balance_due)).toFixed(2) : '',
        applied_date: todayIso(),
    });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();

    const choose = (id: string) => {
        const dep = deposits.find((d) => String(d.id) === id);
        setData((p) => ({
            ...p,
            customer_deposit_id: id,
            amount: dep ? Math.min(remaining(dep), Number(invoice.balance_due)).toFixed(2) : p.amount,
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="grid gap-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await confirm({
                            title: 'Apply this deposit?',
                            description: `${formatPhpCurrency(Number(data.amount) || 0)} of the customer's deposit will be applied to invoice ${invoice.invoice_no} and posted.`,
                            confirmLabel: 'Apply deposit',
                        });
                        if (!ok) return;
                        form.post(`/billing/invoices/${invoice.id}/apply-deposit`, { preserveScroll: true, onSuccess: () => onOpenChange(false) });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Apply customer deposit</DialogTitle>
                        <DialogDescription>
                            Moves the downpayment out of the Customer Deposits liability and reduces the invoice balance.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                        {deposits.map((d) => (
                            <label
                                key={d.id}
                                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${data.customer_deposit_id === String(d.id) ? 'border-primary bg-primary/5' : ''}`}
                            >
                                <span className="flex items-center gap-3">
                                    <input
                                        type="radio"
                                        name="deposit"
                                        checked={data.customer_deposit_id === String(d.id)}
                                        onChange={() => choose(String(d.id))}
                                    />
                                    <span>
                                        <span className="block font-medium">{formatDate(d.deposit_date)}</span>
                                        <span className="text-muted-foreground block text-xs">{d.reference || 'No reference'}</span>
                                    </span>
                                </span>
                                <span className="text-right">
                                    <span className="block font-mono tabular-nums">{formatAmount(remaining(d))}</span>
                                    <span className="text-muted-foreground block text-xs">of {formatAmount(d.amount)}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>Apply on</Label>
                            <Input type="date" value={data.applied_date} onChange={(e) => setData('applied_date', e.target.value)} />
                            <InputError message={errors.applied_date} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Amount to apply</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={data.amount}
                                onChange={(e) => setData('amount', e.target.value)}
                                className="text-right font-mono"
                            />
                            <InputError message={errors.amount || errors.customer_deposit_id} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing || !data.customer_deposit_id}>
                            Apply deposit
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
