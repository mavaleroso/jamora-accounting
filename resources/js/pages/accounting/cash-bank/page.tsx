import { Head, router, Link } from '@inertiajs/react';
import {
    ArrowDownLeft,
    ArrowUpRight,
    Building2,
    Calendar,
    CheckCircle2,
    Clock,
    Filter,
    Plus,
    Receipt,
    RefreshCw,
    Scale,
    Search,
    Wallet,
} from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
import { formatPhpCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Accounting', href: '/accounting/dashboard' },
    { title: 'Cash & Bank Records', href: '/accounting/cash-bank-records' },
];

type BankAccount = {
    id: number;
    code: string;
    name: string;
    bank_name: string;
    account_number: string;
    is_shared: boolean;
};

type BankTransactionItem = {
    id: number;
    entity_id: number;
    bank_account_id: number;
    txn_date: string;
    description: string;
    direction: 'in' | 'out';
    amount: string | number;
    reference: string | null;
    source_type: string | null;
    is_cleared: boolean;
    bank_account?: {
        id: number;
        code: string;
        name: string;
        bank_name: string;
    };
    journal_entry?: {
        id: number;
        entry_no: string;
    } | null;
};

type PaginatedTransactions = {
    data: BankTransactionItem[];
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    prev_page_url: string | null;
    next_page_url: string | null;
};

type Props = {
    transactions: PaginatedTransactions;
    bankAccounts: BankAccount[];
    summary: {
        totalInflows: number;
        totalOutflows: number;
        netCashFlow: number;
        unclearedCount: number;
    };
    filters: {
        bank_account_id: string | null;
        direction: string | null;
        status: string | null;
        search: string;
        start_date: string | null;
        end_date: string | null;
    };
};

