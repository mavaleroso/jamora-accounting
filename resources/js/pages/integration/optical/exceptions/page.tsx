import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SyncDocument } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCwIcon } from 'lucide-react';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Optical Sync', href: '/integration/optical' },
    { title: 'Exceptions', href: '/integration/optical/exceptions' },
];

type Props = {
    documents: SyncDocument[];
    totalDocuments: number;
    pageSize: number;
    currentPage: number;
    status: 'failed' | 'review' | null;
};

const typeLabels: Record<string, string> = {
    sale: 'Sale',
    payment: 'Payment',
    stock_receipt: 'Delivery',
    stock_movement: 'Stock',
};

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function OpticalExceptionsPage({ documents, totalDocuments, pageSize, currentPage, status }: Props) {
    const [retryingId, setRetryingId] = React.useState<number | null>(null);

    const handleRetry = (document: SyncDocument) => {
        setRetryingId(document.id);
        router.post(`/integration/optical/exceptions/${document.id}/retry`, {}, { preserveScroll: true, onFinish: () => setRetryingId(null) });
    };

    const columns = React.useMemo<ColumnDef<SyncDocument>[]>(
        () => [
            {
                accessorKey: 'status',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
                cell: ({ row }) =>
                    row.original.status === 'failed' ? <Badge variant="destructive">Failed</Badge> : <Badge variant="secondary">Review</Badge>,
            },
            {
                accessorKey: 'reference',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Document" />,
                cell: ({ row }) => (
                    <div>
                        <div className="font-medium">{row.original.reference}</div>
                        <div className="text-muted-foreground text-xs">{typeLabels[row.original.source_type] ?? row.original.source_type}</div>
                    </div>
                ),
            },
            {
                accessorKey: 'error',
                header: ({ column }) => <DataTableColumnHeader column={column} title="What happened" />,
                cell: ({ row }) => (
                    <span className={`max-w-md text-sm ${row.original.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {row.original.error ?? '—'}
                    </span>
                ),
            },
            {
                id: 'entry',
                header: 'Entry',
                cell: ({ row }) =>
                    row.original.journal_entry ? (
                        <Link href={`/accounting/journal-entries/${row.original.journal_entry.id}`} className="font-mono text-xs underline">
                            {row.original.journal_entry.entry_no}
                        </Link>
                    ) : (
                        '—'
                    ),
            },
            {
                accessorKey: 'updated_at',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Last attempt" />,
                cell: ({ row }) => formatDateTime(row.original.updated_at),
            },
            {
                id: 'actions',
                header: 'Actions',
                cell: ({ row }) => (
                    <Button size="sm" variant="outline" disabled={retryingId === row.original.id} onClick={() => handleRetry(row.original)}>
                        <RefreshCwIcon className={`size-4 ${retryingId === row.original.id ? 'animate-spin' : ''}`} />
                        Retry
                    </Button>
                ),
            },
        ],
        [retryingId],
    );

    const visit = (params: Record<string, string | number | undefined>) =>
        router.get('/integration/optical/exceptions', params, { preserveState: true, preserveScroll: true, replace: true });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sync Exceptions" />

            <div className="flex flex-col gap-6 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <Heading
                        title="Sync exceptions"
                        description="Failed documents did not post — fix the cause (open period, posting rule, missing entity) and retry. Review items posted but need an accountant's look."
                    />
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        value={status ?? 'all'}
                        onValueChange={(v) => v && visit(v === 'all' ? {} : { status: v })}
                    >
                        <ToggleGroupItem value="all">All</ToggleGroupItem>
                        <ToggleGroupItem value="failed">Failed</ToggleGroupItem>
                        <ToggleGroupItem value="review">Review</ToggleGroupItem>
                    </ToggleGroup>
                </div>

                <DataTable
                    title="Documents"
                    description={`${totalDocuments} document${totalDocuments === 1 ? '' : 's'}.`}
                    columns={columns}
                    data={documents}
                    initialSorting={[{ id: 'updated_at', desc: true }]}
                    emptyTitle="Nothing needs attention"
                    emptyDescription="Everything synced cleanly."
                    serverSidePagination={{
                        totalRowCount: totalDocuments,
                        pageIndex: currentPage - 1,
                        pageSize,
                        onPaginationChange: ({ pageIndex, pageSize: size }) =>
                            visit({ page: pageIndex + 1, per_page: size, ...(status ? { status } : {}) }),
                    }}
                />
            </div>
        </AppLayout>
    );
}
