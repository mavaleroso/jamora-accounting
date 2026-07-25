import { Head, usePage } from '@inertiajs/react';
import { DownloadIcon, LoaderCircleIcon, PrinterIcon } from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
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
import { hasPermission } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import type { Auth, BreadcrumbItem } from '@/types';
import { buildExportUrl, formatPeriodLabel, getCsrfToken, type ReportPeriodOption } from '../components/report-utils';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Journal Register', href: '/reports/journal-register' },
];

type RegisterEntry = {
    id: number;
    entry_no: string;
    entry_date: string;
    reference: string | null;
    memo: string | null;
    status: string;
    total_debit: number;
    total_credit: number;
    journal?: { code: string; name: string } | null;
};

type Props = {
    periods: ReportPeriodOption[];
};

function formatDate(value: string | null | undefined): string {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
    });
}

export default function JournalRegisterPage({ periods }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canExport = hasPermission(auth, 'reports.export');

    const [periodId, setPeriodId] = React.useState('');
    const [dateFrom, setDateFrom] = React.useState('');
    const [dateTo, setDateTo] = React.useState('');
    const [status, setStatus] = React.useState('posted');
    const [entries, setEntries] = React.useState<RegisterEntry[]>([]);
    const [total, setTotal] = React.useState(0);
    const [page, setPage] = React.useState(1);
    const [loading, setLoading] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);
    const perPage = 25;

    const loadEntries = React.useCallback(
        async (pageNum = 1) => {
            setLoading(true);
            setLoaded(false);

            try {
                const res = await fetch('/reports/journal-register/list', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-XSRF-TOKEN': getCsrfToken(),
                    },
                    body: JSON.stringify({
                        page: pageNum,
                        per_page: perPage,
                        period_id: periodId ? Number(periodId) : undefined,
                        date_from: dateFrom || undefined,
                        date_to: dateTo || undefined,
                        status,
                    }),
                    credentials: 'same-origin',
                });

                if (!res.ok) throw new Error('Failed to load journal register');

                const json = (await res.json()) as {
                    journal_entries: RegisterEntry[] | { data: RegisterEntry[] };
                    total: number;
                };
                const list = Array.isArray(json.journal_entries)
                    ? json.journal_entries
                    : (json.journal_entries.data ?? []);
                setEntries(list);
                setTotal(json.total);
                setPage(pageNum);
                setLoaded(true);
            } catch {
                toast.error('Failed to load journal register. Please try again.');
            } finally {
                setLoading(false);
            }
        },
        [periodId, dateFrom, dateTo, status],
    );

    const exportUrl = buildExportUrl('/reports/journal-register/export', {
        period_id: periodId ? Number(periodId) : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status,
    });

    const totals = React.useMemo(() => {
        return {
            debit: entries.reduce((sum, entry) => sum + entry.total_debit, 0),
            credit: entries.reduce((sum, entry) => sum + entry.total_credit, 0),
        };
    }, [entries]);

    const totalPages = Math.max(1, Math.ceil(total / perPage));

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Journal Register" />
            <div className="report-print-area flex h-full flex-1 flex-col gap-5 rounded-xl p-4">
                <Heading
                    title="Journal Register"
                    description="List of journal entries by period or date range."
                />

                <Card className="border-border/60 shadow-sm print:hidden">
                    <CardHeader className="border-b border-border/60 bg-muted/30 py-4">
                        <CardTitle className="text-base">Filters</CardTitle>
                        <CardDescription>Filter by period, date range, and status.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 p-4 md:grid-cols-4">
                        <div className="space-y-2 md:col-span-2">
                            <Label>Accounting Period</Label>
                            <Select value={periodId || 'all'} onValueChange={(v) => setPeriodId(v === 'all' ? '' : v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All periods" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All periods</SelectItem>
                                    {periods.map((period) => (
                                        <SelectItem key={period.id} value={String(period.id)}>
                                            {formatPeriodLabel(period)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Date from</Label>
                            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="Start date" />
                        </div>
                        <div className="space-y-2">
                            <Label>Date to</Label>
                            <DatePicker value={dateTo} onChange={setDateTo} placeholder="End date" />
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="posted">Posted only</SelectItem>
                                    <SelectItem value="all">All statuses</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-wrap items-end gap-2 md:col-span-4">
                            <Button type="button" onClick={() => loadEntries(1)} disabled={loading}>
                                {loading ? (
                                    <>
                                        <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : (
                                    'Generate'
                                )}
                            </Button>
                            {canExport && loaded ? (
                                <Button type="button" variant="outline" asChild>
                                    <a href={exportUrl}>
                                        <DownloadIcon className="mr-2 size-4" />
                                        Export Excel
                                    </a>
                                </Button>
                            ) : null}
                            <Button type="button" variant="outline" onClick={() => window.print()}>
                                <PrinterIcon className="mr-2 size-4" />
                                Print
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 py-5">
                        <CardTitle className="text-base font-semibold">Journal Register</CardTitle>
                        <CardDescription>
                            {loaded
                                ? `${total.toLocaleString()} ${total === 1 ? 'entry' : 'entries'} found`
                                : 'Apply filters and click Generate.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Entry No.</TableHead>
                                        <TableHead>Journal</TableHead>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.length > 0 ? (
                                        entries.map((entry) => (
                                            <TableRow key={entry.id}>
                                                <TableCell>{formatDate(entry.entry_date)}</TableCell>
                                                <TableCell className="font-mono text-sm">{entry.entry_no}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {entry.journal?.code ?? '--'}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {entry.reference ?? '--'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="capitalize">
                                                        {entry.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {formatPhpCurrency(entry.total_debit)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {formatPhpCurrency(entry.total_credit)}
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
                                                    ? 'No journal entries found for the selected filters.'
                                                    : 'Click Generate to load entries.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {entries.length > 0 ? (
                                        <TableRow className="bg-muted/40 font-bold">
                                            <TableCell colSpan={5}>Page totals</TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatPhpCurrency(totals.debit)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {formatPhpCurrency(totals.credit)}
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </TableBody>
                            </Table>
                        </div>
                        {loaded && totalPages > 1 ? (
                            <div className="flex items-center justify-between border-t p-4 print:hidden">
                                <p className="text-sm text-muted-foreground">
                                    Page {page} of {totalPages}
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={page <= 1 || loading}
                                        onClick={() => loadEntries(page - 1)}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={page >= totalPages || loading}
                                        onClick={() => loadEntries(page + 1)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
