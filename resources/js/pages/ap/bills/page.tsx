import { FilterBar } from '@/components/finance/filter-bar';
import { daysPastDue, formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import { StatusBadge } from '@/components/finance/status-badge';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
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

                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Bill</TableHead>
                                <TableHead>Supplier</TableHead>
                                <TableHead>Bill date</TableHead>
                                <TableHead>Due</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bills.data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-muted-foreground h-32 text-center">
                                        No bills match these filters.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                bills.data.map((b) => {
                                    const open = ['posted', 'partially_paid'].includes(b.status);
                                    const days = open ? daysPastDue(b.due_date) : 0;
                                    return (
                                        <TableRow
                                            key={b.id}
                                            className="hover:bg-muted/40 cursor-pointer"
                                            onClick={() => router.visit(`/ap/bills/${b.id}`)}
                                        >
                                            <TableCell>
                                                <div className="font-mono text-sm font-medium">{b.bill_no}</div>
                                                <div className="text-muted-foreground font-mono text-xs">
                                                    {b.vendor_invoice_no ? `Supplier inv. ${b.vendor_invoice_no}` : ''}
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-medium">{b.vendor?.name ?? '—'}</TableCell>
                                            <TableCell className="whitespace-nowrap">{formatDate(b.bill_date)}</TableCell>
                                            <TableCell className="whitespace-nowrap">
                                                {formatDate(b.due_date)}
                                                {open && days > 0 && (
                                                    <div className="text-xs font-medium text-red-600 dark:text-red-400">{days} days overdue</div>
                                                )}
                                                {open && days <= 0 && days > -8 && (
                                                    <div className="text-xs text-amber-600 dark:text-amber-400">
                                                        {days === 0 ? 'Due today' : `Due in ${-days} days`}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge status={days > 0 ? 'overdue' : b.status} />
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">{formatAmount(b.total_amount)}</TableCell>
                                            <TableCell className="text-right font-mono font-medium tabular-nums">
                                                {formatAmount(b.balance_due)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </TableShell>
                <Paginator page={bills} noun="bills" />
            </PageBody>
        </AppLayout>
    );
}
