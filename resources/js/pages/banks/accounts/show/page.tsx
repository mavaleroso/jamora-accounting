import { formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { StatusBadge } from '@/components/finance/status-badge';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { Head, router } from '@inertiajs/react';
import { ArrowDownLeftIcon, ArrowUpRightIcon, FlagIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';

type Line = {
    id: number;
    txn_date: string;
    description: string;
    reference: string | null;
    source_type: string | null;
    direction: 'in' | 'out';
    amount: number;
    balance: number;
    is_cleared: boolean;
    journal_entry: { id: number; entry_no: string } | null;
};
type Props = {
    account: {
        id: number;
        code: string;
        name: string;
        bank_name: string;
        account_number: string | null;
        gl_account: { code: string; name: string } | null;
    };
    lines: Line[];
    opening: number;
    closing: number;
    filters: { date_from: string; date_to: string };
};

const sourceLabel: Record<string, string> = {
    invoice_payment: 'Collection',
    customer_deposit: 'Customer deposit',
    bill_payment: 'Bill payment',
    fund_transfer: 'Transfer',
    cash_receipt: 'Receipt',
    cash_payment: 'Payment',
    direct_entry: 'Direct entry',
    receipt: 'Receipt',
    payment: 'Payment',
};

export default function BankRegisterPage({ account, lines, opening, closing, filters }: Props) {
    const [from, setFrom] = useState(filters.date_from);
    const [to, setTo] = useState(filters.date_to);

    const inflows = lines.filter((l) => l.direction === 'in').reduce((s, l) => s + l.amount, 0);
    const outflows = lines.filter((l) => l.direction === 'out').reduce((s, l) => s + l.amount, 0);

    const apply = (e: React.FormEvent) => {
        e.preventDefault();
        router.get(`/banks/accounts/${account.id}`, { date_from: from, date_to: to }, { preserveState: true, preserveScroll: true });
    };

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Bank Accounts', href: '/banks/accounts' },
                { title: account.name, href: `/banks/accounts/${account.id}` },
            ]}
        >
            <Head title={`${account.name} register`} />
            <PageBody>
                <PageHeader
                    title={account.name}
                    description={
                        <span className="flex flex-wrap items-center gap-2">
                            <span className="font-mono">{account.code}</span>·<span>{account.bank_name}</span>
                            {account.account_number && <span className="font-mono">· {account.account_number}</span>}
                            {account.gl_account && (
                                <span className="text-muted-foreground">
                                    · Ledger <span className="font-mono">{account.gl_account.code}</span> {account.gl_account.name}
                                </span>
                            )}
                        </span>
                    }
                    actions={
                        <Button variant="outline" asChild>
                            <a href={`/banks/reconciliations?bank_account_id=${account.id}`}>Reconcile</a>
                        </Button>
                    }
                />

                <form onSubmit={apply} className="bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-xs sm:flex-row sm:items-end">
                    <div className="grid gap-1.5">
                        <Label className="text-xs">From</Label>
                        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div className="grid gap-1.5">
                        <Label className="text-xs">To</Label>
                        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                    <Button type="submit">Apply</Button>
                </form>

                <StatGrid>
                    <StatCard
                        title="Opening balance"
                        value={formatPhpCurrency(opening)}
                        icon={FlagIcon}
                        description={`As of ${formatDate(filters.date_from)}`}
                    />
                    <StatCard title="Receipts" value={formatPhpCurrency(inflows)} icon={ArrowDownLeftIcon} tone="success" />
                    <StatCard title="Disbursements" value={formatPhpCurrency(outflows)} icon={ArrowUpRightIcon} tone="warning" />
                    <StatCard
                        title="Closing balance"
                        value={formatPhpCurrency(closing)}
                        icon={WalletIcon}
                        tone="info"
                        description={`As of ${formatDate(filters.date_to)}`}
                    />
                </StatGrid>

                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Receipts</TableHead>
                                <TableHead className="text-right">Disbursements</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow className="bg-muted/30">
                                <TableCell colSpan={5} className="text-muted-foreground text-sm">
                                    Opening balance
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium tabular-nums">{formatAmount(opening)}</TableCell>
                            </TableRow>
                            {lines.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-muted-foreground h-24 text-center">
                                        No transactions in this period.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                lines.map((l) => (
                                    <TableRow key={l.id}>
                                        <TableCell className="whitespace-nowrap">{formatDate(l.txn_date)}</TableCell>
                                        <TableCell>
                                            <div className="font-medium">{l.description}</div>
                                            <div className="text-muted-foreground text-xs">
                                                {sourceLabel[l.source_type ?? ''] ?? l.source_type}
                                                {l.reference && <span className="font-mono"> · {l.reference}</span>}
                                                {l.journal_entry && <span className="font-mono"> · {l.journal_entry.entry_no}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge status={l.is_cleared ? 'cleared' : 'uncleared'} />
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-emerald-600 tabular-nums dark:text-emerald-400">
                                            {l.direction === 'in' ? formatAmount(l.amount) : ''}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">
                                            {l.direction === 'out' ? formatAmount(l.amount) : ''}
                                        </TableCell>
                                        <TableCell className="text-right font-mono tabular-nums">{formatAmount(l.balance)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow>
                                <TableCell colSpan={3}>Closing balance</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{formatAmount(inflows)}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{formatAmount(outflows)}</TableCell>
                                <TableCell className="text-right font-mono font-semibold tabular-nums">{formatAmount(closing)}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </TableShell>
            </PageBody>
        </AppLayout>
    );
}
