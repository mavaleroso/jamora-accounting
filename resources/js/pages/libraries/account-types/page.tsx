import { Head, router, usePage } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import type { AccountType, BreadcrumbItem } from '@/types';
import { AccountTypeCreateDialog } from './components/account-type-create-dialog';
import { AccountTypeEditDialog } from './components/account-type-edit-dialog';
import {
    accountTypesColumnLabels,
    accountTypesFilterableColumns,
    getAccountTypesColumns,
} from './components/account-types-columns';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Account Types', href: '/libraries/account-types' },
];

type Props = {
    accountTypes: AccountType[];
    totalAccountTypes: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    errors?: Record<string, string>;
};

export default function AccountTypesPage({
    accountTypes,
    totalAccountTypes,
    pageSize,
    currentPage,
    search = '',
}: Props) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [selected, setSelected] = React.useState<AccountType | null>(null);

    const columns = React.useMemo(
        () =>
            getAccountTypesColumns({
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
                '/libraries/account-types',
                {
                    page: params.pageIndex + 1,
                    per_page: params.pageSize,
                    ...(nextSearch !== '' ? { search: nextSearch } : {}),
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    only: ['accountTypes', 'totalAccountTypes', 'pageSize', 'currentPage', 'search'],
                },
            );
        },
        [search],
    );

    const handleConfirmDelete = () => {
        if (!selected) return;
        setDeleting(true);
        router.delete(`/libraries/account-types/${selected.id}`, {
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
            <Head title="Account Types" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Account Types" description="Manage account type classifications" />
                    <Button type="button" onClick={() => setCreateOpen(true)} className="shrink-0">
                        <PlusIcon className="size-4" />
                        Create account type
                    </Button>
                </div>
                <DataTable
                    columns={columns}
                    data={accountTypes}
                    filterableColumns={accountTypesFilterableColumns}
                    filterPlaceholder="Search..."
                    columnLabels={accountTypesColumnLabels}
                    serverSidePagination={{
                        totalRowCount: totalAccountTypes,
                        pageIndex: Math.max(0, currentPage - 1),
                        pageSize,
                        search,
                        onPaginationChange: handlePaginationChange,
                    }}
                />
            </div>
            <AccountTypeCreateDialog open={createOpen} onOpenChange={setCreateOpen} errors={errors} />
            <AccountTypeEditDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                accountType={selected}
                errors={errors}
            />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete account type"
                description={`Are you sure you want to delete "${selected?.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleConfirmDelete}
                loading={deleting}
            />
        </AppLayout>
    );
}
