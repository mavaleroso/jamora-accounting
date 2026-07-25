import { Head, router, usePage } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { hasPermission } from '@/lib/permissions';
import type {
    Account,
    AccountOption,
    AccountType,
    BreadcrumbItem,
    SharedData,
} from '@/types';
import { AccountCreateDialog } from './components/account-create-dialog';
import { AccountEditDialog } from './components/account-edit-dialog';
import {
    accountsColumnLabels,
    accountsFilterableColumns,
    getAccountsColumns,
} from './components/accounts-columns';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Chart of Accounts', href: '/accounting/chart-of-accounts' },
];

type Props = {
    accounts: Account[];
    totalAccounts: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    accountTypes: AccountType[];
    parentAccounts: AccountOption[];
    errors?: Record<string, string>;
};

export default function ChartOfAccounts({
    accounts,
    totalAccounts,
    pageSize,
    currentPage,
    search = '',
    accountTypes,
    parentAccounts,
}: Props) {
    const { auth, errors = {} } = usePage<SharedData>().props;
    const canManage = hasPermission(auth, 'accounts.manage');
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    const [selectedAccount, setSelectedAccount] = React.useState<Account | null>(null);

    const columns = React.useMemo(
        () =>
            getAccountsColumns({
                canManage,
                onEditAccount: (account) => {
                    setSelectedAccount(account);
                    setEditOpen(true);
                },
                onDeleteAccount: (account) => {
                    setSelectedAccount(account);
                    setDeleteOpen(true);
                },
            }),
        [canManage],
    );

    const handlePaginationChange = React.useCallback(
        (params: { pageIndex: number; pageSize: number; search?: string }) => {
            const nextSearch =
                params.search !== undefined ? params.search.trim() : search.trim();

            router.get(
                '/accounting/chart-of-accounts',
                {
                    page: params.pageIndex + 1,
                    per_page: params.pageSize,
                    ...(nextSearch !== '' ? { search: nextSearch } : {}),
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    only: [
                        'accounts',
                        'totalAccounts',
                        'pageSize',
                        'currentPage',
                        'search',
                    ],
                },
            );
        },
        [search],
    );

    const handleConfirmDelete = () => {
        if (!selectedAccount) return;
        setDeleting(true);
        router.delete(`/accounting/chart-of-accounts/${selectedAccount.id}`, {
            preserveScroll: true,
            onSuccess: () => {
                setSelectedAccount(null);
                setDeleteOpen(false);
            },
            onFinish: () => setDeleting(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Chart of Accounts" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading
                        title="Chart of Accounts"
                        description="Manage general ledger accounts"
                    />
                    {canManage && (
                        <Button type="button" onClick={() => setCreateOpen(true)} className="shrink-0">
                            <PlusIcon className="size-4" />
                            Create account
                        </Button>
                    )}
                </div>
                <DataTable
                    columns={columns}
                    data={accounts}
                    filterableColumns={accountsFilterableColumns}
                    filterPlaceholder="Search accounts..."
                    columnLabels={accountsColumnLabels}
                    serverSidePagination={{
                        totalRowCount: totalAccounts,
                        pageIndex: Math.max(0, currentPage - 1),
                        pageSize,
                        search,
                        onPaginationChange: handlePaginationChange,
                    }}
                />
            </div>
            {canManage && (
                <>
                    <AccountCreateDialog
                        open={createOpen}
                        onOpenChange={setCreateOpen}
                        accountTypes={accountTypes}
                        parentAccounts={parentAccounts}
                        errors={errors}
                    />
                    <AccountEditDialog
                        open={editOpen}
                        onOpenChange={setEditOpen}
                        account={selectedAccount}
                        accountTypes={accountTypes}
                        parentAccounts={parentAccounts}
                        errors={errors}
                    />
                    <ConfirmDialog
                        open={deleteOpen}
                        onOpenChange={setDeleteOpen}
                        title="Delete account"
                        description={`Are you sure you want to delete "${selectedAccount?.code} — ${selectedAccount?.name}"? This action cannot be undone.`}
                        confirmLabel="Delete"
                        variant="destructive"
                        onConfirm={handleConfirmDelete}
                        loading={deleting}
                    />
                </>
            )}
        </AppLayout>
    );
}