export default function CashBankTransactionsPage({
    transactions,
    bankAccounts,
    summary,
    filters,
}: Props) {
    const [isCreateOpen, setIsCreateOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Filter states
    const [search, setSearch] = React.useState(filters.search || '');
    const [accountId, setAccountId] = React.useState(filters.bank_account_id || 'all');
    const [direction, setDirection] = React.useState(filters.direction || 'all');
    const [status, setStatus] = React.useState(filters.status || 'all');

    // Create form states
    const [formData, setFormData] = React.useState({
        bank_account_id: bankAccounts[0]?.id ? String(bankAccounts[0].id) : '',
        txn_date: new Date().toISOString().split('T')[0],
        description: '',
        direction: 'in' as 'in' | 'out',
        amount: '',
        reference: '',
        source_type: 'direct_entry',
    });

    const handleFilterChange = (params: Record<string, string>) => {
        router.get(
            '/accounting/cash-bank-records',
            {
                search: search || undefined,
                bank_account_id: accountId === 'all' ? undefined : accountId,
                direction: direction === 'all' ? undefined : direction,
                status: status === 'all' ? undefined : status,
                ...params,
            },
            { preserveState: true, preserveScroll: true }
        );
    };

    const handleResetFilters = () => {
        setSearch('');
        setAccountId('all');
        setDirection('all');
        setStatus('all');
        router.get('/accounting/cash-bank-records', {}, { preserveState: true });
    };

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.bank_account_id || !formData.amount || !formData.description) {
            toast.error('Please fill in all required fields.');
            return;
        }

        setIsSubmitting(true);
        router.post('/accounting/cash-bank-records', formData, {
            onSuccess: () => {
                toast.success('Cash/Bank transaction successfully recorded.');
                setIsCreateOpen(false);
                setFormData({
                    bank_account_id: bankAccounts[0]?.id ? String(bankAccounts[0].id) : '',
                    txn_date: new Date().toISOString().split('T')[0],
                    description: '',
                    direction: 'in',
                    amount: '',
                    reference: '',
                    source_type: 'direct_entry',
                });
            },
            onError: (err) => {
                const message = Object.values(err)[0] as string;
                toast.error(message || 'Failed to record transaction.');
            },
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Cash & Bank Records - Accounting" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <Heading
                            title="Cash & Bank Records"
                            description="Slide 15-16 Unified Register: Track inflows, disbursements, customer collections, and bank positions."
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => router.visit('/banks/reconciliations')}
                            className="gap-2"
                        >
                            <Scale className="h-4 w-4 text-primary" />
                            Bank Reconciliations
                        </Button>
                        <Button
                            onClick={() => setIsCreateOpen(true)}
                            className="gap-2 shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            Record Inflow / Outflow
                        </Button>
                    </div>
                </div>

                {/* KPI Summary Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Total Inflows
                            </CardTitle>
                            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                                <ArrowDownLeft className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                                {formatPhpCurrency(summary.totalInflows)}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Customer receipts, deposits & transfers in
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Total Outflows
                            </CardTitle>
                            <div className="rounded-full bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
                                <ArrowUpRight className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                                {formatPhpCurrency(summary.totalOutflows)}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Supplier payments, payroll & disbursements
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Net Cash Flow
                            </CardTitle>
                            <div className="rounded-full bg-primary/10 p-2 text-primary">
                                <Wallet className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div
                                className={`text-2xl font-bold tracking-tight ${
                                    summary.netCashFlow >= 0
                                        ? 'text-primary'
                                        : 'text-rose-600 dark:text-rose-400'
                                }`}
                            >
                                {formatPhpCurrency(summary.netCashFlow)}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Current entity net liquidity movement
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Uncleared Items
                            </CardTitle>
                            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                                <Clock className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                                {summary.unclearedCount}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Awaiting monthly bank reconciliation
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Filter Toolbar */}
                <Card className="border-border/80 shadow-xs">
                    <CardContent className="pt-4 pb-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search ref or description..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleFilterChange({ search })}
                                    className="pl-9"
                                />
                            </div>

                            <Select
                                value={accountId}
                                onValueChange={(val) => {
                                    setAccountId(val);
                                    handleFilterChange({ bank_account_id: val === 'all' ? '' : val });
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All Bank Accounts" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Bank Accounts</SelectItem>
                                    {bankAccounts.map((acc) => (
                                        <SelectItem key={acc.id} value={String(acc.id)}>
                                            {acc.code} - {acc.bank_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={direction}
                                onValueChange={(val) => {
                                    setDirection(val);
                                    handleFilterChange({ direction: val === 'all' ? '' : val });
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All Directions" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Directions</SelectItem>
                                    <SelectItem value="in">Inflow (Deposit / Receipt)</SelectItem>
                                    <SelectItem value="out">Outflow (Payment / Disbursement)</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select
                                value={status}
                                onValueChange={(val) => {
                                    setStatus(val);
                                    handleFilterChange({ status: val === 'all' ? '' : val });
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Recon Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Recon Status</SelectItem>
                                    <SelectItem value="cleared">Cleared / Reconciled</SelectItem>
                                    <SelectItem value="uncleared">Uncleared</SelectItem>
                                </SelectContent>
                            </Select>

                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => handleFilterChange({ search })}
                                    className="flex-1 gap-1.5"
                                >
                                    <Filter className="h-4 w-4" />
                                    Filter
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={handleResetFilters}
                                    title="Reset filters"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Transactions Table */}
                <Card className="border-border/80 shadow-xs">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div>
                            <CardTitle className="text-base font-semibold">Transactions Register</CardTitle>
                            <CardDescription>
                                Showing {transactions.data.length} of {transactions.total} records
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableHead className="w-[110px]">Date</TableHead>
                                        <TableHead>Account</TableHead>
                                        <TableHead className="w-[100px]">Type</TableHead>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead className="w-[120px]">Recon</TableHead>
                                        <TableHead className="w-[110px]">Journal Entry</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                                No cash/bank transactions found matching the selected filters.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        transactions.data.map((txn) => {
                                            const isInflow = txn.direction === 'in';
                                            return (
                                                <TableRow key={txn.id} className="hover:bg-muted/30">
                                                    <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                                                        {txn.txn_date}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium text-xs">
                                                            {txn.bank_account?.code || 'BANK'}
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground">
                                                            {txn.bank_account?.bank_name}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={
                                                                isInflow
                                                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                                    : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                                            }
                                                        >
                                                            {isInflow ? 'INFLOW' : 'OUTFLOW'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {txn.reference || '—'}
                                                    </TableCell>
                                                    <TableCell className="max-w-[260px] truncate text-xs" title={txn.description}>
                                                        {txn.description}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-semibold">
                                                        <span
                                                            className={
                                                                isInflow
                                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                                    : 'text-rose-600 dark:text-rose-400'
                                                            }
                                                        >
                                                            {isInflow ? '+' : '-'} {formatPhpCurrency(txn.amount)}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {txn.is_cleared ? (
                                                            <Badge
                                                                variant="outline"
                                                                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1"
                                                            >
                                                                <CheckCircle2 className="h-3 w-3" />
                                                                Cleared
                                                            </Badge>
                                                        ) : (
                                                            <Badge
                                                                variant="outline"
                                                                className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1"
                                                            >
                                                                <Clock className="h-3 w-3" />
                                                                Uncleared
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {txn.journal_entry ? (
                                                            <Link
                                                                href={`/accounting/journal-entries?search=${txn.journal_entry.entry_no}`}
                                                                className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                                                            >
                                                                <Receipt className="h-3 w-3" />
                                                                {txn.journal_entry.entry_no}
                                                            </Link>
                                                        ) : (
                                                            <span className="text-[11px] text-muted-foreground">—</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Pagination Footer */}
                        {transactions.last_page > 1 && (
                            <div className="flex items-center justify-between border-t border-border px-4 py-3">
                                <div className="text-xs text-muted-foreground">
                                    Page {transactions.current_page} of {transactions.last_page}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!transactions.prev_page_url}
                                        onClick={() => transactions.prev_page_url && router.visit(transactions.prev_page_url)}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!transactions.next_page_url}
                                        onClick={() => transactions.next_page_url && router.visit(transactions.next_page_url)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Modal: Record Inflow / Outflow */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <form onSubmit={handleCreateSubmit}>
                        <DialogHeader>
                            <DialogTitle>Record Cash / Bank Transaction</DialogTitle>
                            <DialogDescription>
                                Directly record an inflow (deposit/collection) or outflow (payment/disbursement).
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="bank_account_id">Bank Account *</Label>
                                    <Select
                                        value={formData.bank_account_id}
                                        onValueChange={(val) => setFormData({ ...formData, bank_account_id: val })}
                                    >
                                        <SelectTrigger id="bank_account_id">
                                            <SelectValue placeholder="Select account" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {bankAccounts.map((acc) => (
                                                <SelectItem key={acc.id} value={String(acc.id)}>
                                                    {acc.code} - {acc.bank_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="direction">Direction *</Label>
                                    <Select
                                        value={formData.direction}
                                        onValueChange={(val: 'in' | 'out') => setFormData({ ...formData, direction: val })}
                                    >
                                        <SelectTrigger id="direction">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="in">Inflow (Deposit / Collection)</SelectItem>
                                            <SelectItem value="out">Outflow (Disbursement / Payment)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="txn_date">Transaction Date *</Label>
                                    <Input
                                        id="txn_date"
                                        type="date"
                                        value={formData.txn_date}
                                        onChange={(e) => setFormData({ ...formData, txn_date: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="amount">Amount (PHP) *</Label>
                                    <Input
                                        id="amount"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="reference">Reference / Check No. / OR No.</Label>
                                <Input
                                    id="reference"
                                    placeholder="e.g. OR-9921, CHK-10293, DEP-001"
                                    value={formData.reference}
                                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Particulars / Description *</Label>
                                <Input
                                    id="description"
                                    placeholder="e.g. Deposit for patient lenses, Petty cash replenishment"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="source_type">Classification</Label>
                                <Select
                                    value={formData.source_type}
                                    onValueChange={(val) => setFormData({ ...formData, source_type: val })}
                                >
                                    <SelectTrigger id="source_type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="direct_entry">Direct Bank Entry</SelectItem>
                                        <SelectItem value="customer_deposit">Customer Deposit</SelectItem>
                                        <SelectItem value="customer_collection">Customer Collection / Invoice</SelectItem>
                                        <SelectItem value="supplier_payment">Supplier Payment</SelectItem>
                                        <SelectItem value="payroll_disbursement">Payroll Disbursement</SelectItem>
                                        <SelectItem value="tax_payment">Statutory / BIR Tax Payment</SelectItem>
                                        <SelectItem value="inter_account_transfer">Inter-account Transfer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsCreateOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : 'Record Transaction'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
