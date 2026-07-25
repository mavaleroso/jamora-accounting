import { Head, Link, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangleIcon, PlayIcon, RefreshCwIcon } from 'lucide-react';
import * as React from 'react';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SyncRun } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Optical Sync', href: '/integration/optical' },
];

type Props = {
    runs: SyncRun[];
    lastRun: SyncRun | null;
    failedCount: number;
};

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'completed') return 'default';
    if (status === 'running') return 'secondary';
    if (status === 'failed' || status === 'completed_with_errors') return 'destructive';
    return 'outline';
}

const columns: ColumnDef<SyncRun>[] = [
    {
        accessorKey: 'started_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Started" />,
        cell: ({ row }) => formatDateTime(row.original.started_at),
    },
    {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
            <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>
        ),
    },
    {
        accessorKey: 'processed',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Processed" />,
    },
    {
        accessorKey: 'created_entries',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
    },
    {
        accessorKey: 'skipped',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Skipped" />,
    },
    {
        accessorKey: 'failed',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Failed" />,
    },
    {
        accessorKey: 'triggered_by',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Triggered By" />,
        cell: ({ row }) => row.original.triggered_by ?? 'Scheduler',
    },
    {
        accessorKey: 'message',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Message" />,
        cell: ({ row }) => (
            <span className="line-clamp-2 max-w-xs text-muted-foreground">
                {row.original.message ?? '—'}
            </span>
        ),
    },
];

export default function OpticalSyncPage({ runs, lastRun, failedCount }: Props) {
    const [from, setFrom] = React.useState('');
    const [to, setTo] = React.useState('');
    const [syncing, setSyncing] = React.useState(false);

    const handleSync = () => {
        setSyncing(true);
        router.post(
            '/integration/optical/run',
            { from: from || undefined, to: to || undefined },
            {
                preserveScroll: true,
                onFinish: () => setSyncing(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Optical Sync" />

            <div className="flex flex-col gap-6 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading
                        title="Optical Sync"
                        description="Sync completed orders and payments from the Optical POS into accounting journal entries."
                    />
                    {failedCount > 0 && (
                        <Button variant="outline" asChild>
                            <Link href="/integration/optical/exceptions">
                                <AlertTriangleIcon className="size-4" />
                                {failedCount} exception{failedCount === 1 ? '' : 's'}
                            </Link>
                        </Button>
                    )}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Run Sync</CardTitle>
                        <CardDescription>
                            Leave dates empty to sync all completed orders. Last run:{' '}
                            {lastRun ? `${lastRun.status} at ${formatDateTime(lastRun.started_at)}` : 'never'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
                        <div className="grid flex-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="from">From</Label>
                                <DatePicker id="from" value={from} onChange={setFrom} placeholder="All dates" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="to">To</Label>
                                <DatePicker id="to" value={to} onChange={setTo} placeholder="All dates" />
                            </div>
                        </div>
                        <Button onClick={handleSync} disabled={syncing}>
                            {syncing ? (
                                <RefreshCwIcon className="size-4 animate-spin" />
                            ) : (
                                <PlayIcon className="size-4" />
                            )}
                            Sync Now
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Sync History</CardTitle>
                        <CardDescription>Recent sync runs from manual triggers and the hourly scheduler.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DataTable
                            columns={columns}
                            data={runs}
                            initialSorting={[{ id: 'started_at', desc: true }]}
                        />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
