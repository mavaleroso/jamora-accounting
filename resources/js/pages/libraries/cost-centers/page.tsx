import { Head, router, usePage } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, CostCenter } from '@/types';
import { CostCenterCreateDialog } from './components/cost-center-create-dialog';
import { CostCenterEditDialog } from './components/cost-center-edit-dialog';
import {
    costCentersColumnLabels,
    costCentersFilterableColumns,
    getCostCentersColumns,
} from './components/cost-centers-columns';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Cost Centers', href: '/libraries/cost-centers' },
];

type Props = {
    costCenters: CostCenter[];
    totalCostCenters: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    errors?: Record<string, string>;
};

export default function CostCentersPage({
    costCenters,
    totalCostCenters,
    pageSize,
    currentPage,
    search = '',
}: Props) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [selected, setSelected] = React.useState<CostCenter | null>(null);

    const columns = React.useMemo(
        () =>
            getCostCentersColumns({
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
                '/libraries/cost-centers',
                {
                    page: params.pageIndex + 1,
                    per_page: params.pageSize,
                    ...(nextSearch !== '' ? { search: nextSearch } : {}),
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    only: ['costCenters', 'totalCostCenters', 'pageSize', 'currentPage', 'search'],
                },
            );
        },
        [search],
    );

    const handleConfirmDelete = () => {
        if (!selected) return;
        setDeleting(true);
        router.delete(`/libraries/cost-centers/${selected.id}`, {
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
            <Head title="Cost Centers" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Cost Centers" description="Manage cost centers for expense tracking" />
                    <Button type="button" onClick={() => setCreateOpen(true)} className="shrink-0">
                        <PlusIcon className="size-4" />
                        Create cost center
                    </Button>
                </div>
                <DataTable
                    columns={columns}
                    data={costCenters}
                    filterableColumns={costCentersFilterableColumns}
                    filterPlaceholder="Search..."
                    columnLabels={costCentersColumnLabels}
                    serverSidePagination={{
                        totalRowCount: totalCostCenters,
                        pageIndex: Math.max(0, currentPage - 1),
                        pageSize,
                        search,
                        onPaginationChange: handlePaginationChange,
                    }}
                />
            </div>
            <CostCenterCreateDialog open={createOpen} onOpenChange={setCreateOpen} errors={errors} />
            <CostCenterEditDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                costCenter={selected}
                errors={errors}
            />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete cost center"
                description={`Are you sure you want to delete "${selected?.code} — ${selected?.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleConfirmDelete}
                loading={deleting}
            />
        </AppLayout>
    );
}
