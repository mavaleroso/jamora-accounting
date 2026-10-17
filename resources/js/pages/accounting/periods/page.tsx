import { Head, router, usePage } from '@inertiajs/react';
import { CalendarRange, Loader2, MoreHorizontal } from 'lucide-react';
import * as React from 'react';
import { ListTable, TableCard, TableEmpty, TableToolbar } from '@/components/data-table';
import { useConfirm } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { hasPermission } from '@/lib/permissions';
import type {
    AccountingPeriod,
    AccountingPeriodStatus,
    BreadcrumbItem,
    FiscalYear,
    SharedData,
} from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Accounting Periods', href: '/accounting/periods' },
];

type Props = {
    fiscalYears: FiscalYear[];
    selectedFiscalYearId: number | null;
    periods: AccountingPeriod[];
};

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

function statusVariant(status: AccountingPeriodStatus): 'default' | 'secondary' | 'destructive' {
    switch (status) {
        case 'open':
            return 'default';
        case 'soft-closed':
            return 'secondary';
        case 'closed':
            return 'destructive';
        default:
            return 'secondary';
    }
}

function formatStatus(status: AccountingPeriodStatus): string {
    return status
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export default function AccountingPeriods({
    fiscalYears,
    selectedFiscalYearId,
    periods,
}: Props) {
    const { auth } = usePage<SharedData>().props;
    const canClose = hasPermission(auth, 'periods.close');
    const canReopen = hasPermission(auth, 'periods.reopen');
    const [processingId, setProcessingId] = React.useState<number | null>(null);
    const confirm = useConfirm();

    const selectedYear = fiscalYears.find((y) => y.id === selectedFiscalYearId) ?? fiscalYears[0];

    const changeFiscalYear = (fiscalYearId: string) => {
        router.get(
            '/accounting/periods',
            fiscalYearId ? { fiscal_year_id: fiscalYearId } : {},
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const PERIOD_CONFIRM = {
        'soft-close': { title: 'Soft close this period?', description: 'Nothing can be posted to this period while it is soft-closed. It can be reopened later.', confirmLabel: 'Soft close' },
        close: { title: 'Close this period?', description: 'Nothing can be posted to this period until it is reopened. Closing the last period of the fiscal year also books the year-end closing entry. Make sure the review is complete.', confirmLabel: 'Close period', variant: 'destructive' as const },
        reopen: { title: 'Reopen this period?', description: 'Posting to this period will be allowed again, which can change reports already issued for it.', confirmLabel: 'Reopen' },
    };

    const handlePeriodAction = async (periodId: number, periodNo: number | string, action: 'soft-close' | 'close' | 'reopen') => {
        const c = PERIOD_CONFIRM[action];
        if (!(await confirm({ ...c, title: c.title.replace('this period', `period ${periodNo}`) }))) return;
        setProcessingId(periodId);
        router.post(
            `/accounting/periods/${periodId}/${action}`,
            {},
            {
                preserveScroll: true,
                onFinish: () => {
                    setProcessingId(null);
                },
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Accounting Periods" />
            <div className="flex h-full flex-1 flex-col gap-5 p-4 sm:p-6">
                <Heading title="Accounting Periods" description="Manage fiscal year periods and period close status" />

                <TableCard
                    title={selectedYear ? `Fiscal year ${selectedYear.code}` : 'Periods'}
                    description={selectedYear ? `${formatDate(selectedYear.start_date)} — ${formatDate(selectedYear.end_date)}` : undefined}
                    actions={selectedYear && <Badge variant="outline" className="capitalize">{selectedYear.status}</Badge>}
                >
                    {fiscalYears.length > 0 && (
                        <TableToolbar>
                            <Select value={String(selectedFiscalYearId ?? selectedYear?.id ?? '')} onValueChange={changeFiscalYear}>
                                <SelectTrigger className="h-9 w-full lg:w-80" aria-label="Fiscal year">
                                    <SelectValue placeholder="Fiscal year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {fiscalYears.map((year) => (
                                        <SelectItem key={year.id} value={String(year.id)}>
                                            {year.code} ({formatDate(year.start_date)} — {formatDate(year.end_date)})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </TableToolbar>
                    )}
                    <ListTable
                        rows={periods}
                        rowKey={(p) => p.id}
                        sequenceStart={false}
                        rowAccent={(p) => (p.status === 'open' ? 'bg-emerald-500' : p.status === 'closed' ? 'bg-red-500' : 'bg-amber-500')}
                        actions={
                            canClose || canReopen
                                ? (period) => {
                                      const busy = processingId === period.id;
                                      const options = [
                                          canClose && period.status === 'open' && { key: 'soft-close' as const, label: 'Soft close' },
                                          canClose && period.status !== 'closed' && { key: 'close' as const, label: 'Close period', destructive: true },
                                          canReopen && period.status !== 'open' && { key: 'reopen' as const, label: 'Reopen' },
                                      ].filter(Boolean) as { key: 'soft-close' | 'close' | 'reopen'; label: string; destructive?: boolean }[];
                                      return (
                                          <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                  <Button variant="ghost" size="icon" className="size-8" disabled={busy || options.length === 0} aria-label={`Actions for period ${period.period_no}`}>
                                                      {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                                                  </Button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="start">
                                                  {options.map((o) => (
                                                      <DropdownMenuItem key={o.key} variant={o.destructive ? 'destructive' : 'default'} onSelect={() => handlePeriodAction(period.id, period.period_no, o.key)}>
                                                          {o.label}
                                                      </DropdownMenuItem>
                                                  ))}
                                              </DropdownMenuContent>
                                          </DropdownMenu>
                                      );
                                  }
                                : undefined
                        }
                        columns={[
                            { id: 'no', header: '#', headerClassName: 'w-12 text-right', className: 'w-12 text-right font-mono text-xs text-muted-foreground tabular-nums', cell: (p) => p.period_no },
                            { id: 'start', header: 'Start date', className: 'whitespace-nowrap', cell: (p) => formatDate(p.start_date) },
                            { id: 'end', header: 'End date', className: 'whitespace-nowrap', cell: (p) => formatDate(p.end_date) },
                            { id: 'status', header: 'Status', cell: (p) => <Badge variant={statusVariant(p.status)}>{formatStatus(p.status)}</Badge> },
                            { id: 'closed_by', header: 'Closed by', minScreen: 'md', className: 'text-muted-foreground', cell: (p) => p.closed_by_user?.name ?? '—' },
                            { id: 'closed_at', header: 'Closed at', minScreen: 'lg', className: 'text-muted-foreground', cell: (p) => (p.closed_at ? new Date(p.closed_at).toLocaleString() : '—') },
                        ]}
                        empty={<TableEmpty icon={CalendarRange} title="No periods found for this fiscal year" />}
                    />
                </TableCard>
            </div>
        </AppLayout>
    );
}
