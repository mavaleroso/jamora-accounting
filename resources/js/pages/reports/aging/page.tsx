import { formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Tabs, TabsList, TabsTrigger } from '@/components/finance/tabs';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { Head, Link, router } from '@inertiajs/react';
import { AlarmClockIcon, CircleCheckIcon, FileSpreadsheetIcon, PrinterIcon, SearchIcon, WalletIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

const BUCKETS = [
    { key: 'current', label: 'Current' },
    { key: 'days_1_30', label: '1–30' },
    { key: 'days_31_60', label: '31–60' },
    { key: 'days_61_90', label: '61–90' },
    { key: 'days_over_90', label: 'Over 90' },
] as const;
type BucketKey = (typeof BUCKETS)[number]['key'];

type SummaryRow = { party_id: number; party_code: string | null; party_name: string; documents: number; total: number } & Record<BucketKey, number>;
type Detail = {
    id: number;
    number: string;
    external_ref: string | null;
    party_id: number;
    party_name: string;
    doc_date: string;
    due_date: string | null;
    total: number;
    paid_as_of: number;
    balance: number;
    days_past_due: number;
    bucket: BucketKey;
    url: string;
};
type Report = {
    as_of: string;
    summary: SummaryRow[];
    details: Detail[];
    totals: Record<BucketKey | 'total', number>;
    overdue: number;
    party_count: number;
    document_count: number;
};
type Props = { type: 'ar' | 'ap'; report: Report; entityName: string | null };

const bucketTone: Record<BucketKey, string> = {
    current: 'text-emerald-600 dark:text-emerald-400',
    days_1_30: 'text-amber-600 dark:text-amber-400',
    days_31_60: 'text-orange-600 dark:text-orange-400',
    days_61_90: 'text-red-600 dark:text-red-400',
    days_over_90: 'text-red-700 dark:text-red-300 font-semibold',
};

export default function AgingReportPage({ type, report, entityName }: Props) {
    const ar = type === 'ar';
    const title = ar ? 'AR Aging' : 'AP Aging';
    const base = ar ? '/reports/ar-aging' : '/reports/ap-aging';
    const party = ar ? 'Customer' : 'Supplier';
    const doc = ar ? 'Invoice' : 'Bill';

    const [asOf, setAsOf] = useState(report.as_of);
    const [view, setView] = useState<'summary' | 'detail'>('summary');
    const [bucket, setBucket] = useState<BucketKey | null>(null);
    const [partyId, setPartyId] = useState<number | null>(null);
    const [search, setSearch] = useState('');

    const details = useMemo(
        () =>
            report.details.filter(
                (d) =>
                    (!bucket || d.bucket === bucket) &&
                    (!partyId || d.party_id === partyId) &&
                    (!search || `${d.number} ${d.external_ref ?? ''} ${d.party_name}`.toLowerCase().includes(search.toLowerCase())),
            ),
        [report.details, bucket, partyId, search],
    );
    const summary = useMemo(
        () => report.summary.filter((r) => !search || r.party_name.toLowerCase().includes(search.toLowerCase())),
        [report.summary, search],
    );

    // Clicking a figure drills from the summary to the matching documents.
    const drill = (p: number | null, b: BucketKey | null) => {
        setPartyId(p);
        setBucket(b);
        setView('detail');
    };

    const pct = (v: number) => (report.totals.total > 0 ? Math.round((v / report.totals.total) * 100) : 0);

    return (
        <AppLayout breadcrumbs={[{ title, href: base }]}>
            <Head title={title} />
            <PageBody>
                <PageHeader
                    title={ar ? 'Accounts Receivable Aging' : 'Accounts Payable Aging'}
                    description={`${entityName ?? ''} · Outstanding ${ar ? 'customer invoices' : 'supplier bills'} as of ${formatDate(report.as_of)}, aged from the due date.`}
                    actions={
                        <>
                            <Button variant="outline" onClick={() => window.print()}>
                                <PrinterIcon className="size-4" />
                                Print / PDF
                            </Button>
                            <Button variant="outline" asChild>
                                <a href={`${base}/export?as_of=${report.as_of}&view=${view}`}>
                                    <FileSpreadsheetIcon className="size-4" />
                                    Excel ({view})
                                </a>
                            </Button>
                        </>
                    }
                />

                <form
                    className="bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-xs sm:flex-row sm:items-end print:hidden"
                    onSubmit={(e) => {
                        e.preventDefault();
                        router.get(base, { as_of: asOf }, { preserveScroll: true });
                    }}
                >
                    <div className="grid gap-1.5">
                        <Label className="text-xs">As of</Label>
                        <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                    </div>
                    <Button type="submit">Update</Button>
                    <div className="relative sm:ml-auto sm:w-72">
                        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={`Filter by ${party.toLowerCase()} or ${doc.toLowerCase()} no.`}
                            className="pl-9"
                        />
                    </div>
                </form>

                <StatGrid className="xl:grid-cols-3">
                    <StatCard
                        title="Outstanding balance"
                        value={formatPhpCurrency(report.totals.total)}
                        icon={WalletIcon}
                        description={`${report.document_count} ${doc.toLowerCase()}s · ${report.party_count} ${party.toLowerCase()}s`}
                    />
                    <StatCard
                        title="Current"
                        value={formatPhpCurrency(report.totals.current)}
                        icon={CircleCheckIcon}
                        tone="success"
                        description={`${pct(report.totals.current)}% not yet due`}
                    />
                    <StatCard
                        title="Overdue"
                        value={formatPhpCurrency(report.overdue)}
                        icon={AlarmClockIcon}
                        tone={report.overdue > 0 ? 'danger' : 'success'}
                        emphasize={report.overdue > 0}
                        description={`${pct(report.overdue)}% past due`}
                    />
                </StatGrid>

                {/* Bucket distribution — click to see the documents behind each figure. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 print:hidden">
                    {BUCKETS.map((b) => (
                        <button
                            key={b.key}
                            type="button"
                            onClick={() => drill(null, bucket === b.key && view === 'detail' ? null : b.key)}
                            className={cn(
                                'bg-card hover:border-primary/40 rounded-lg border p-3 text-left transition-colors',
                                bucket === b.key && view === 'detail' && 'border-primary ring-primary/30 ring-2',
                            )}
                        >
                            <div className="text-muted-foreground text-xs">{b.label === 'Current' ? 'Current' : `${b.label} days`}</div>
                            <div className={cn('font-mono text-lg tabular-nums', report.totals[b.key] > 0 && bucketTone[b.key])}>
                                {formatAmount(report.totals[b.key])}
                            </div>
                            <div className="bg-muted mt-2 h-1 overflow-hidden rounded-full">
                                <div className="bg-primary h-full" style={{ width: `${pct(report.totals[b.key])}%` }} />
                            </div>
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
                        <TabsList>
                            <TabsTrigger value="summary">Summary by {party.toLowerCase()}</TabsTrigger>
                            <TabsTrigger value="detail">{doc} details</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {view === 'detail' && (bucket || partyId) && (
                        <Button variant="ghost" size="sm" onClick={() => drill(null, null)}>
                            Clear drill-down
                        </Button>
                    )}
                </div>

                {view === 'summary' ? (
                    <TableShell>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{party}</TableHead>
                                    {BUCKETS.map((b) => (
                                        <TableHead key={b.key} className="text-right">
                                            {b.label}
                                        </TableHead>
                                    ))}
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {summary.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                                            Nothing outstanding as of {formatDate(report.as_of)}.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    summary.map((r) => (
                                        <TableRow key={r.party_id}>
                                            <TableCell>
                                                <button
                                                    type="button"
                                                    className="hover:text-primary text-left font-medium hover:underline"
                                                    onClick={() => drill(r.party_id, null)}
                                                >
                                                    {r.party_name}
                                                </button>
                                                <div className="text-muted-foreground text-xs">
                                                    {r.documents} {doc.toLowerCase()}
                                                    {r.documents === 1 ? '' : 's'}
                                                </div>
                                            </TableCell>
                                            {BUCKETS.map((b) => (
                                                <TableCell key={b.key} className="text-right font-mono tabular-nums">
                                                    {r[b.key] > 0 ? (
                                                        <button
                                                            type="button"
                                                            className={cn('hover:underline', b.key !== 'current' && bucketTone[b.key])}
                                                            onClick={() => drill(r.party_id, b.key)}
                                                        >
                                                            {formatAmount(r[b.key])}
                                                        </button>
                                                    ) : (
                                                        <span className="text-muted-foreground/50">—</span>
                                                    )}
                                                </TableCell>
                                            ))}
                                            <TableCell className="text-right font-mono font-medium tabular-nums">{formatAmount(r.total)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell>Total</TableCell>
                                    {BUCKETS.map((b) => (
                                        <TableCell key={b.key} className="text-right font-mono tabular-nums">
                                            {formatAmount(report.totals[b.key])}
                                        </TableCell>
                                    ))}
                                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                                        {formatAmount(report.totals.total)}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </TableShell>
                ) : (
                    <TableShell>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{doc}</TableHead>
                                    <TableHead>{party}</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Due</TableHead>
                                    <TableHead className="text-right">Days late</TableHead>
                                    <TableHead>Bucket</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead className="text-right">Paid</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {details.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-muted-foreground h-24 text-center">
                                            No documents match.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    details.map((d) => (
                                        <TableRow key={d.id}>
                                            <TableCell>
                                                <Link href={d.url} className="text-primary font-mono text-sm hover:underline">
                                                    {d.number}
                                                </Link>
                                                {d.external_ref && <div className="text-muted-foreground font-mono text-xs">{d.external_ref}</div>}
                                            </TableCell>
                                            <TableCell className="font-medium">{d.party_name}</TableCell>
                                            <TableCell className="whitespace-nowrap">{formatDate(d.doc_date)}</TableCell>
                                            <TableCell className="whitespace-nowrap">{formatDate(d.due_date)}</TableCell>
                                            <TableCell className={cn('text-right tabular-nums', bucketTone[d.bucket])}>
                                                {d.days_past_due || '—'}
                                            </TableCell>
                                            <TableCell className={cn('text-sm', bucketTone[d.bucket])}>
                                                {BUCKETS.find((b) => b.key === d.bucket)?.label}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                                                {formatAmount(d.total)}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                                                {formatAmount(d.paid_as_of)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-medium tabular-nums">{formatAmount(d.balance)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell colSpan={8}>Total shown</TableCell>
                                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                                        {formatAmount(details.reduce((s, d) => s + d.balance, 0))}
                                    </TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </TableShell>
                )}
            </PageBody>
        </AppLayout>
    );
}
