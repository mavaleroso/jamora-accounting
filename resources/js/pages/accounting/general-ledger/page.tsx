import { formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import type { BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { ArrowDownIcon, ArrowUpIcon, BookOpenIcon, FileSpreadsheetIcon, FlagIcon, PrinterIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'General Ledger', href: '/accounting/general-ledger' }];

type AccountOpt = { id: number; code: string; name: string; classification: string | null };
type Line = {
    id: number;
    journal_entry_id: number;
    entry_date: string;
    entry_no: string;
    journal_code: string | null;
    reference: string | null;
    memo: string | null;
    debit: number;
    credit: number;
    running_balance: number;
    source_type: string | null;
    source_url: string | null;
};
type Ledger = {
    account: { id: number; code: string; name: string; normal_balance: 'debit' | 'credit'; classification: string | null };
    opening_balance: number;
    closing_balance: number;
    total_debit: number;
    total_credit: number;
    lines: Line[];
};
type Props = { accounts: AccountOpt[]; filters: { account_id: number | null; date_from: string; date_to: string }; ledger: Ledger | null };

const sourceLabel: Record<string, string> = {
    invoice: 'Invoice',
    invoice_payment: 'Collection',
    bill: 'Bill',
    bill_payment: 'Bill payment',
    customer_deposit: 'Deposit',
    deposit_application: 'Deposit applied',
    payroll_run: 'Payroll',
    payroll_payment: 'Payroll payment',
    cash_receipt: 'Cash receipt',
    cash_payment: 'Cash payment',
};

export default function GeneralLedgerPage({ accounts, filters, ledger }: Props) {
    const [accountId, setAccountId] = useState<number | ''>(filters.account_id ?? '');
    const [from, setFrom] = useState(filters.date_from);
    const [to, setTo] = useState(filters.date_to);

    const query = { account_id: accountId, date_from: from, date_to: to };
    const run = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (accountId === '') return;
        router.get('/accounting/general-ledger', query, { preserveState: true, preserveScroll: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="General Ledger" />
            <PageBody>
                <PageHeader
                    title="General Ledger"
                    description="Posted movements and running balance for one account. Open an entry's source document from the ledger."
                    actions={
                        ledger && (
                            <>
                                <Button variant="outline" onClick={() => window.print()}>
                                    <PrinterIcon className="size-4" />
                                    Print / PDF
                                </Button>
                                <Button variant="outline" asChild>
                                    <a
                                        href={`/accounting/general-ledger/export?${new URLSearchParams({ account_id: String(accountId), date_from: from, date_to: to })}`}
                                    >
                                        <FileSpreadsheetIcon className="size-4" />
                                        Excel
                                    </a>
                                </Button>
                            </>
                        )
                    }
                />

                <form onSubmit={run} className="bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-xs lg:flex-row lg:items-end print:hidden">
                    <div className="grid min-w-0 flex-1 gap-1.5">
                        <Label className="text-xs">Account</Label>
                        <Combobox
                            options={accounts.map((a) => ({ id: a.id, name: `${a.code} · ${a.name}` }))}
                            value={accountId}
                            onValueChange={setAccountId}
                            placeholder="Choose an account…"
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label className="text-xs">From</Label>
                        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                        <Label className="text-xs">To</Label>
                        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                    <Button type="submit" disabled={accountId === ''}>
                        View ledger
                    </Button>
                </form>

                {!ledger ? (
                    <Card>
                        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
                            <BookOpenIcon className="size-8 opacity-40" />
                            Choose an account and period to see its ledger.
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <div className="hidden print:block">
                            <h2 className="text-lg font-semibold">
                                {ledger.account.code} · {ledger.account.name}
                            </h2>
                            <p className="text-sm">
                                {formatDate(filters.date_from)} – {formatDate(filters.date_to)}
                            </p>
                        </div>
                        <StatGrid className="print:hidden">
                            <StatCard
                                title="Balance brought forward"
                                value={formatPhpCurrency(ledger.opening_balance)}
                                icon={FlagIcon}
                                description={`Before ${formatDate(filters.date_from)}`}
                            />
                            <StatCard title="Total debits" value={formatPhpCurrency(ledger.total_debit)} icon={ArrowUpIcon} tone="info" />
                            <StatCard title="Total credits" value={formatPhpCurrency(ledger.total_credit)} icon={ArrowDownIcon} tone="info" />
                            <StatCard
                                title="Closing balance"
                                value={formatPhpCurrency(ledger.closing_balance)}
                                icon={WalletIcon}
                                tone="success"
                                description={`${ledger.account.normal_balance === 'debit' ? 'Debit' : 'Credit'}-normal account · ${formatDate(filters.date_to)}`}
                            />
                        </StatGrid>

                        <TableShell>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Entry</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Source</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow className="bg-muted/30">
                                        <TableCell className="text-muted-foreground">{formatDate(filters.date_from)}</TableCell>
                                        <TableCell colSpan={5} className="text-muted-foreground font-medium">
                                            Balance brought forward
                                        </TableCell>
                                        <TableCell className="text-right font-mono font-medium tabular-nums">
                                            {formatAmount(ledger.opening_balance)}
                                        </TableCell>
                                    </TableRow>
                                    {ledger.lines.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                                                No posted movements in this period.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        ledger.lines.map((l) => (
                                            <TableRow key={l.id}>
                                                <TableCell className="whitespace-nowrap">{formatDate(l.entry_date)}</TableCell>
                                                <TableCell>
                                                    <div className="font-mono text-sm">{l.entry_no}</div>
                                                    {l.reference && <div className="text-muted-foreground font-mono text-xs">{l.reference}</div>}
                                                </TableCell>
                                                <TableCell className="max-w-72">
                                                    <span className="line-clamp-2">{l.memo || '—'}</span>
                                                </TableCell>
                                                <TableCell>
                                                    {l.source_url ? (
                                                        <Link href={l.source_url} className="text-primary text-sm hover:underline print:no-underline">
                                                            {sourceLabel[l.source_type ?? ''] ?? 'Open'}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm">
                                                            {l.source_type ? (sourceLabel[l.source_type] ?? l.source_type) : 'Manual journal'}
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {l.debit ? formatAmount(l.debit) : ''}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {l.credit ? formatAmount(l.credit) : ''}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">{formatAmount(l.running_balance)}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                                <TableFooter>
                                    <TableRow>
                                        <TableCell colSpan={4}>Totals and closing balance</TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">{formatAmount(ledger.total_debit)}</TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">{formatAmount(ledger.total_credit)}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold tabular-nums">
                                            {formatAmount(ledger.closing_balance)}
                                        </TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </TableShell>
                    </>
                )}
            </PageBody>
        </AppLayout>
    );
}
