import { Head, router, usePage } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import type { AccountOption, BreadcrumbItem, Journal } from '@/types';
import { JournalCreateDialog } from './components/journal-create-dialog';
import { JournalEditDialog } from './components/journal-edit-dialog';
import {
    getJournalsColumns,
    journalsColumnLabels,
    journalsFilterableColumns,
} from './components/journal-types-columns';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Journal Types', href: '/libraries/journal-types' },
];

type Props = {
    journals: Journal[];
    totalJournals: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    accounts: AccountOption[];
    errors?: Record<string, string>;
};

export default function JournalTypesPage({
    journals,
    totalJournals,
    pageSize,
    currentPage,
    search = '',
    accounts,
}: Props) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [selected, setSelected] = React.useState<Journal | null>(null);

    const columns = React.useMemo(
        () =>
            getJournalsColumns({
                onEdit: (item) => {
                    setSelected(item);
                    setEditOpen(true);
                },
                onDelete: (item) => {
                    setSelected(item);
                    setDeleteOpen(true);
                },
            }),
        [],
    );

    const handlePaginationChange = React.useCallback(
        (params: { pageIndex: number; pageSize: number; search?: string }) => {
            const nextSearch =
                params.search !== undefined ? params.search.trim() : search.trim();

            router.get(
                '/libraries/journal-types',
                {
                    page: params.pageIndex + 1,
                    per_page: params.pageSize,
                    ...(nextSearch !== '' ? { search: nextSearch } : {}),
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    only: ['journals', 'totalJournals', 'pageSize', 'currentPage', 'search'],
                },
            );
        },
        [search],
    );

    const handleConfirmDelete = () => {
        if (!selected) return;
        setDeleting(true);
        router.delete(`/libraries/journal-types/${selected.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                setSelected(null);
                setDeleteOpen(false);
            },
            onFinish: () => setDeleting(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Journal Types" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Journal Types" description="Manage journal types and numbering" />
                    <Button type="button" onClick={() => setCreateOpen(true)} className="shrink-0">
                        <PlusIcon className="size-4" />
                        Create journal type
                    </Button>
                </div>
                <DataTable
                    columns={columns}
                    data={journals}
                    filterableColumns={journalsFilterableColumns}
                    filterPlaceholder="Search..."
                    columnLabels={journalsColumnLabels}
                    serverSidePagination={{
                        totalRowCount: totalJournals,
                        pageIndex: Math.max(0, currentPage - 1),
                        pageSize,
                        search,
                        onPaginationChange: handlePaginationChange,
                    }}
                />
            </div>
            <JournalCreateDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                accounts={accounts}
                errors={errors}
            />
            <JournalEditDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                journal={selected}
                accounts={accounts}
                errors={errors}
            />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete journal type"
                description={`Are you sure you want to delete "${selected?.code} — ${selected?.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleConfirmDelete}
                loading={deleting}
            />
        </AppLayout>
    );
}
