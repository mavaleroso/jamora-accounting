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
    { title: 'Income Statement', href: '/reports/income-statement' },
];

type StatementLine = {
    account_code: string;
    account_name: string;
    amount: number;
};

type IncomeStatementData = {
    revenue: StatementLine[];
    expenses: StatementLine[];
    total_revenue: number;
    total_expenses: number;
    net_income: number;
};

type Props = {
    periods: ReportPeriodOption[];
};

function SectionTable({
    title,
    lines,
    totalLabel,
    total,
}: {
    title: string;
    lines: StatementLine[];
    totalLabel: string;
    total: number;
}) {
    return (
        <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {lines.length > 0 ? (
                        lines.map((line) => (
                            <TableRow key={`${title}-${line.account_code}`}>
                                <TableCell className="font-mono text-sm">{line.account_code}</TableCell>
                                <TableCell>{line.account_name}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                    {formatPhpCurrency(line.amount)}
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                                No {title.toLowerCase()} accounts with activity.
                            </TableCell>
                        </TableRow>
                    )}
                    <TableRow className="bg-muted/40 font-bold">
                        <TableCell colSpan={2}>{totalLabel}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                            {formatPhpCurrency(total)}
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    );
}

export default function IncomeStatementPage({ periods }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canExport = hasPermission(auth, 'reports.export');

    const [periodId, setPeriodId] = React.useState(periods[0] ? String(periods[0].id) : '');
    const [data, setData] = React.useState<IncomeStatementData | null>(null);
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
            const res = await fetch('/reports/income-statement/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({ period_id: Number(periodId) }),
                credentials: 'same-origin',
            });

            if (!res.ok) throw new Error('Failed to load income statement');

            const json = (await res.json()) as IncomeStatementData;
            setData(json);
            setLoaded(true);
        } catch {
            toast.error('Failed to load income statement. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [periodId]);

    const exportUrl = buildExportUrl('/reports/income-statement/export', {
        period_id: periodId ? Number(periodId) : undefined,
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Income Statement" />
            <div className="report-print-area flex h-full flex-1 flex-col gap-5 rounded-xl p-4">
                <Heading
                    title="Income Statement"
                    description="Revenue, expenses, and net income for the selected period."
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
                        <CardTitle className="text-base font-semibold">Income Statement</CardTitle>
                        <CardDescription>
                            {loaded && data
                                ? `Net income: ${formatPhpCurrency(data.net_income)}`
                                : 'Generate the report to view results.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8 p-4">
                        {loaded && data ? (
                            <>
                                <SectionTable
                                    title="Revenue"
                                    lines={data.revenue}
                                    totalLabel="Total Revenue"
                                    total={data.total_revenue}
                                />
                                <SectionTable
                                    title="Expenses"
                                    lines={data.expenses}
                                    totalLabel="Total Expenses"
                                    total={data.total_expenses}
                                />
                                <div className="flex justify-end border-t pt-4">
                                    <div className="text-right">
                                        <p className="text-sm text-muted-foreground">Net Income</p>
                                        <p className="text-xl font-bold font-mono tabular-nums">
                                            {formatPhpCurrency(data.net_income)}
                                        </p>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="py-8 text-center text-muted-foreground">
                                Select a period and click Generate.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
