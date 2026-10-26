import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SyncRun } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangleIcon, CheckCircle2Icon, ClipboardCheckIcon, PlayIcon, RefreshCwIcon, XCircleIcon } from 'lucide-react';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Optical Sync', href: '/integration/optical' }];

type Settings = {
    configured: boolean;
    base_url: string | null;
    start_date: string | null;
    product_entity: string | null;
    workshop_entity: string | null;
    auto_post: boolean;
};

type Props = {
    runs: SyncRun[];
    lastRun: SyncRun | null;
    failedCount: number;
    reviewCount: number;
    cursors: Record<string, string | null>;
    streams: string[];
    settings: Settings;
};

const streamLabels: Record<string, string> = {
    users: 'Users → logins & employee records',
    clients: 'Wholesale clients',
    suppliers: 'Suppliers',
    payments: 'Payments → customer deposits',
    orders: 'Completed orders → sales & cost of goods sold',
    receipts: 'Supplier deliveries → inventory',
    movements: 'Write-offs, returns, untracked sales',
};

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'completed') return 'default';
    if (status === 'running' || status === 'queued') return 'secondary';
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
        cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status.replaceAll('_', ' ')}</Badge>,
    },
    { accessorKey: 'processed', header: ({ column }) => <DataTableColumnHeader column={column} title="Read" /> },
    { accessorKey: 'created_entries', header: ({ column }) => <DataTableColumnHeader column={column} title="Booked" /> },
    { accessorKey: 'skipped', header: ({ column }) => <DataTableColumnHeader column={column} title="Unchanged" /> },
    { accessorKey: 'failed', header: ({ column }) => <DataTableColumnHeader column={column} title="Failed" /> },
    {
        accessorKey: 'triggered_by',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Triggered By" />,
        cell: ({ row }) => row.original.triggered_by ?? 'Scheduler',
    },
    {
        accessorKey: 'message',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Details" />,
        cell: ({ row }) => <span className="text-muted-foreground line-clamp-3 max-w-md text-xs">{row.original.message ?? '—'}</span>,
    },
];

export default function OpticalSyncPage({ runs, lastRun, failedCount, reviewCount, cursors, streams, settings }: Props) {
    const [full, setFull] = React.useState(false);
    const [syncing, setSyncing] = React.useState(false);
    const confirm = useConfirm();
    const active = lastRun?.status === 'queued' || lastRun?.status === 'running';

    // The sync runs on the queue: follow it until it finishes.
    React.useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => router.reload({ only: ['runs', 'lastRun', 'failedCount', 'reviewCount', 'cursors'] }), 5000);
        return () => window.clearInterval(timer);
    }, [active]);

    const handleSync = async () => {
        const ok = await confirm({
            title: full ? 'Re-read everything from the optical POS?' : 'Run the optical sync?',
            description: full
                ? 'Every stream is read again from the start. Documents already booked and unchanged are skipped, so nothing is booked twice — but it takes longer.'
                : 'New and changed payments, orders and stock events since the last sync are booked to each entity’s books.',
            confirmLabel: 'Run sync',
        });
        if (!ok) return;
        setSyncing(true);
        router.post('/integration/optical/run', { full }, { preserveScroll: true, onFinish: () => setSyncing(false) });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Optical Sync" />

            <div className="flex flex-col gap-6 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading
                        title="Optical Sync"
                        description="Payments, completed orders and stock events from the optical POS, booked through its accounting API."
                    />
                    <div className="flex flex-wrap gap-2">
                        {reviewCount > 0 && (
                            <Button variant="outline" asChild>
                                <Link href="/integration/optical/exceptions?status=review">
                                    <ClipboardCheckIcon className="size-4" />
                                    {reviewCount} to review
                                </Link>
                            </Button>
                        )}
                        {failedCount > 0 && (
                            <Button variant="outline" asChild>
                                <Link href="/integration/optical/exceptions?status=failed">
                                    <AlertTriangleIcon className="size-4" />
                                    {failedCount} failed
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Run sync</CardTitle>
                            <CardDescription>
                                Runs hourly on its own. Last run:{' '}
                                {lastRun ? `${lastRun.status.replaceAll('_', ' ')} at ${formatDateTime(lastRun.started_at)}` : 'never'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <label className="flex items-start gap-2 text-sm">
                                <Checkbox checked={full} onCheckedChange={(v) => setFull(v === true)} className="mt-0.5" />
                                <span>
                                    Re-read everything
                                    <span className="text-muted-foreground block text-xs">
                                        Ignore where each stream stopped. Use after changing the go-live date or posting rules.
                                    </span>
                                </span>
                            </label>
                            <Button onClick={handleSync} disabled={syncing || active || !settings.configured} className="self-start">
                                {syncing || active ? <RefreshCwIcon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
                                {active ? (lastRun?.status === 'queued' ? 'Waiting for the queue…' : 'Syncing…') : 'Sync now'}
                            </Button>
                            {!settings.configured && (
                                <p className="text-destructive text-sm">
                                    Set OPTICAL_API_BASE_URL and OPTICAL_API_TOKEN to connect to the optical POS.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Connection & booking rules</CardTitle>
                            <CardDescription>Set in the environment; posting accounts are on the posting-rules screen.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-2 text-sm">
                            <Row
                                label="Optical API"
                                value={
                                    <span className="flex items-center gap-1.5">
                                        {settings.configured ? (
                                            <CheckCircle2Icon className="size-4 text-emerald-600" />
                                        ) : (
                                            <XCircleIcon className="text-destructive size-4" />
                                        )}
                                        <span className="font-mono text-xs">{settings.base_url ?? 'not set'}</span>
                                    </span>
                                }
                            />
                            <Row
                                label="Go-live date"
                                value={
                                    settings.start_date ?? <span className="text-amber-600 dark:text-amber-400">not set — all history is read</span>
                                }
                            />
                            <Row label="Products, edging & repair" value={`${settings.product_entity} / ${settings.workshop_entity}`} />
                            <Row label="Clinical services" value="The clinic that collected the payment" />
                            <Row label="Posting" value={settings.auto_post ? 'Posted to the ledger automatically' : 'Left as drafts for review'} />
                            <Button variant="link" asChild className="h-auto self-start p-0">
                                <Link href="/integration/optical/rules">Posting rules</Link>
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Streams</CardTitle>
                        <CardDescription>Each stream continues from the newest change it has read.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {streams.map((s) => (
                            <div key={s} className="rounded-lg border p-3 text-sm">
                                <div className="font-medium">{streamLabels[s] ?? s}</div>
                                <div className="text-muted-foreground text-xs">Read up to {formatDateTime(cursors[s])}</div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <DataTable
                    title="Sync history"
                    description="Manual runs and the hourly schedule."
                    columns={columns}
                    data={runs}
                    initialSorting={[{ id: 'started_at', desc: true }]}
                    emptyTitle="No sync runs yet"
                />
            </div>
        </AppLayout>
    );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right">{value}</span>
        </div>
    );
}
