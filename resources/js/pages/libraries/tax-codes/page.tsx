import { Head, router, usePage } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import type { AccountOption, BreadcrumbItem, TaxCode } from '@/types';
import { TaxCodeCreateDialog } from './components/tax-code-create-dialog';
import { TaxCodeEditDialog } from './components/tax-code-edit-dialog';
import {
    getTaxCodesColumns,
    taxCodesColumnLabels,
    taxCodesFilterableColumns,
} from './components/tax-codes-columns';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Tax Codes', href: '/libraries/tax-codes' },
];

type Props = {
    taxCodes: TaxCode[];
    totalTaxCodes: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    accounts: AccountOption[];
    errors?: Record<string, string>;
};

export default function TaxCodesPage({
    taxCodes,
    totalTaxCodes,
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
    const [selected, setSelected] = React.useState<TaxCode | null>(null);

    const columns = React.useMemo(
        () =>
            getTaxCodesColumns({
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
                '/libraries/tax-codes',
                {
                    page: params.pageIndex + 1,
                    per_page: params.pageSize,
                    ...(nextSearch !== '' ? { search: nextSearch } : {}),
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    only: ['taxCodes', 'totalTaxCodes', 'pageSize', 'currentPage', 'search'],
                },
            );
        },
        [search],
    );

    const handleConfirmDelete = () => {
        if (!selected) return;
        setDeleting(true);
        router.delete(`/libraries/tax-codes/${selected.id}`, {
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
            <Head title="Tax Codes" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Tax Codes" description="Manage tax codes and VAT rates" />
                    <Button type="button" onClick={() => setCreateOpen(true)} className="shrink-0">
                        <PlusIcon className="size-4" />
                        Create tax code
                    </Button>
                </div>
                <DataTable
                    columns={columns}
                    data={taxCodes}
                    filterableColumns={taxCodesFilterableColumns}
                    filterPlaceholder="Search..."
                    columnLabels={taxCodesColumnLabels}
                    serverSidePagination={{
                        totalRowCount: totalTaxCodes,
                        pageIndex: Math.max(0, currentPage - 1),
                        pageSize,
                        search,
                        onPaginationChange: handlePaginationChange,
                    }}
                />
            </div>
            <TaxCodeCreateDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                accounts={accounts}
                errors={errors}
            />
            <TaxCodeEditDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                taxCode={selected}
                accounts={accounts}
                errors={errors}
            />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete tax code"
                description={`Are you sure you want to delete "${selected?.code} — ${selected?.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleConfirmDelete}
                loading={deleting}
            />
        </AppLayout>
    );
}
