import { Head } from '@inertiajs/react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import type { BreadcrumbItem } from '@/types';
import { getCsrfToken } from '../components/report-utils';
import { TableShell } from '@/components/ui/table-shell';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'AR Aging', href: '/reports/ar-aging' }];

type AgingRow = {
    partner_code: string;
    partner_name: string;
    current: number;
    days_30: number;
    days_60: number;
    days_90: number;
    total: number;
};

export default function ArAgingPage() {
    const [asOf, setAsOf] = React.useState(new Date().toISOString().slice(0, 10));
    const [rows, setRows] = React.useState<AgingRow[]>([]);
    const [totals, setTotals] = React.useState({ current: 0, days_30: 0, days_60: 0, days_90: 0, total: 0 });
    const [loading, setLoading] = React.useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/reports/ar-aging/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCsrfToken() },
                body: JSON.stringify({ as_of: asOf }),
                credentials: 'same-origin',
            });
            if (!res.ok) throw new Error('Failed');
            const json = await res.json();
            setRows(json.rows);
            setTotals(json.totals);
        } catch {
            toast.error('Failed to load AR aging report.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="AR Aging" />
            <div className="flex flex-col gap-4 p-4">
                <Heading title="AR Aging" description="Accounts receivable aging by partner" />
                <div className="flex flex-wrap items-end gap-4">
                    <div><Label>As of date</Label><Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
                    <Button onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Generate'}</Button>
                </div>
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Partner</TableHead>
                                <TableHead className="text-right">Current</TableHead>
                                <TableHead className="text-right">1–30</TableHead>
                                <TableHead className="text-right">31–60</TableHead>
                                <TableHead className="text-right">90+</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((r, i) => (
                                <TableRow key={i}>
                                    <TableCell>{r.partner_code} — {r.partner_name}</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(r.current)}</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(r.days_30)}</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(r.days_60)}</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(r.days_90)}</TableCell>
                                    <TableCell className="text-right font-medium">{formatPhpCurrency(r.total)}</TableCell>
                                </TableRow>
                            ))}
                            {rows.length > 0 && (
                                <TableRow className="font-semibold">
                                    <TableCell>Totals</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(totals.current)}</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(totals.days_30)}</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(totals.days_60)}</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(totals.days_90)}</TableCell>
                                    <TableCell className="text-right">{formatPhpCurrency(totals.total)}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableShell>
            </div>
        </AppLayout>
    );
}
