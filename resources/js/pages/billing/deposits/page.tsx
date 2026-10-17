import { ListTable, TableCard, TableEmpty } from '@/components/data-table';
import { FilterBar } from '@/components/finance/filter-bar';
import { formatAmount, formatDate, paymentMethodLabels, todayIso } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import { Progress } from '@/components/finance/progress';
import { StatusBadge } from '@/components/finance/status-badge';
import InputError from '@/components/input-error';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { useConfirm } from '@/components/confirm-dialog';
import { hasAnyPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { CalendarPlusIcon, CheckCheckIcon, PiggyBankIcon, PlusIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Customer Deposits', href: '/billing/deposits' }];

type Deposit = {
    id: number;
    deposit_date: string;
    amount: string;
    applied_amount: string;
    status: string;
    payment_method: string | null;
    reference: string | null;
    notes: string | null;
    partner?: { id: number; code: string; name: string } | null;
    invoice?: { id: number; invoice_no: string } | null;
    bank_account?: { id: number; code: string; name: string } | null;
};
type Option = { id: number; code: string; name: string; is_shared?: boolean };

type Props = {
    deposits: Paginated<Deposit>;
    filters: Record<string, string | null>;
    summary: { liability: number; openCount: number; appliedMtd: number; receivedMtd: number };
    partners: Option[];
    bankAccounts: Option[];
    paymentMethods: string[];
};

export default function DepositsPage({ deposits, filters, summary, partners, bankAccounts, paymentMethods }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canRecord = hasAnyPermission(auth, ['billing.manage', 'billing.collect']);
    const [open, setOpen] = useState(false);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Customer Deposits" />
            <PageBody>
                <PageHeader
                    title="Customer Deposits"
                    description="Downpayments on custom lens and frame orders. They stay a liability until applied to the completed order's invoice."
                    actions={
                        canRecord && (
                            <Button onClick={() => setOpen(true)}>
                                <PlusIcon className="size-4" />
                                Receive deposit
                            </Button>
                        )
                    }
                />

                <StatGrid>
                    <StatCard
                        title="Deposit liability"
                        value={formatPhpCurrency(summary.liability)}
                        icon={PiggyBankIcon}
                        tone="warning"
                        description="Unapplied balance owed to customers"
                    />
                    <StatCard
                        title="Open deposits"
                        value={summary.openCount.toLocaleString()}
                        icon={WalletIcon}
                        tone="info"
                        description="Waiting for order completion"
                    />
                    <StatCard title="Received this month" value={formatPhpCurrency(summary.receivedMtd)} icon={CalendarPlusIcon} />
                    <StatCard
                        title="Applied this month"
                        value={formatPhpCurrency(summary.appliedMtd)}
                        icon={CheckCheckIcon}
                        tone="success"
                        description="Moved to invoices"
                    />
                </StatGrid>

                <TableCard>
                    <FilterBar
                        url="/billing/deposits"
                        filters={filters}
                        searchPlaceholder="Customer or reference"
                        selects={[
                            {
                                key: 'status',
                                label: 'Statuses',
                                options: [
                                    { value: 'open', label: 'Open' },
                                    { value: 'applied', label: 'Applied' },
                                    { value: 'refunded', label: 'Refunded' },
                                ],
                            },
                        ]}
                        dateRange={{ from: 'date_from', to: 'date_to' }}
                    />
                    <ListTable
                        rows={deposits.data}
                        rowKey={(d) => d.id}
                        sequenceStart={deposits.from ?? 1}
                        columns={[
                            { id: 'date', header: 'Date', className: 'whitespace-nowrap', cell: (d) => formatDate(d.deposit_date) },
                            {
                                id: 'customer',
                                header: 'Customer',
                                cell: (d) => (
                                    <>
                                        <div className="font-medium">{d.partner?.name ?? '—'}</div>
                                        {d.notes && <div className="max-w-56 truncate text-xs text-muted-foreground">{d.notes}</div>}
                                    </>
                                ),
                            },
                            {
                                id: 'via',
                                header: 'Received via',
                                minScreen: 'lg',
                                cell: (d) => (
                                    <>
                                        <div>{paymentMethodLabels[d.payment_method ?? ''] ?? d.payment_method ?? '—'}</div>
                                        <div className="font-mono text-xs text-muted-foreground">{d.bank_account ? d.bank_account.code : d.reference || ''}</div>
                                    </>
                                ),
                            },
                            { id: 'status', header: 'Status', cell: (d) => <StatusBadge status={d.status} /> },
                            {
                                id: 'applied',
                                header: 'Applied to',
                                minScreen: 'lg',
                                cell: (d) =>
                                    d.invoice ? (
                                        <Link href={`/billing/invoices/${d.invoice.id}`} className="font-mono text-sm text-primary hover:underline">
                                            {d.invoice.invoice_no}
                                        </Link>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">Apply from the invoice</span>
                                    ),
                            },
                            { id: 'usage', header: 'Usage', minScreen: 'xl', headerClassName: 'w-40', cell: (d) => <Progress value={Number(d.amount) > 0 ? (Number(d.applied_amount) / Number(d.amount)) * 100 : 0} /> },
                            { id: 'amount', header: 'Amount', align: 'right', className: 'font-mono tabular-nums', cell: (d) => formatAmount(d.amount) },
                            { id: 'remaining', header: 'Remaining', align: 'right', className: 'font-mono font-medium tabular-nums', cell: (d) => formatAmount(Number(d.amount) - Number(d.applied_amount)) },
                        ]}
                        mobileRow={(d) => (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium">{d.partner?.name ?? '—'}</span>
                                    <span className="font-mono text-sm font-medium tabular-nums">{formatAmount(d.amount)}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    <StatusBadge status={d.status} />
                                    <span>{formatDate(d.deposit_date)}</span>
                                    <span>· {formatAmount(Number(d.amount) - Number(d.applied_amount))} left</span>
                                </div>
                            </div>
                        )}
                        empty={<TableEmpty icon={PiggyBankIcon} title="No deposits match these filters" description="Try a different search, status or date range." />}
                    />
                    <Paginator page={deposits} />
                </TableCard>
            </PageBody>

            <ReceiveDepositDialog open={open} onOpenChange={setOpen} partners={partners} bankAccounts={bankAccounts} methods={paymentMethods} />
        </AppLayout>
    );
}

function ReceiveDepositDialog({
    open,
    onOpenChange,
    partners,
    bankAccounts,
    methods,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    partners: Option[];
    bankAccounts: Option[];
    methods: string[];
}) {
    const form = useForm({
        partner_id: '' as number | '',
        deposit_date: todayIso(),
        amount: '',
        payment_method: 'cash',
        bank_account_id: '',
        reference: '',
        notes: '',
    });
    const { data, setData, errors, processing } = form;
    const needsBank = ['check', 'bank_transfer'].includes(data.payment_method);
    const confirm = useConfirm();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="grid gap-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await confirm({
                            title: 'Record this deposit?',
                            description: `${formatPhpCurrency(Number(data.amount) || 0)} will be posted as received and held as the customer's deposit.`,
                            confirmLabel: 'Record deposit',
                        });
                        if (!ok) return;
                        form.transform((d) => ({ ...d, bank_account_id: needsBank ? d.bank_account_id : null }));
                        form.post('/billing/deposits', {
                            preserveScroll: true,
                            onSuccess: () => {
                                onOpenChange(false);
                                form.reset();
                            },
                        });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Receive deposit</DialogTitle>
                        <DialogDescription>
                            Posts Dr Cash/Bank, Cr Customer Deposits. Apply it to the invoice once the order is released.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label>Customer *</Label>
                        <Combobox
                            options={partners.map((p) => ({ id: p.id, name: `${p.name} · ${p.code}` }))}
                            value={data.partner_id}
                            onValueChange={(v) => setData('partner_id', v)}
                            placeholder="Search customers…"
                        />
                        <InputError message={errors.partner_id} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>Date received *</Label>
                            <Input type="date" value={data.deposit_date} onChange={(e) => setData('deposit_date', e.target.value)} />
                            <InputError message={errors.deposit_date} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Amount *</Label>
                            <Input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={data.amount}
                                onChange={(e) => setData('amount', e.target.value)}
                                className="text-right font-mono"
                            />
                            <InputError message={errors.amount} />
                        </div>
                    </div>
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
                    {data.payment_method !== 'cash' && (
                        <div className="grid gap-1.5">
                            <Label>Reference no. *</Label>
                            <Input value={data.reference} onChange={(e) => setData('reference', e.target.value)} className="font-mono" />
                            <InputError message={errors.reference} />
                        </div>
                    )}
                    {needsBank && (
                        <div className="grid gap-1.5">
                            <Label>Deposited to *</Label>
                            <Select value={data.bank_account_id} onValueChange={(v) => setData('bank_account_id', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select bank account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                            {b.code} · {b.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={errors.bank_account_id} />
                        </div>
                    )}
                    <div className="grid gap-1.5">
                        <Label>Order details</Label>
                        <Textarea
                            rows={2}
                            value={data.notes}
                            onChange={(e) => setData('notes', e.target.value)}
                            placeholder="e.g. Progressive lenses + frame, promised Oct 22"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            Record deposit
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
