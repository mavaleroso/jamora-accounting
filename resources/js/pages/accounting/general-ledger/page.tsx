import { Head } from '@inertiajs/react';
import { LoaderCircleIcon } from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
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
import type { AccountOption, BreadcrumbItem, LedgerLine } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'General Ledger', href: '/accounting/general-ledger' },
];

type Props = {
    accounts: AccountOption[];
};

function getCsrfToken(): string {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

function formatDate(value: string | null | undefined): string {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
    });
}

export default function GeneralLedgerPage({ accounts }: Props) {
    const [accountId, setAccountId] = React.useState('');
    const [dateFrom, setDateFrom] = React.useState('');
    const [dateTo, setDateTo] = React.useState('');
    const [lines, setLines] = React.useState<LedgerLine[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);

    const selectedAccount = accounts.find((account) => String(account.id) === accountId);

    const loadLedger = React.useCallback(async () => {
        if (!accountId) {
            toast.error('Please select an account.');
            return;
        }

        setLoading(true);
        setLoaded(false);

        try {
            const res = await fetch('/accounting/general-ledger/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    account_id: Number(accountId),
                    date_from: dateFrom || undefined,
                    date_to: dateTo || undefined,
                }),
                credentials: 'same-origin',
            });

            if (!res.ok) throw new Error('Failed to load ledger');

            const json = (await res.json()) as { lines: LedgerLine[] };
            setLines(json.lines);
            setLoaded(true);
        } catch {
            toast.error('Failed to load general ledger. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [accountId, dateFrom, dateTo]);

    const totals = React.useMemo(() => {
        const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
        const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
        const endingBalance = lines.length > 0 ? lines[lines.length - 1].running_balance : 0;
        return { totalDebit, totalCredit, endingBalance };
    }, [lines]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="General Ledger" />
            <div className="flex h-full flex-1 flex-col gap-5 rounded-xl p-4">
                <Heading
                    title="General Ledger"
                    description="View posted journal lines and running balances by account."
                />

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 py-4">
                        <CardTitle className="text-base">Filters</CardTitle>
                        <CardDescription>Select an account and optional date range.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 p-4 md:grid-cols-4">
                        <div className="space-y-2 md:col-span-2">
                            <Label>Account *</Label>
                            <Select value={accountId} onValueChange={setAccountId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((account) => (
                                        <SelectItem key={account.id} value={String(account.id)}>
                                            {account.code} — {account.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Date from</Label>
                            <DatePicker
                                value={dateFrom}
                                onChange={setDateFrom}
                                placeholder="Start date"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Date to</Label>
                            <DatePicker value={dateTo} onChange={setDateTo} placeholder="End date" />
                        </div>
                        <div className="md:col-span-4">
                            <Button type="button" onClick={loadLedger} disabled={loading || !accountId}>
                                {loading ? (
                                    <>
                                        <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    'Load ledger'
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 py-5">
                        <CardTitle className="text-base font-semibold">
                            {selectedAccount
                                ? `${selectedAccount.code} — ${selectedAccount.name}`
                                : 'Ledger lines'}
                        </CardTitle>
                        <CardDescription>
                            {loaded
                                ? `${lines.length.toLocaleString()} posted ${lines.length === 1 ? 'line' : 'lines'}`
                                : 'Load an account to view ledger activity.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Entry No.</TableHead>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Memo</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                        <TableHead className="text-right">Balance</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.length > 0 ? (
                                        lines.map((line, index) => (
                                            <TableRow key={`${line.entry_no}-${index}`}>
                                                <TableCell>{formatDate(line.entry_date)}</TableCell>
                                                <TableCell className="font-mono text-sm">
                                                    {line.entry_no}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {line.reference ?? '--'}
                                                </TableCell>
                                                <TableCell className="max-w-[220px] truncate text-muted-foreground">
                                                    {line.memo ?? '--'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {line.debit > 0 ? formatPhpCurrency(line.debit) : '--'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {line.credit > 0 ? formatPhpCurrency(line.credit) : '--'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono font-medium tabular-nums">
                                                    {formatPhpCurrency(line.running_balance)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell
                                                colSpan={7}
                                                className="h-24 text-center text-muted-foreground"
                                            >
                                                {loaded
                                                    ? 'No posted ledger lines found for the selected filters.'
                                                    : 'Select an account and click Load ledger.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        {lines.length > 0 ? (
                            <div className="flex flex-wrap justify-end gap-6 border-t p-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Total Debit: </span>
                                    <span className="font-mono font-medium tabular-nums">
                                        {formatPhpCurrency(totals.totalDebit)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Total Credit: </span>
                                    <span className="font-mono font-medium tabular-nums">
                                        {formatPhpCurrency(totals.totalCredit)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Ending Balance: </span>
                                    <span className="font-mono font-medium tabular-nums">
                                        {formatPhpCurrency(totals.endingBalance)}
                                    </span>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
