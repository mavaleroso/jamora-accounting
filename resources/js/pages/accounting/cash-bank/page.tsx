import { ListTable, TableCard, TableEmpty } from '@/components/data-table';
import { FilterBar } from '@/components/finance/filter-bar';
import { formatAmount, formatDate, paymentMethodLabels, todayIso } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import { StatusBadge } from '@/components/finance/status-badge';
import InputError from '@/components/input-error';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { useConfirm } from '@/components/confirm-dialog';
import { hasAnyPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { ArrowDownLeftIcon, ArrowLeftRightIcon, ArrowUpRightIcon, FileClockIcon, InfoIcon, MinusIcon, PlusIcon, ScaleIcon } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Cash & Bank Records', href: '/accounting/cash-bank-records' }];

type CashAccount = { id: number; code: string; name: string };
type Row = {
    id: number;
    journal_entry_id: number;
    entry_no: string;
    entry_date: string;
    reference: string | null;
    memo: string | null;
    status: string;
    direction: 'in' | 'out';
    amount: number;
    account: CashAccount | null;
    source_type: string;
    source_url: string | null;
    is_cleared: boolean | null | undefined;
};
type BankAccount = { id: number; code: string; name: string; bank_name: string };
type TransferEndpoint = { value: string; label: string; kind: 'clearing' | 'bank' };
type CounterAccount = { id: number; code: string; name: string; classification: string | null };

type Props = {
    transactions: Paginated<Row>;
    filters: Record<string, string | number | null>;
    summary: { inflows: number; outflows: number; net: number; draftCount: number };
    cashAccounts: CashAccount[];
    bankAccounts: BankAccount[];
    transferEndpoints: TransferEndpoint[];
    counterAccounts: CounterAccount[];
    paymentMethods: string[];
    entityName: string | null;
};

const sourceLabel: Record<string, string> = {
    invoice_payment: 'Invoice collection',
    customer_deposit: 'Customer deposit',
    optical_deposit: 'Optical payment',
    bill_payment: 'Bill payment',
    payroll_payment: 'Payroll release',
    cash_receipt: 'Direct receipt',
    cash_payment: 'Direct payment',
    fund_transfer: 'Fund transfer',
    manual: 'Manual journal',
};

export default function CashBankPage({
    transactions,
    filters,
    summary,
    cashAccounts,
    bankAccounts,
    transferEndpoints,
    counterAccounts,
    paymentMethods,
    entityName,
}: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canRecord = hasAnyPermission(auth, ['banks.manage', 'journals.create']);
    const [kind, setKind] = useState<'receipt' | 'payment' | null>(null);
    const [transferring, setTransferring] = useState(false);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Cash & Bank Records" />
            <PageBody>
                <PageHeader
                    title="Cash & Bank Records"
                    description="Every receipt and disbursement through cash on hand, clearing accounts and banks. Entries post to the ledger automatically — no debit/credit form."
                    actions={
                        canRecord && (
                            <>
                                <Button variant="outline" onClick={() => setTransferring(true)}>
                                    <ArrowLeftRightIcon className="size-4" />
                                    Transfer funds
                                </Button>
                                <Button variant="outline" onClick={() => setKind('payment')}>
                                    <MinusIcon className="size-4" />
                                    Record payment
                                </Button>
                                <Button onClick={() => setKind('receipt')}>
                                    <PlusIcon className="size-4" />
                                    Record receipt
                                </Button>
                            </>
                        )
                    }
                />

                <StatGrid>
                    <StatCard
                        title="Receipts"
                        value={formatPhpCurrency(summary.inflows)}
                        icon={ArrowDownLeftIcon}
                        tone="success"
                        description={`${formatDate(String(filters.date_from))} – ${formatDate(String(filters.date_to))}`}
                    />
                    <StatCard title="Disbursements" value={formatPhpCurrency(summary.outflows)} icon={ArrowUpRightIcon} tone="warning" />
                    <StatCard
                        title="Net cash flow"
                        value={formatPhpCurrency(summary.net)}
                        icon={ScaleIcon}
                        tone={summary.net < 0 ? 'danger' : 'info'}
                        emphasize={summary.net < 0}
                    />
                    <StatCard
                        title="Awaiting posting"
                        value={summary.draftCount.toLocaleString()}
                        icon={FileClockIcon}
                        tone={summary.draftCount ? 'warning' : 'success'}
                        description="Draft entries not yet in the ledger"
                        href={summary.draftCount ? '/accounting/journal-entries' : undefined}
                    />
                </StatGrid>

                <TableCard>
                    <FilterBar
                        url="/accounting/cash-bank-records"
                        filters={filters}
                        searchPlaceholder="Description, reference or entry no."
                        selects={[
                            {
                                key: 'account_id',
                                label: 'Accounts',
                                options: cashAccounts.map((a) => ({ value: String(a.id), label: `${a.code} · ${a.name}` })),
                            },
                            {
                                key: 'direction',
                                label: 'Directions',
                                options: [
                                    { value: 'in', label: 'Receipts' },
                                    { value: 'out', label: 'Payments' },
                                ],
                            },
                            {
                                key: 'status',
                                label: 'Ledger',
                                options: [
                                    { value: 'posted', label: 'Posted' },
                                    { value: 'draft', label: 'Draft' },
                                ],
                            },
                        ]}
                        dateRange={{ from: 'date_from', to: 'date_to' }}
                    />
                    <ListTable
                        rows={transactions.data}
                        rowKey={(t) => t.id}
                        sequenceStart={transactions.from ?? 1}
                        rowAccent={(t) => (t.direction === 'in' ? 'bg-emerald-500' : 'bg-amber-500')}
                        columns={[
                            { id: 'date', header: 'Date', className: 'whitespace-nowrap', cell: (t) => formatDate(t.entry_date) },
                            {
                                id: 'description',
                                header: 'Description',
                                cell: (t) => (
                                    <>
                                        <div className="max-w-80 truncate font-medium">{t.memo || '—'}</div>
                                        <div className="font-mono text-xs text-muted-foreground">
                                            {t.entry_no}
                                            {t.reference && ` · ${t.reference}`}
                                        </div>
                                    </>
                                ),
                            },
                            { id: 'account', header: 'Account', minScreen: 'lg', className: 'text-sm', cell: (t) => (t.account ? `${t.account.code} · ${t.account.name}` : '—') },
                            {
                                id: 'source',
                                header: 'Source',
                                minScreen: 'xl',
                                className: 'text-sm',
                                cell: (t) =>
                                    t.source_url ? (
                                        <Link href={t.source_url} className="text-primary hover:underline">
                                            {sourceLabel[t.source_type] ?? t.source_type}
                                        </Link>
                                    ) : (
                                        <span className="text-muted-foreground">{sourceLabel[t.source_type] ?? t.source_type}</span>
                                    ),
                            },
                            {
                                id: 'ledger',
                                header: 'Ledger',
                                cell: (t) => (
                                    <div className="flex flex-wrap gap-1">
                                        <StatusBadge status={t.status} />
                                        {t.is_cleared === true && <StatusBadge status="cleared" />}
                                    </div>
                                ),
                            },
                            { id: 'in', header: 'Receipt', align: 'right', className: 'font-mono text-emerald-600 tabular-nums dark:text-emerald-400', cell: (t) => (t.direction === 'in' ? formatAmount(t.amount) : '') },
                            { id: 'out', header: 'Payment', align: 'right', className: 'font-mono tabular-nums', cell: (t) => (t.direction === 'out' ? formatAmount(t.amount) : '') },
                        ]}
                        mobileRow={(t) => (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium">{t.memo || t.entry_no}</span>
                                    <span className={`font-mono text-sm tabular-nums ${t.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                                        {t.direction === 'in' ? '+' : '−'}
                                        {formatAmount(t.amount)}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    <StatusBadge status={t.status} />
                                    <span>{formatDate(t.entry_date)}</span>
                                    {t.account && <span>· {t.account.code}</span>}
                                </div>
                            </div>
                        )}
                        empty={<TableEmpty title="No cash movements in this period" description="Try another account, direction or date range." />}
                    />
                    <Paginator page={transactions} />
                </TableCard>
            </PageBody>

            {kind && (
                <RecordDialog
                    kind={kind}
                    onClose={() => setKind(null)}
                    bankAccounts={bankAccounts}
                    counterAccounts={counterAccounts}
                    methods={paymentMethods}
                    entityName={entityName}
                />
            )}
            {transferring && <TransferDialog endpoints={transferEndpoints} entityName={entityName} onClose={() => setTransferring(false)} />}
        </AppLayout>
    );
}

/**
 * Move money between this entity's own cash accounts: deposit cash on hand or a card / e-wallet settlement to the
 * bank (the fee is booked to Bank and Merchant Fees), move funds between banks, or withdraw cash.
 */
function TransferDialog({ endpoints, entityName, onClose }: { endpoints: TransferEndpoint[]; entityName: string | null; onClose: () => void }) {
    const firstBank = endpoints.find((e) => e.kind === 'bank')?.value ?? '';
    const form = useForm({
        kind: 'transfer',
        txn_date: todayIso(),
        from: 'cash_on_hand',
        to: firstBank,
        amount: '',
        fee: '',
        reference: '',
        description: '',
    });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();
    const label = (value: string) => endpoints.find((e) => e.value === value)?.label ?? value;
    const received = Math.max(0, (Number(data.amount) || 0) - (Number(data.fee) || 0));
    const settlement = data.from === 'card_clearing' || data.from === 'ewallet_clearing';

    const endpointSelect = (field: 'from' | 'to', placeholder: string) => (
        <Select value={data[field]} onValueChange={(v) => setData(field, v)}>
            <SelectTrigger>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {endpoints.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                        {e.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="grid gap-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await confirm({
                            title: 'Record this transfer?',
                            description: `${formatPhpCurrency(Number(data.amount) || 0)} moves from ${label(data.from)} to ${label(data.to)}${
                                Number(data.fee) > 0 ? `, less a ${formatPhpCurrency(Number(data.fee))} fee` : ''
                            }. It posts to the books right away.`,
                            confirmLabel: 'Record transfer',
                        });
                        if (!ok) return;
                        form.post('/accounting/cash-bank-records', { preserveScroll: true, onSuccess: onClose });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Transfer funds</DialogTitle>
                        <DialogDescription>
                            Deposit cash on hand to the bank, record a card or e-wallet settlement, or move money between{' '}
                            {entityName ?? 'this entity'}'s own accounts.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>From *</Label>
                            {endpointSelect('from', 'Source account')}
                            <InputError message={errors.from} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>To *</Label>
                            {endpointSelect('to', 'Destination account')}
                            <InputError message={errors.to} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Date *</Label>
                            <Input type="date" value={data.txn_date} onChange={(e) => setData('txn_date', e.target.value)} />
                            <InputError message={errors.txn_date} />
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
                        <div className="grid gap-1.5">
                            <Label>{settlement ? 'Merchant / bank fee' : 'Bank fee'}</Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={data.fee}
                                onChange={(e) => setData('fee', e.target.value)}
                                className="text-right font-mono"
                                placeholder="0.00"
                            />
                            <InputError message={errors.fee} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Reference</Label>
                            <Input
                                value={data.reference}
                                onChange={(e) => setData('reference', e.target.value)}
                                className="font-mono"
                                placeholder="Deposit slip / settlement ref"
                            />
                            <InputError message={errors.reference} />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Description</Label>
                        <Input
                            value={data.description}
                            onChange={(e) => setData('description', e.target.value)}
                            placeholder="e.g. Deposit of 18 Oct cash sales"
                        />
                        <InputError message={errors.description} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {label(data.to)} receives <span className="font-mono text-foreground">{formatPhpCurrency(received)}</span>.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            Record transfer
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function RecordDialog({
    kind,
    onClose,
    bankAccounts,
    counterAccounts,
    methods,
    entityName,
}: {
    kind: 'receipt' | 'payment';
    onClose: () => void;
    bankAccounts: BankAccount[];
    counterAccounts: CounterAccount[];
    methods: string[];
    entityName: string | null;
}) {
    const receipt = kind === 'receipt';
    const form = useForm({
        kind,
        txn_date: todayIso(),
        amount: '',
        payment_method: receipt ? 'cash' : 'check',
        bank_account_id: bankAccounts[0] ? String(bankAccounts[0].id) : '',
        counter_account_id: '' as number | '',
        party: '',
        reference: '',
        description: '',
    });
    const { data, setData, errors, processing } = form;
    const viaBank = ['check', 'bank_transfer'].includes(data.payment_method);
    const confirm = useConfirm();

    // Suggest the natural side first: income/liability/equity for receipts, expense/asset for payments.
    const preferred = receipt ? ['revenue', 'liability', 'equity'] : ['expense', 'asset'];
    const options = [...counterAccounts].sort(
        (a, b) => Number(preferred.includes(b.classification ?? '')) - Number(preferred.includes(a.classification ?? '')),
    );

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="grid gap-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await confirm({
                            title: receipt ? 'Record this receipt?' : 'Record this payment?',
                            description: `${formatPhpCurrency(Number(data.amount) || 0)} will be posted to the books right away. A posted record cannot be edited.`,
                            confirmLabel: receipt ? 'Record receipt' : 'Record payment',
                        });
                        if (!ok) return;
                        form.transform((d) => ({ ...d, bank_account_id: viaBank ? d.bank_account_id : null }));
                        form.post('/accounting/cash-bank-records', { preserveScroll: true, onSuccess: onClose });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{receipt ? 'Record receipt' : 'Record payment'}</DialogTitle>
                        <DialogDescription>
                            {receipt
                                ? 'Money received that is not a customer invoice collection — e.g. refunds, capital infusion, other income.'
                                : 'Money paid out without a supplier bill — e.g. petty expenses, permits, advances.'}
                        </DialogDescription>
                    </DialogHeader>

                    <Alert>
                        <InfoIcon className="size-4" />
                        <AlertDescription className="text-xs">
                            {receipt ? (
                                <>
                                    Collecting on an invoice? Use{' '}
                                    <Link href="/billing/invoices" className="underline">
                                        Invoices
                                    </Link>{' '}
                                    so the customer balance updates.
                                </>
                            ) : (
                                <>
                                    Paying a supplier bill? Use{' '}
                                    <Link href="/ap/bills" className="underline">
                                        Bills & Payables
                                    </Link>{' '}
                                    so the payable clears.
                                </>
                            )}
                        </AlertDescription>
                    </Alert>

                    <div className="grid gap-1.5">
                        <Label>{receipt ? 'Received via' : 'Paid via'}</Label>
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
                    {viaBank && (
                        <div className="grid gap-1.5">
                            <Label>Bank account *</Label>
                            <Select value={data.bank_account_id} onValueChange={(v) => setData('bank_account_id', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select bank account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                            {b.code} · {b.name} ({b.bank_name})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={errors.bank_account_id} />
                        </div>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>Date *</Label>
                            <Input type="date" value={data.txn_date} onChange={(e) => setData('txn_date', e.target.value)} />
                            <InputError message={errors.txn_date} />
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
                        <Label>{receipt ? 'Received for *' : 'Paid for *'}</Label>
                        <Combobox
                            options={options.map((a) => ({ id: a.id, name: `${a.code} · ${a.name}` }))}
                            value={data.counter_account_id}
                            onValueChange={(v) => setData('counter_account_id', v)}
                            placeholder="Choose the account…"
                        />
                        <InputError message={errors.counter_account_id} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>{receipt ? 'Received from' : 'Payee'}</Label>
                            <Input value={data.party} onChange={(e) => setData('party', e.target.value)} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Reference{data.payment_method !== 'cash' && ' *'}</Label>
                            <Input
                                value={data.reference}
                                onChange={(e) => setData('reference', e.target.value)}
                                className="font-mono"
                                placeholder={data.payment_method === 'check' ? 'Check no.' : 'OR / ref no.'}
                            />
                            <InputError message={errors.reference} />
                        </div>
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Description *</Label>
                        <Input
                            value={data.description}
                            onChange={(e) => setData('description', e.target.value)}
                            placeholder={receipt ? 'e.g. Refund of security deposit' : 'e.g. Mayor’s permit renewal'}
                        />
                        <InputError message={errors.description} />
                    </div>
                    <p className="text-muted-foreground text-xs">Recorded under {entityName ?? 'the current entity'}.</p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {receipt ? 'Record receipt' : 'Record payment'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
