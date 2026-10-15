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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { hasAnyPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { ArrowDownLeftIcon, ArrowUpRightIcon, FileClockIcon, InfoIcon, MinusIcon, PlusIcon, ScaleIcon } from 'lucide-react';
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
type BankAccount = { id: number; code: string; name: string; bank_name: string; is_shared: boolean };
type CounterAccount = { id: number; code: string; name: string; classification: string | null };

type Props = {
    transactions: Paginated<Row>;
    filters: Record<string, string | number | null>;
    summary: { inflows: number; outflows: number; net: number; draftCount: number };
    cashAccounts: CashAccount[];
    bankAccounts: BankAccount[];
    counterAccounts: CounterAccount[];
    paymentMethods: string[];
    entityName: string | null;
};

const sourceLabel: Record<string, string> = {
    invoice_payment: 'Invoice collection',
    customer_deposit: 'Customer deposit',
    bill_payment: 'Bill payment',
    payroll_payment: 'Payroll release',
    cash_receipt: 'Direct receipt',
    cash_payment: 'Direct payment',
    manual: 'Manual journal',
};

export default function CashBankPage({
    transactions,
    filters,
    summary,
    cashAccounts,
    bankAccounts,
    counterAccounts,
    paymentMethods,
    entityName,
}: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canRecord = hasAnyPermission(auth, ['banks.manage', 'journals.create']);
    const [kind, setKind] = useState<'receipt' | 'payment' | null>(null);

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

                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Account</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Ledger</TableHead>
                                <TableHead className="text-right">Receipt</TableHead>
                                <TableHead className="text-right">Payment</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {transactions.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-muted-foreground h-32 text-center">
                                        No cash movements in this period.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                transactions.data.map((t) => (
                                    <TableRow key={t.id}>
                                        <TableCell className="whitespace-nowrap">{formatDate(t.entry_date)}</TableCell>
                                        <TableCell>
                                            <div className="max-w-80 truncate font-medium">{t.memo || '—'}</div>
                                            <div className="text-muted-foreground font-mono text-xs">
                                                {t.entry_no}
                                                {t.reference && ` · ${t.reference}`}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">{t.account ? `${t.account.code} · ${t.account.name}` : '—'}</TableCell>
                                        <TableCell className="text-sm">
                                            {t.source_url ? (
                                                <Link href={t.source_url} className="text-primary hover:underline">
                                                    {sourceLabel[t.source_type] ?? t.source_type}
                                                </Link>
                                            ) : (
                                                <span className="text-muted-foreground">{sourceLabel[t.source_type] ?? t.source_type}</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                <StatusBadge status={t.status} />
                                                {t.is_cleared === true && <StatusBadge status="cleared" />}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-emerald-600 tabular-nums dark:text-emerald-400">
                                            {t.direction === 'in' ? formatAmount(t.amount) : ''}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">
                                            {t.direction === 'out' ? formatAmount(t.amount) : ''}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableShell>
                <Paginator page={transactions} noun="movements" />
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
        </AppLayout>
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
                    onSubmit={(e) => {
                        e.preventDefault();
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
                                            {b.code} · {b.name} {b.is_shared ? '(shared)' : ''}
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
