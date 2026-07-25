import { Head, router, usePage } from '@inertiajs/react';
import * as React from 'react';
import { DataTable } from '@/components/data-table';
import Heading from '@/components/heading';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, User } from '@/types';
import {
    CreateUserDialog,
    EditUserDialog,
    getUsersColumns,
    RbacUserDialog,
    usersColumnLabels,
    usersFilterableColumns,
    ViewUserDialog,
} from './components';
import { Button } from '@/components/ui/button';
import { PlusIcon } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Users', href: '/admin/users' },
];

type RoleOption = {
    name: string;
    permissions: string[];
};

type Props = {
    users: User[];
    totalUsers: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    roles: RoleOption[];
    permissions: string[];
    errors?: Record<string, string>;
};

export default function Users({
    users,
    totalUsers,
    pageSize,
    currentPage,
    search = '',
    roles,
    permissions,
}: Props) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [viewOpen, setViewOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [rbacOpen, setRbacOpen] = React.useState(false);
    const [selectedUser, setSelectedUser] = React.useState<User | null>(null);

    const columns = React.useMemo(
        () =>
            getUsersColumns({
                onViewUser: (user) => {
                    setSelectedUser(user);
                    setViewOpen(true);
                },
                onEditUser: (user) => {
                    setSelectedUser(user);
                    setEditOpen(true);
                },
                onEditRbac: (user) => {
                    setSelectedUser(user);
                    setRbacOpen(true);
                },
            }),
        [],
    );

    const handlePaginationChange = React.useCallback(
        (params: { pageIndex: number; pageSize: number; search?: string }) => {
            const nextSearch =
                params.search !== undefined
                    ? params.search.trim()
                    : search.trim();

            router.get(
                '/admin/users',
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
                        'users',
                        'totalUsers',
                        'pageSize',
                        'currentPage',
                        'search',
                    ],
                },
            );
        },
        [search],
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Users" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading
                        title="Users"
                        description="Manage user accounts"
                    />
                    <Button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="shrink-0"
                    >
                        <PlusIcon className="size-4" />
                        Create user
                    </Button>
                </div>
                <DataTable
                    columns={columns}
                    data={users}
                    filterableColumns={usersFilterableColumns}
                    filterPlaceholder="Search..."
                    columnLabels={usersColumnLabels}
                    serverSidePagination={{
                        totalRowCount: totalUsers,
                        pageIndex: Math.max(0, currentPage - 1),
                        pageSize,
                        search,
                        onPaginationChange: handlePaginationChange,
                    }}
                />
            </div>
            <CreateUserDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                errors={errors}
                roles={roles}
                permissions={permissions}
            />
            <ViewUserDialog
                open={viewOpen}
                onOpenChange={setViewOpen}
                user={selectedUser}
            />
            <EditUserDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                user={selectedUser}
                errors={errors}
                roles={roles}
                permissions={permissions}
            />
            <RbacUserDialog
                open={rbacOpen}
                onOpenChange={setRbacOpen}
                user={selectedUser}
                roles={roles}
                permissions={permissions}
            />
        </AppLayout>
    );
}
