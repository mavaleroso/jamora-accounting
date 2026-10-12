import { Head, router, usePage } from '@inertiajs/react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
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
    const [actionType, setActionType] = React.useState<string | null>(null);

    const selectedYear = fiscalYears.find((y) => y.id === selectedFiscalYearId) ?? fiscalYears[0];

    const handleFiscalYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const fiscalYearId = e.target.value;
        router.get(
            '/accounting/periods',
            fiscalYearId ? { fiscal_year_id: fiscalYearId } : {},
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const handlePeriodAction = (periodId: number, action: 'soft-close' | 'close' | 'reopen') => {
        setProcessingId(periodId);
        setActionType(action);
        router.post(
            `/accounting/periods/${periodId}/${action}`,
            {},
            {
                preserveScroll: true,
                onFinish: () => {
                    setProcessingId(null);
                    setActionType(null);
                },
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Accounting Periods" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <Heading
                    title="Accounting Periods"
                    description="Manage fiscal year periods and period close status"
                />

                {fiscalYears.length > 0 && (
                    <div className="flex max-w-xs flex-col gap-2">
                        <Label htmlFor="fiscal_year_id">Fiscal Year</Label>
                        <select
                            id="fiscal_year_id"
                            value={selectedFiscalYearId ?? selectedYear?.id ?? ''}
                            onChange={handleFiscalYearChange}
                            className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                        >
                            {fiscalYears.map((year) => (
                                <option key={year.id} value={year.id}>
                                    {year.code} ({formatDate(year.start_date)} — {formatDate(year.end_date)})
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {selectedYear && (
                    <div className="text-sm text-muted-foreground">
                        Status: <Badge variant="outline">{selectedYear.status}</Badge>
                    </div>
                )}

                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-16">#</TableHead>
                                <TableHead>Start Date</TableHead>
                                <TableHead>End Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Closed By</TableHead>
                                <TableHead>Closed At</TableHead>
                                {(canClose || canReopen) && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {periods.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={canClose || canReopen ? 7 : 6}
                                        className="h-24 text-center text-muted-foreground"
                                    >
                                        No periods found for this fiscal year.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                periods.map((period) => {
                                    const isProcessing = processingId === period.id;
                                    return (
                                        <TableRow key={period.id}>
                                            <TableCell className="tabular-nums">{period.period_no}</TableCell>
                                            <TableCell>{formatDate(period.start_date)}</TableCell>
                                            <TableCell>{formatDate(period.end_date)}</TableCell>
                                            <TableCell>
                                                <Badge variant={statusVariant(period.status)}>
                                                    {formatStatus(period.status)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {period.closed_by_user?.name ?? '—'}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {period.closed_at
                                                    ? new Date(period.closed_at).toLocaleString()
                                                    : '—'}
                                            </TableCell>
                                            {(canClose || canReopen) && (
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {canClose && period.status === 'open' && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={isProcessing}
                                                                onClick={() =>
                                                                    handlePeriodAction(period.id, 'soft-close')
                                                                }
                                                            >
                                                                {isProcessing && actionType === 'soft-close'
                                                                    ? 'Processing...'
                                                                    : 'Soft Close'}
                                                            </Button>
                                                        )}
                                                        {canClose && period.status !== 'closed' && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="destructive"
                                                                disabled={isProcessing}
                                                                onClick={() =>
                                                                    handlePeriodAction(period.id, 'close')
                                                                }
                                                            >
                                                                {isProcessing && actionType === 'close'
                                                                    ? 'Processing...'
                                                                    : 'Close'}
                                                            </Button>
                                                        )}
                                                        {canReopen && period.status !== 'open' && (
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={isProcessing}
                                                                onClick={() =>
                                                                    handlePeriodAction(period.id, 'reopen')
                                                                }
                                                            >
                                                                {isProcessing && actionType === 'reopen'
                                                                    ? 'Processing...'
                                                                    : 'Reopen'}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </TableShell>
            </div>
        </AppLayout>
    );
}
