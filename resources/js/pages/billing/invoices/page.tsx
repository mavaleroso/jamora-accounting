import { ListTable, TableCard, TableEmpty } from '@/components/data-table';
import { FilterBar } from '@/components/finance/filter-bar';
import { daysPastDue, formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import { StatusBadge } from '@/components/finance/status-badge';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

/** Days past due for open invoices; 0 when not open or not late. */
function lateDays(inv: InvoiceRow): number {
    return ['confirmed', 'partially_paid'].includes(inv.status) ? daysPastDue(inv.due_date) : 0;
}

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

                <TableCard>
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
                        chipLabels={{ overdue: 'Overdue only' }}
                    />
                    <ListTable
                        rows={invoices.data}
                        rowKey={(inv) => inv.id}
                        sequenceStart={invoices.from ?? 1}
                        onRowClick={(inv) => router.visit(`/billing/invoices/${inv.id}`)}
                        rowAccent={(inv) => (lateDays(inv) > 0 ? 'bg-red-500' : 'bg-primary')}
                        columns={[
                            {
                                id: 'invoice',
                                header: 'Invoice',
                                cell: (inv) => (
                                    <>
                                        <div className="font-mono text-sm font-medium">{inv.invoice_no}</div>
                                        <div className="text-xs text-muted-foreground">{inv.bir_si_or_no ? `BIR ${inv.bir_si_or_no}` : 'No BIR no. yet'}</div>
                                    </>
                                ),
                            },
                            {
                                id: 'customer',
                                header: 'Customer',
                                cell: (inv) => (
                                    <>
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
                                    </>
                                ),
                            },
                            { id: 'date', header: 'Date', minScreen: 'lg', className: 'whitespace-nowrap', cell: (inv) => formatDate(inv.invoice_date) },
                            {
                                id: 'due',
                                header: 'Due',
                                className: 'whitespace-nowrap',
                                cell: (inv) => (
                                    <>
                                        {formatDate(inv.due_date)}
                                        {lateDays(inv) > 0 && <div className="text-xs font-medium text-red-600 dark:text-red-400">{lateDays(inv)} days overdue</div>}
                                    </>
                                ),
                            },
                            { id: 'status', header: 'Status', cell: (inv) => <StatusBadge status={lateDays(inv) > 0 ? 'overdue' : inv.status} /> },
                            { id: 'total', header: 'Total', align: 'right', className: 'font-mono tabular-nums', cell: (inv) => formatAmount(inv.total_amount) },
                            { id: 'paid', header: 'Paid', align: 'right', minScreen: 'xl', className: 'font-mono text-muted-foreground tabular-nums', cell: (inv) => formatAmount(inv.amount_paid) },
                            { id: 'balance', header: 'Balance', align: 'right', className: 'font-mono font-medium tabular-nums', cell: (inv) => formatAmount(inv.balance_due) },
                        ]}
                        mobileRow={(inv) => (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate font-mono text-sm font-medium">{inv.invoice_no}</span>
                                    <span className="font-mono text-sm font-medium tabular-nums">{formatAmount(inv.balance_due)}</span>
                                </div>
                                <div className="truncate text-sm">{inv.partner?.name ?? '—'}</div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    <StatusBadge status={lateDays(inv) > 0 ? 'overdue' : inv.status} />
                                    <span>{formatDate(inv.invoice_date)}</span>
                                </div>
                            </div>
                        )}
                        empty={<TableEmpty icon={ReceiptIcon} title="No invoices match these filters" description="Try a different search, status or date range." />}
                    />
                    <Paginator page={invoices} />
                </TableCard>
            </PageBody>
        </AppLayout>
    );
}
