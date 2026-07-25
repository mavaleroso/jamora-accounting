import { Head, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCwIcon } from 'lucide-react';
import * as React from 'react';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, SyncDocument } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Optical Sync', href: '/integration/optical' },
    { title: 'Exceptions', href: '/integration/optical/exceptions' },
];

type Props = {
    documents: SyncDocument[];
    totalDocuments: number;
    pageSize: number;
    currentPage: number;
};

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function OpticalExceptionsPage({
    documents,
    totalDocuments,
    pageSize,
    currentPage,
}: Props) {
    const [retryingId, setRetryingId] = React.useState<number | null>(null);

    const handleRetry = (document: SyncDocument) => {
        setRetryingId(document.id);
        router.post(
            `/integration/optical/exceptions/${document.id}/retry`,
            {},
            {
                preserveScroll: true,
                onFinish: () => setRetryingId(null),
            },
        );
    };

    const columns = React.useMemo<ColumnDef<SyncDocument>[]>(
        () => [
            {
                accessorKey: 'source_type',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
                cell: ({ row }) => (
                    <Badge variant="outline">{row.original.source_type}</Badge>
                ),
            },
            {
                accessorKey: 'source_id',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Source ID" />,
            },
            {
                accessorKey: 'error',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Error" />,
                cell: ({ row }) => (
                    <span className="max-w-md text-sm text-destructive">{row.original.error ?? '—'}</span>
                ),
            },
            {
                accessorKey: 'updated_at',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Last Attempt" />,
                cell: ({ row }) => formatDateTime(row.original.updated_at),
            },
            {
                id: 'actions',
                header: 'Actions',
                cell: ({ row }) => (
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={retryingId === row.original.id}
                        onClick={() => handleRetry(row.original)}
                    >
                        {retryingId === row.original.id ? (
                            <RefreshCwIcon className="size-4 animate-spin" />
                        ) : (
                            <RefreshCwIcon className="size-4" />
                        )}
                        Retry
                    </Button>
                ),
            },
        ],
        [retryingId],
    );

    const handlePaginationChange = React.useCallback(
        (params: { pageIndex: number; pageSize: number }) => {
            router.get(
                '/integration/optical/exceptions',
                {
                    page: params.pageIndex + 1,
                    per_page: params.pageSize,
                },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        },
        [],
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Sync Exceptions" />

            <div className="flex flex-col gap-6 p-4">
                <Heading
                    title="Sync Exceptions"
                    description="Failed Optical sync documents that need attention."
                />

                <Card>
                    <CardHeader>
                        <CardTitle>Failed Documents</CardTitle>
                        <CardDescription>
                            {totalDocuments} failed document{totalDocuments === 1 ? '' : 's'} total.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DataTable
                            columns={columns}
                            data={documents}
                            initialSorting={[{ id: 'updated_at', desc: true }]}
                            serverSidePagination={{
                                totalRowCount: totalDocuments,
                                pageIndex: currentPage - 1,
                                pageSize,
                                onPaginationChange: handlePaginationChange,
                            }}
                        />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
