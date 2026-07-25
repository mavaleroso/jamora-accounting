import type { ColumnDef } from '@tanstack/react-table';
import { router } from '@inertiajs/react';
import { MoreHorizontalIcon } from 'lucide-react';

import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import type { User } from '@/types';

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

export const usersColumnLabels: Record<string, string> = {
    row_number: '#',
    username: 'Username',
    name: 'Name',
    role: 'Role',
    email: 'Email',
    avatar: 'Avatar',
    address: 'Address',
    sex: 'Sex',
    contact_number: 'Contact number',
    birthdate: 'Birthdate',
    position: 'Position',
    date_started: 'Date started',
    email_verified_at: 'Email verified',
    two_factor_enabled: '2FA',
    status: 'Status',
    created_at: 'Created',
    updated_at: 'Updated',
};

/** Columns available in the search dropdown (column id -> label) */
export const usersFilterableColumns: Record<string, string> = {
    name: 'Name',
    email: 'Email',
    position: 'Position',
    contact_number: 'Contact number',
    address: 'Address',
};

export type UsersTableActions = {
    onViewUser: (user: User) => void;
    onEditUser: (user: User) => void;
    onEditRbac: (user: User) => void;
};

export function getUsersColumns(actions: UsersTableActions): ColumnDef<User>[] {
    const { onViewUser, onEditUser, onEditRbac } = actions;
    return [
    {
        id: 'actions',
        cell: ({ row }) => {
            const user = row.original;
            return (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            aria-label="Open menu"
                        >
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontalIcon className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => onViewUser(user)}>
                            View user
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditUser(user)}>
                            Edit user
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditRbac(user)}>
                            Update RBAC
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            );
        },
        enableSorting: false,
        enableHiding: false,
    },
    {
        id: 'row_number',
        header: '#',
        cell: ({ row, table }) => {
            const { pageIndex, pageSize } = table.getState().pagination;
            return (
                <span className="text-muted-foreground tabular-nums">
                    {pageIndex * pageSize + row.index + 1}
                </span>
            );
        },
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: 'avatar',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Avatar" />
        ),
        cell: ({ row }) => {
            const user = row.original;
            const src = user.avatar
                ? typeof user.avatar === 'string' && user.avatar.startsWith('http')
                    ? user.avatar
                    : `/storage/${user.avatar}`
                : undefined;
            return (
                <Avatar className="size-8">
                    <AvatarImage src={src} alt={user.name} />
                    <AvatarFallback className="text-xs">
                        {user.name
                            .split(/\s+/)
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                    </AvatarFallback>
                </Avatar>
            );
        },
        enableSorting: false,
    },
    {
        accessorKey: 'username',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Username" />
        ),
        cell: ({ row }) => (
            <span className="block max-w-[140px] truncate text-muted-foreground">
                {row.getValue('username') ?? 'â€”'}
            </span>
        ),
    },
    {
        id: 'name',
        accessorFn: (row) => row.name,
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
            <span className="block max-w-[180px] truncate">
                {row.original.name}
            </span>
        ),
    },
    {
        id: 'role',
        accessorFn: (row) => row.roles?.[0] ?? '',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Role" />
        ),
        cell: ({ row }) => (
            <span className="block max-w-[160px] truncate text-muted-foreground">
                {row.original.roles?.[0] ?? 'â€”'}
            </span>
        ),
    },
    {
        accessorKey: 'email',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Email" />
        ),
        cell: ({ row }) => (
            <span className="block max-w-[200px] truncate text-muted-foreground">
                {row.getValue('email') ?? '—'}
            </span>
        ),
    },
    {
        accessorKey: 'status',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) => {
            const user = row.original;
            const status = user.status !== false;
            return (
                <Switch
                    checked={status}
                    onCheckedChange={(checked: boolean) => {
                        router.patch(
                            `/admin/users/${user.id}/status`,
                            { status: checked },
                            { preserveScroll: true }
                        );
                    }}
                    aria-label={status ? 'Disable user' : 'Enable user'}
                />
            );
        },
        enableSorting: true,
    },
    {
        accessorKey: 'address',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Address" />
        ),
        cell: ({ row }) => (
            <span className="block max-w-[200px] truncate text-muted-foreground">
                {row.getValue('address') ?? '—'}
            </span>
        ),
    },
    {
        accessorKey: 'sex',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Sex" />
        ),
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {row.getValue('sex') ?? '—'}
            </span>
        ),
    },
    {
        accessorKey: 'contact_number',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Contact number" />
        ),
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {row.getValue('contact_number') ?? '—'}
            </span>
        ),
    },
    {
        accessorKey: 'position',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Position" />
        ),
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {row.getValue('position') ?? '—'}
            </span>
        ),
    },
    {
        accessorKey: 'created_at',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {formatDate(row.getValue('created_at') as string | undefined)}
            </span>
        ),
    },
    {
        accessorKey: 'updated_at',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Updated" />
        ),
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {formatDate(row.getValue('updated_at') as string | undefined)}
            </span>
        ),
    },
];
}
