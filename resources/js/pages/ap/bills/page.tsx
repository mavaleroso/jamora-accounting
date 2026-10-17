import { ListTable, TableCard, TableEmpty } from '@/components/data-table';
import { FilterBar } from '@/components/finance/filter-bar';
import { daysPastDue, formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import { StatusBadge } from '@/components/finance/status-badge';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { hasPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { AlarmClockIcon, CalendarClockIcon, CreditCardIcon, PlusIcon, SendIcon } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Bills & Payables', href: '/ap/bills' }];

type BillRow = {
    id: number;
    bill_no: string;
    vendor_invoice_no: string | null;
    bill_date: string;
    due_date: string | null;
    status: string;
    total_amount: string;
    amount_paid: string;
    balance_due: string;
    vendor?: { id: number; code: string; name: string } | null;
};

type Props = {
    bills: Paginated<BillRow>;
    filters: Record<string, string | null>;
    summary: {
        outstanding: number;
        overdue: number;
        overdueCount: number;
        dueWeek: number;
        dueWeekCount: number;
        paidMtd: number;
        draftCount: number;
    };
};

/** Days past due for open bills (negative = days left); null when not open. */
function dueIn(b: BillRow): number | null {
    return ['posted', 'partially_paid'].includes(b.status) ? daysPastDue(b.due_date) : null;
}

export default function BillsPage({ bills, filters, summary }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bills & Payables" />
            <PageBody>
                <PageHeader
                    title="Bills & Payables"
                    description="Supplier bills with due dates. Unpaid bills are listed soonest-due first."
                    actions={
                        hasPermission(auth, 'ap.manage') && (
                            <Button asChild>
                                <Link href="/ap/bills/create">
                                    <PlusIcon className="size-4" />
                                    Enter bill
                                </Link>
                            </Button>
                        )
                    }
                />

                <StatGrid>
                    <StatCard
                        title="Accounts payable"
                        value={formatPhpCurrency(summary.outstanding)}
                        icon={CreditCardIcon}
                        description={`${summary.draftCount} draft${summary.draftCount === 1 ? '' : 's'} not yet posted`}
                    />
                    <StatCard
                        title="Overdue"
                        value={formatPhpCurrency(summary.overdue)}
                        icon={AlarmClockIcon}
                        tone={summary.overdueCount ? 'danger' : 'success'}
                        emphasize={summary.overdueCount > 0}
                        description={`${summary.overdueCount} bill${summary.overdueCount === 1 ? '' : 's'} past due`}
                        href={summary.overdueCount ? '/ap/bills?due=overdue' : undefined}
                    />
                    <StatCard
                        title="Due in 7 days"
                        value={formatPhpCurrency(summary.dueWeek)}
                        icon={CalendarClockIcon}
                        tone={summary.dueWeekCount ? 'warning' : 'default'}
                        description={`${summary.dueWeekCount} bill${summary.dueWeekCount === 1 ? '' : 's'} to schedule`}
                        href={summary.dueWeekCount ? '/ap/bills?due=week' : undefined}
                    />
                    <StatCard title="Paid this month" value={formatPhpCurrency(summary.paidMtd)} icon={SendIcon} tone="success" />
                </StatGrid>

                <TableCard>
                    <FilterBar
                        url="/ap/bills"
                        filters={filters}
                        searchPlaceholder="Bill no., supplier invoice no. or supplier"
                        selects={[
                            {
                                key: 'status',
                                label: 'Statuses',
                                options: [
                                    { value: 'draft', label: 'Draft' },
                                    { value: 'posted', label: 'Posted' },
                                    { value: 'partially_paid', label: 'Partially paid' },
                                    { value: 'paid', label: 'Paid' },
                                ],
                            },
                            {
                                key: 'due',
                                label: 'Due',
                                options: [
                                    { value: 'overdue', label: 'Overdue' },
                                    { value: 'week', label: 'Due in 7 days' },
                                ],
                            },
                        ]}
                        dateRange={{ from: 'date_from', to: 'date_to' }}
                    />
                    <ListTable
                        rows={bills.data}
                        rowKey={(b) => b.id}
                        sequenceStart={bills.from ?? 1}
                        onRowClick={(b) => router.visit(`/ap/bills/${b.id}`)}
                        rowAccent={(b) => (dueIn(b) !== null && dueIn(b)! > 0 ? 'bg-red-500' : 'bg-primary')}
                        columns={[
                            {
                                id: 'bill',
                                header: 'Bill',
                                cell: (b) => (
                                    <>
                                        <div className="font-mono text-sm font-medium">{b.bill_no}</div>
                                        <div className="font-mono text-xs text-muted-foreground">{b.vendor_invoice_no ? `Supplier inv. ${b.vendor_invoice_no}` : ''}</div>
                                    </>
                                ),
                            },
                            { id: 'supplier', header: 'Supplier', className: 'font-medium', cell: (b) => b.vendor?.name ?? '—' },
                            { id: 'date', header: 'Bill date', minScreen: 'lg', className: 'whitespace-nowrap', cell: (b) => formatDate(b.bill_date) },
                            {
                                id: 'due',
                                header: 'Due',
                                className: 'whitespace-nowrap',
                                cell: (b) => {
                                    const days = dueIn(b);
                                    return (
                                        <>
                                            {formatDate(b.due_date)}
                                            {days !== null && days > 0 && <div className="text-xs font-medium text-red-600 dark:text-red-400">{days} days overdue</div>}
                                            {days !== null && days <= 0 && days > -8 && <div className="text-xs text-amber-600 dark:text-amber-400">{days === 0 ? 'Due today' : `Due in ${-days} days`}</div>}
                                        </>
                                    );
                                },
                            },
                            { id: 'status', header: 'Status', cell: (b) => <StatusBadge status={(dueIn(b) ?? 0) > 0 ? 'overdue' : b.status} /> },
                            { id: 'total', header: 'Total', align: 'right', className: 'font-mono tabular-nums', cell: (b) => formatAmount(b.total_amount) },
                            { id: 'balance', header: 'Balance', align: 'right', className: 'font-mono font-medium tabular-nums', cell: (b) => formatAmount(b.balance_due) },
                        ]}
                        mobileRow={(b) => (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate font-mono text-sm font-medium">{b.bill_no}</span>
                                    <span className="font-mono text-sm font-medium tabular-nums">{formatAmount(b.balance_due)}</span>
                                </div>
                                <div className="truncate text-sm">{b.vendor?.name ?? '—'}</div>
                                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                    <StatusBadge status={(dueIn(b) ?? 0) > 0 ? 'overdue' : b.status} />
                                    <span>Due {formatDate(b.due_date)}</span>
                                </div>
                            </div>
                        )}
                        empty={<TableEmpty icon={SendIcon} title="No bills match these filters" description="Try a different search, status or date range." />}
                    />
                    <Paginator page={bills} />
                </TableCard>
            </PageBody>
        </AppLayout>
    );
}
