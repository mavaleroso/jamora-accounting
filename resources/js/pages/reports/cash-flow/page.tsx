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
    { title: 'Cash Flow', href: '/reports/cash-flow' },
];

type CashFlowLine = {
    account_code: string | null;
    account_name: string;
    amount: number;
};

type CashFlowSection = {
    lines: CashFlowLine[];
    total: number;
};

type CashFlowData = {
    operating: CashFlowSection;
    investing: CashFlowSection;
    financing: CashFlowSection;
    net_cash_change: number;
};

type Props = {
    periods: ReportPeriodOption[];
};

function SectionTable({ title, section }: { title: string; section: CashFlowSection }) {
    return (
        <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {section.lines.length > 0 ? (
                        section.lines.map((line, index) => (
                            <TableRow key={`${title}-${line.account_code ?? 'line'}-${index}`}>
                                <TableCell className="font-mono text-sm">
                                    {line.account_code ?? '--'}
                                </TableCell>
                                <TableCell>{line.account_name}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                    {formatPhpCurrency(line.amount)}
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                                No activity in this section.
                            </TableCell>
                        </TableRow>
                    )}
                    <TableRow className="bg-muted/40 font-bold">
                        <TableCell colSpan={2}>Net cash from {title}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                            {formatPhpCurrency(section.total)}
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    );
}

export default function CashFlowPage({ periods }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canExport = hasPermission(auth, 'reports.export');

    const [periodId, setPeriodId] = React.useState(periods[0] ? String(periods[0].id) : '');
    const [data, setData] = React.useState<CashFlowData | null>(null);
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
            const res = await fetch('/reports/cash-flow/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({ period_id: Number(periodId) }),
                credentials: 'same-origin',
            });

            if (!res.ok) throw new Error('Failed to load cash flow statement');

            const json = (await res.json()) as CashFlowData;
            setData(json);
            setLoaded(true);
        } catch {
            toast.error('Failed to load cash flow statement. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [periodId]);

    const exportUrl = buildExportUrl('/reports/cash-flow/export', {
        period_id: periodId ? Number(periodId) : undefined,
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Cash Flow" />
            <div className="report-print-area flex h-full flex-1 flex-col gap-5 rounded-xl p-4">
                <Heading
                    title="Cash Flow Statement"
                    description="Operating, investing, and financing cash flows for the selected period."
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
                        <CardTitle className="text-base font-semibold">Cash Flow Statement</CardTitle>
                        <CardDescription>
                            {loaded && data
                                ? `Net change in cash: ${formatPhpCurrency(data.net_cash_change)}`
                                : 'Generate the report to view results.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8 p-4">
                        {loaded && data ? (
                            <>
                                <SectionTable title="Operating Activities" section={data.operating} />
                                <SectionTable title="Investing Activities" section={data.investing} />
                                <SectionTable title="Financing Activities" section={data.financing} />
                                <div className="flex justify-end border-t pt-4">
                                    <div className="text-right">
                                        <p className="text-sm text-muted-foreground">Net Change in Cash</p>
                                        <p className="text-xl font-bold font-mono tabular-nums">
                                            {formatPhpCurrency(data.net_cash_change)}
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
