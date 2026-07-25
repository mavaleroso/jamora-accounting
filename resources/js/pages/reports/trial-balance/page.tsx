import { Head, usePage } from '@inertiajs/react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ReportToolbar } from '../components/report-toolbar';
import { buildExportUrl, getCsrfToken, type ReportPeriodOption } from '../components/report-utils';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Trial Balance', href: '/reports/trial-balance' },
];

type TrialBalanceRow = {
    account_code: string;
    account_name: string;
    classification: string;
    debit: number;
    credit: number;
};

type Props = {
    periods: ReportPeriodOption[];
};

export default function TrialBalancePage({ periods }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canExport = hasPermission(auth, 'reports.export');

    const [periodId, setPeriodId] = React.useState(periods[0] ? String(periods[0].id) : '');
    const [rows, setRows] = React.useState<TrialBalanceRow[]>([]);
    const [totals, setTotals] = React.useState({ debit: 0, credit: 0 });
    const [loading, setLoading] = React.useState(false);
    const [loaded, setLoaded] = React.useState(false);

    const generate = React.useCallback(async () => {
        if (!periodId) {
            toast.error('Please select an accounting period.');
            return;
        }

        setLoading(true);
        setLoaded(false);

        try {
            const res = await fetch('/reports/trial-balance/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({ period_id: Number(periodId) }),
                credentials: 'same-origin',
            });

            if (!res.ok) throw new Error('Failed to load trial balance');

            const json = (await res.json()) as {
                rows: TrialBalanceRow[];
                totals: { debit: number; credit: number };
            };
            setRows(json.rows);
            setTotals(json.totals);
            setLoaded(true);
        } catch {
            toast.error('Failed to load trial balance. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [periodId]);

    const exportUrl = buildExportUrl('/reports/trial-balance/export', {
        period_id: periodId ? Number(periodId) : undefined,
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Trial Balance" />
            <div className="report-print-area flex h-full flex-1 flex-col gap-5 rounded-xl p-4">
                <Heading
                    title="Trial Balance"
                    description="Debit and credit balances by account for the selected period."
                />

                <ReportToolbar
                    periods={periods}
                    periodId={periodId}
                    onPeriodChange={setPeriodId}
                    onGenerate={generate}
                    loading={loading}
                    canExport={canExport && loaded}
                    exportUrl={exportUrl}
                />

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 py-5">
                        <CardTitle className="text-base font-semibold">Trial Balance</CardTitle>
                        <CardDescription>
                            {loaded
                                ? `${rows.length.toLocaleString()} ${rows.length === 1 ? 'account' : 'accounts'}`
                                : 'Generate the report to view balances.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Account</TableHead>
                                        <TableHead>Classification</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rows.length > 0 ? (
                                        rows.map((row) => (
                                            <TableRow key={row.account_code}>
                                                <TableCell className="font-mono text-sm">
                                                    {row.account_code}
                                                </TableCell>
                                                <TableCell>{row.account_name}</TableCell>
                                                <TableCell className="capitalize text-muted-foreground">
                                                    {row.classification}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {row.debit > 0 ? formatPhpCurrency(row.debit) : '--'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {row.credit > 0 ? formatPhpCurrency(row.credit) : '--'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell
                                                colSpan={5}
                                                className="h-24 text-center text-muted-foreground"
                                            >
                                                {loaded
                                                    ? 'No balances found for this period.'
                                                    : 'Select a period and click Generate.'}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {rows.length > 0 ? (
                                        <TableRow className="bg-muted/40 font-bold">
                                            <TableCell colSpan={3}>Totals</TableCell>
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
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
