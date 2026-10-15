import { ConfirmDialog } from '@/components/confirm-dialog';
import { daysPastDue, formatAmount, formatDate, paymentMethodLabels, todayIso } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { StatusBadge } from '@/components/finance/status-badge';
import InputError from '@/components/input-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { hasPermission } from '@/lib/permissions';
import type { Auth } from '@/types';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { Building2Icon, CheckCircle2Icon, SendIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';

type Bill = {
    id: number;
    bill_no: string;
    vendor_invoice_no: string | null;
    bill_date: string;
    due_date: string | null;
    vat_treatment: string;
    status: string;
    subtotal: string;
    vat_amount: string;
    total_amount: string;
    amount_paid: string;
    balance_due: string;
    notes: string | null;
    vendor: { id: number; code: string; name: string; tin?: string | null };
    lines: { id: number; line_no: number; description: string; amount: string; account?: { id: number; code: string; name: string } | null }[];
    payments: {
        id: number;
        paid_date: string;
        amount: string;
        payment_method: string;
        reference: string | null;
        bank_account?: { code: string; name: string } | null;
    }[];
    journal_entry?: { id: number; entry_no: string; status: string } | null;
};
type BankAccount = { id: number; code: string; name: string; bank_name: string; is_shared: boolean };
type Props = { bill: Bill; bankAccounts: BankAccount[]; paymentMethods: string[]; entityName: string | null };

const vatLabel: Record<string, string> = { exclusive: 'VAT-exclusive', inclusive: 'VAT-inclusive', non_vat: 'Non-VAT supplier' };

export default function BillShowPage({ bill, bankAccounts, paymentMethods, entityName }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canManage = hasPermission(auth, 'ap.manage');
    const canPay = hasPermission(auth, 'ap.pay');
    const [payOpen, setPayOpen] = useState(false);
    const [postOpen, setPostOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    const open = ['posted', 'partially_paid'].includes(bill.status);
    const late = open ? daysPastDue(bill.due_date) : 0;

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Bills & Payables', href: '/ap/bills' },
                { title: bill.bill_no, href: `/ap/bills/${bill.id}` },
            ]}
        >
            <Head title={`Bill ${bill.bill_no}`} />
            <PageBody>
                <PageHeader
                    title={bill.bill_no}
                    description={
                        <span className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={late > 0 ? 'overdue' : bill.status} />
                            <span>{bill.vendor.name}</span>
                            <span>·</span>
                            <span>{vatLabel[bill.vat_treatment] ?? bill.vat_treatment}</span>
                        </span>
                    }
                    actions={
                        <>
                            {bill.status === 'draft' && canManage && (
                                <>
                                    <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                                        <Trash2Icon className="size-4" />
                                        Delete draft
                                    </Button>
                                    <Button onClick={() => setPostOpen(true)}>
                                        <CheckCircle2Icon className="size-4" />
                                        Post bill
                                    </Button>
                                </>
                            )}
                            {open && canPay && (
                                <Button onClick={() => setPayOpen(true)}>
                                    <SendIcon className="size-4" />
                                    Pay bill
                                </Button>
                            )}
                        </>
                    }
                />

                <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                    <div className="flex min-w-0 flex-col gap-5">
                        <Card>
                            <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                <Info
                                    label="Supplier"
                                    value={bill.vendor.name}
                                    hint={bill.vendor.tin ? `TIN ${bill.vendor.tin}` : bill.vendor.code}
                                />
                                <Info label="Supplier invoice no." value={bill.vendor_invoice_no || '—'} mono />
                                <Info label="Bill date" value={formatDate(bill.bill_date)} />
                                <Info
                                    label="Due date"
                                    value={formatDate(bill.due_date)}
                                    hint={late > 0 ? `${late} days overdue` : undefined}
                                    danger={late > 0}
                                />
                            </CardContent>
                        </Card>

                        <TableShell>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10">#</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bill.lines.map((l) => (
                                        <TableRow key={l.id}>
                                            <TableCell className="text-muted-foreground">{l.line_no}</TableCell>
                                            <TableCell className="font-medium">{l.description}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {l.account ? `${l.account.code} · ${l.account.name}` : '6400 · Miscellaneous'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">{formatAmount(l.amount)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableShell>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Payments</CardTitle>
                                <CardDescription>Disbursements recorded against this bill.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {bill.payments.length === 0 ? (
                                    <p className="text-muted-foreground text-sm">No payments yet.</p>
                                ) : (
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Method</TableHead>
                                                <TableHead>Reference</TableHead>
                                                <TableHead>Paid from</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {bill.payments.map((p) => (
                                                <TableRow key={p.id}>
                                                    <TableCell>{formatDate(p.paid_date)}</TableCell>
                                                    <TableCell>{paymentMethodLabels[p.payment_method] ?? p.payment_method}</TableCell>
                                                    <TableCell className="font-mono text-xs">{p.reference || '—'}</TableCell>
                                                    <TableCell>
                                                        {p.bank_account ? `${p.bank_account.code} · ${p.bank_account.name}` : 'Cash on hand'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono tabular-nums">{formatAmount(p.amount)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="flex flex-col gap-5">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Totals</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-2 text-sm">
                                <Line label="Net amount" value={bill.subtotal} />
                                <Line label="Input VAT" value={bill.vat_amount} muted />
                                <Separator className="my-1" />
                                <Line label="Bill total" value={bill.total_amount} strong />
                                <Line label="Paid" value={-Number(bill.amount_paid)} muted />
                                <Separator className="my-1" />
                                <div className="flex items-baseline justify-between">
                                    <span className="font-medium">Balance due</span>
                                    <span
                                        className={`font-mono text-xl font-semibold tabular-nums ${late > 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                                    >
                                        {formatPhpCurrency(Number(bill.balance_due))}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Accounting</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm">
                                {bill.journal_entry ? (
                                    <div className="flex items-center justify-between">
                                        <span>
                                            Purchases journal <span className="font-mono">{bill.journal_entry.entry_no}</span>
                                        </span>
                                        <StatusBadge status={bill.journal_entry.status} />
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground">Post the bill to record the payable.</p>
                                )}
                            </CardContent>
                        </Card>
                        {bill.notes && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-base">Notes</CardTitle>
                                </CardHeader>
                                <CardContent className="text-sm whitespace-pre-line">{bill.notes}</CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </PageBody>

            <PayDialog
                open={payOpen}
                onOpenChange={setPayOpen}
                bill={bill}
                bankAccounts={bankAccounts}
                methods={paymentMethods}
                entityName={entityName}
            />
            <ConfirmDialog
                open={postOpen}
                onOpenChange={setPostOpen}
                title="Post this bill?"
                description={`Records ${formatPhpCurrency(Number(bill.total_amount))} as a payable to ${bill.vendor.name}. Posted bills can no longer be edited.`}
                confirmLabel="Post bill"
                onConfirm={() => router.post(`/ap/bills/${bill.id}/post`, {}, { preserveScroll: true, onFinish: () => setPostOpen(false) })}
            />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete this draft?"
                description="The draft bill will be removed. Nothing has been posted yet."
                confirmLabel="Delete draft"
                variant="destructive"
                onConfirm={() => router.delete(`/ap/bills/${bill.id}`)}
            />
        </AppLayout>
    );
}

function Info({ label, value, hint, mono, danger }: { label: string; value: string; hint?: string; mono?: boolean; danger?: boolean }) {
    return (
        <div>
            <div className="text-muted-foreground text-xs">{label}</div>
            <div className={mono ? 'font-mono font-medium' : 'font-medium'}>{value}</div>
            {hint && <div className={danger ? 'text-xs font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground text-xs'}>{hint}</div>}
        </div>
    );
}

function Line({ label, value, muted, strong }: { label: string; value: number | string; muted?: boolean; strong?: boolean }) {
    return (
        <div className={`flex justify-between ${muted ? 'text-muted-foreground' : ''} ${strong ? 'font-medium' : ''}`}>
            <span>{label}</span>
            <span className="font-mono tabular-nums">{formatAmount(value)}</span>
        </div>
    );
}

function PayDialog({
    open,
    onOpenChange,
    bill,
    bankAccounts,
    methods,
    entityName,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    bill: Bill;
    bankAccounts: BankAccount[];
    methods: string[];
    entityName: string | null;
}) {
    const form = useForm({
        paid_date: todayIso(),
        amount: Number(bill.balance_due).toFixed(2),
        payment_method: 'check',
        reference: '',
        bank_account_id: bankAccounts[0] ? String(bankAccounts[0].id) : '',
    });
    const { data, setData, errors, processing } = form;
    const fromBank = ['check', 'bank_transfer'].includes(data.payment_method);
    const bank = bankAccounts.find((b) => String(b.id) === data.bank_account_id);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.transform((d) => ({ ...d, bank_account_id: fromBank ? d.bank_account_id : null }));
                        form.post(`/ap/bills/${bill.id}/pay`, { preserveScroll: true, onSuccess: () => onOpenChange(false) });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Pay bill</DialogTitle>
                        <DialogDescription>
                            {bill.bill_no} · {bill.vendor.name} · balance {formatPhpCurrency(Number(bill.balance_due))}
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
                    {fromBank && (
                        <div className="grid gap-1.5">
                            <Label>Paying account *</Label>
                            <Select value={data.bank_account_id} onValueChange={(v) => setData('bank_account_id', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select bank account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                            {b.code} · {b.name} {b.is_shared ? '(shared)' : '(dedicated)'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={errors.bank_account_id} />
                        </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>Payment date</Label>
                            <Input type="date" value={data.paid_date} onChange={(e) => setData('paid_date', e.target.value)} />
                            <InputError message={errors.paid_date} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Amount</Label>
                            <Input
                                type="number"
                                step="0.01"
                                min="0.01"
                                value={data.amount}
                                onChange={(e) => setData('amount', e.target.value)}
                                className="text-right font-mono"
                            />
                            <InputError message={errors.amount} />
                        </div>
                    </div>
                    {data.payment_method !== 'cash' && (
                        <div className="grid gap-1.5">
                            <Label>{data.payment_method === 'check' ? 'Check no. *' : 'Reference no. *'}</Label>
                            <Input value={data.reference} onChange={(e) => setData('reference', e.target.value)} className="font-mono" />
                            <InputError message={errors.reference} />
                        </div>
                    )}
                    <Alert>
                        <Building2Icon className="size-4" />
                        <AlertDescription className="text-xs">
                            Charged to <strong>{entityName ?? 'the current entity'}</strong>
                            {fromBank && bank?.is_shared
                                ? ` — this disbursement is tagged to ${entityName ?? 'this entity'} on the shared account so each entity's expenses stay separate.`
                                : '.'}
                        </AlertDescription>
                    </Alert>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            Record payment
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
