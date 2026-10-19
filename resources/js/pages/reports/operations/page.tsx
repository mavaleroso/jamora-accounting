import { formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { FileSpreadsheetIcon, InfoIcon, PrinterIcon } from 'lucide-react';
import { useState } from 'react';

type Format = 'text' | 'date' | 'number' | 'currency';
type Column = { key: string; label: string; format: Format; align?: 'left' | 'right' };
type Row = Record<string, string | number | null>;

type Report = {
    key: string;
    title: string;
    mode: 'range' | 'as_of';
    filters: { date_from?: string; date_to?: string; as_of?: string };
    entity: string | null;
    summary: { label: string; value: number; format: Format }[];
    columns: Column[];
    rows: Row[];
    totals: Row | null;
    notes: string[];
};

type Props = { report: Report; reports: { key: string; title: string }[] };

const descriptions: Record<string, string> = {
    'daily-sales': 'Sales invoiced per day — optical POS sales and invoices recorded here — with discounts, VAT and the product / service split.',
    'vat-summary': 'Output VAT on sales less input VAT on supplier bills, by month, with VAT-exempt (senior / PWD) and non-VAT sales.',
    cogs: 'Cost of goods sold and stock write-offs by stock type, from the optical stock postings, checked against the ledger.',
    collections: 'Money received by payment method: optical POS payments, customer deposits and invoice collections.',
    deposits: 'Customer deposits still held at the date — received but not yet applied to a completed sale.',
};

function show(value: string | number | null | undefined, format: Format): string {
    if (value === null || value === undefined || value === '') return '';
    if (format === 'currency') return formatAmount(Number(value));
    if (format === 'number') return Number(value).toLocaleString();
    if (format === 'date') return formatDate(String(value));
    return String(value);
}

export default function OperationalReportPage({ report, reports }: Props) {
    const base = `/reports/operations/${report.key}`;
    const [from, setFrom] = useState(report.filters.date_from ?? '');
    const [to, setTo] = useState(report.filters.date_to ?? '');
    const [asOf, setAsOf] = useState(report.filters.as_of ?? '');
    const query: Record<string, string> = report.mode === 'as_of' ? { as_of: asOf } : { date_from: from, date_to: to };
    const exportUrl = `${base}/export?${new URLSearchParams(query).toString()}`;

    const apply = (e: React.FormEvent) => {
        e.preventDefault();
        router.get(base, query, { preserveState: true, preserveScroll: true });
    };

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Reports', href: base },
                { title: report.title, href: base },
            ]}
        >
            <Head title={report.title} />
            <PageBody>
                <PageHeader
                    title={report.title}
                    description={
                        <>
                            {descriptions[report.key]} {report.entity && <span className="text-foreground font-medium">{report.entity}.</span>}
                        </>
                    }
                    actions={
                        <>
                            <Button variant="outline" onClick={() => window.print()}>
                                <PrinterIcon className="size-4" />
                                Print
                            </Button>
                            <Button variant="outline" asChild>
                                <a href={exportUrl}>
                                    <FileSpreadsheetIcon className="size-4" />
                                    Excel
                                </a>
                            </Button>
                        </>
                    }
                />

                {reports.length > 1 && (
                    <nav className="flex flex-wrap gap-1.5 print:hidden">
                        {reports.map((r) => (
                            <Link
                                key={r.key}
                                href={`/reports/operations/${r.key}`}
                                className={cn(
                                    'rounded-md border px-2.5 py-1 text-xs transition-colors',
                                    r.key === report.key ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted',
                                )}
                            >
                                {r.title}
                            </Link>
                        ))}
                    </nav>
                )}

                <form onSubmit={apply} className="bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-xs sm:flex-row sm:items-end print:hidden">
                    {report.mode === 'as_of' ? (
                        <div className="grid gap-1.5">
                            <Label className="text-xs">As of</Label>
                            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                        </div>
                    ) : (
                        <>
                            <div className="grid gap-1.5">
                                <Label className="text-xs">From</Label>
                                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="grid gap-1.5">
                                <Label className="text-xs">To</Label>
                                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                            </div>
                        </>
                    )}
                    <Button type="submit">Apply</Button>
                </form>

                <StatGrid>
                    {report.summary.map((s) => (
                        <StatCard
                            key={s.label}
                            title={s.label}
                            value={s.format === 'currency' ? formatPhpCurrency(s.value) : Number(s.value).toLocaleString()}
                        />
                    ))}
                </StatGrid>

                {report.notes.length > 0 && (
                    <Alert>
                        <InfoIcon className="size-4" />
                        <AlertDescription className="space-y-1 text-sm">
                            {report.notes.map((n) => (
                                <p key={n}>{n}</p>
                            ))}
                        </AlertDescription>
                    </Alert>
                )}

                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {report.columns.map((c) => (
                                    <TableHead key={c.key} className={c.align === 'right' ? 'text-right' : undefined}>
                                        {c.label}
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {report.rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={report.columns.length} className="text-muted-foreground h-24 text-center">
                                        Nothing to report for this period.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                report.rows.map((row, i) => (
                                    <TableRow key={i}>
                                        {report.columns.map((c) => (
                                            <TableCell
                                                key={c.key}
                                                className={cn(
                                                    c.align === 'right' && 'text-right',
                                                    (c.format === 'currency' || c.format === 'number') && 'font-mono tabular-nums',
                                                    'whitespace-nowrap',
                                                )}
                                            >
                                                {show(row[c.key], c.format)}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                        {report.totals && report.rows.length > 0 && (
                            <TableFooter>
                                <TableRow>
                                    {report.columns.map((c, i) => (
                                        <TableCell
                                            key={c.key}
                                            className={cn(c.align === 'right' && 'text-right', i > 0 && 'font-mono tabular-nums', 'font-semibold')}
                                        >
                                            {i === 0 ? String(report.totals?.[c.key] ?? 'Total') : show(report.totals?.[c.key], c.format)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableFooter>
                        )}
                    </Table>
                </TableShell>
            </PageBody>
        </AppLayout>
    );
}
