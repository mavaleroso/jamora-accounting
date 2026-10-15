import { FilterBar } from '@/components/finance/filter-bar';
import { daysPastDue, formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import { StatusBadge } from '@/components/finance/status-badge';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { hasPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { AlarmClockIcon, FileTextIcon, HandCoinsIcon, PlusIcon, ReceiptIcon } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Invoices & Billing', href: '/billing/invoices' }];

type InvoiceRow = {
    id: number;
    invoice_no: string;
    bir_si_or_no: string | null;
    invoice_date: string;
    due_date: string | null;
    pricing_type: 'retail' | 'wholesale';
    status: string;
    is_senior_pwd: boolean;
    total_amount: string;
    amount_paid: string;
    balance_due: string;
    partner?: { id: number; code: string; name: string; type: string } | null;
};

type Props = {
    invoices: Paginated<InvoiceRow>;
    filters: Record<string, string | boolean | null>;
    summary: { outstanding: number; overdue: number; overdueCount: number; draftCount: number; billedMtd: number; collectedMtd: number };
};

export default function InvoicesPage({ invoices, filters, summary }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canManage = hasPermission(auth, 'billing.manage');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Invoices & Billing" />
            <PageBody>
                <PageHeader
                    title="Invoices & Billing"
                    description="Product sales, patient billing and service jobs recorded against the BIR-accredited invoice series."
                    actions={
                        canManage && (
                            <Button asChild>
                                <Link href="/billing/invoices/create">
                                    <PlusIcon className="size-4" />
                                    New invoice
                                </Link>
                            </Button>
                        )
                    }
                />

                <StatGrid>
                    <StatCard
                        title="Outstanding receivables"
                        value={formatPhpCurrency(summary.outstanding)}
                        icon={ReceiptIcon}
                        description="Open and partially paid invoices"
                    />
                    <StatCard
                        title="Overdue"
                        value={formatPhpCurrency(summary.overdue)}
                        icon={AlarmClockIcon}
                        tone={summary.overdueCount > 0 ? 'danger' : 'success'}
                        emphasize={summary.overdueCount > 0}
                        description={`${summary.overdueCount} invoice${summary.overdueCount === 1 ? '' : 's'} past due`}
                        href={summary.overdueCount > 0 ? '/billing/invoices?overdue=1' : undefined}
                    />
                    <StatCard
                        title="Billed this month"
                        value={formatPhpCurrency(summary.billedMtd)}
                        icon={FileTextIcon}
                        tone="info"
                        description={`${summary.draftCount} draft${summary.draftCount === 1 ? '' : 's'} awaiting confirmation`}
                    />
                    <StatCard
                        title="Collected this month"
                        value={formatPhpCurrency(summary.collectedMtd)}
                        icon={HandCoinsIcon}
                        tone="success"
                        description="Cash, GCash, card, check and transfers"
                    />
                </StatGrid>

                <FilterBar
                    url="/billing/invoices"
                    filters={{
                        search: filters.search,
                        status: filters.status,
                        pricing_type: filters.pricing_type,
                        date_from: filters.date_from,
                        date_to: filters.date_to,
                        overdue: filters.overdue,
                    }}
                    searchPlaceholder="Invoice no., BIR SI/OR no. or customer"
                    selects={[
                        {
                            key: 'status',
                            label: 'Statuses',
                            options: [
                                { value: 'draft', label: 'Draft' },
                                { value: 'confirmed', label: 'Open' },
                                { value: 'partially_paid', label: 'Partially paid' },
                                { value: 'paid', label: 'Paid' },
                            ],
                        },
                        {
                            key: 'pricing_type',
                            label: 'Pricing',
                            options: [
                                { value: 'retail', label: 'Retail' },
                                { value: 'wholesale', label: 'Wholesale' },
                            ],
                        },
                    ]}
                    dateRange={{ from: 'date_from', to: 'date_to' }}
                />

                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Invoice</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Due</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {invoices.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-muted-foreground h-32 text-center">
                                        No invoices match these filters.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                invoices.data.map((inv) => {
                                    const open = ['confirmed', 'partially_paid'].includes(inv.status);
                                    const late = open ? daysPastDue(inv.due_date) : 0;

                                    return (
                                        <TableRow
                                            key={inv.id}
                                            className="hover:bg-muted/40 cursor-pointer"
                                            onClick={() => router.visit(`/billing/invoices/${inv.id}`)}
                                        >
                                            <TableCell>
                                                <div className="font-mono text-sm font-medium">{inv.invoice_no}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    {inv.bir_si_or_no ? `BIR ${inv.bir_si_or_no}` : 'No BIR no. yet'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{inv.partner?.name ?? '—'}</div>
                                                <div className="flex gap-1 pt-0.5">
                                                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal capitalize">
                                                        {inv.pricing_type}
                                                    </Badge>
                                                    {inv.is_senior_pwd && (
                                                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                                                            Senior/PWD
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">{formatDate(inv.invoice_date)}</TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {formatDate(inv.due_date)}
                                                {late > 0 && (
                                                    <div className="text-xs font-medium text-red-600 dark:text-red-400">{late} days overdue</div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={late > 0 ? 'overdue' : inv.status} />
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">{formatAmount(inv.total_amount)}</TableCell>
                                            <TableCell className="text-muted-foreground text-right font-mono tabular-nums">
                                                {formatAmount(inv.amount_paid)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-medium tabular-nums">
                                                {formatAmount(inv.balance_due)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </TableShell>
                <Paginator page={invoices} noun="invoices" />
            </PageBody>
        </AppLayout>
    );
}
