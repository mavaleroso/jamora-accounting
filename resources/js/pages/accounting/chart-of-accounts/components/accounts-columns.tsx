import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontalIcon } from 'lucide-react';

import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Account } from '@/types';

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

function formatCashFlowSection(value: string | null | undefined): string {
    if (!value) return '—';
    return value.charAt(0).toUpperCase() + value.slice(1);
}

export const accountsColumnLabels: Record<string, string> = {
    row_number: '#',
    code: 'Code',
    name: 'Name',
    account_type: 'Type',
    parent: 'Parent',
    is_postable: 'Postable',
    is_active: 'Active',
    cash_flow_section: 'Cash Flow',
    description: 'Description',
    created_at: 'Created',
};

export const accountsFilterableColumns: Record<string, string> = {
    code: 'Code',
    name: 'Name',
    description: 'Description',
};

export type AccountsTableActions = {
    onEditAccount: (account: Account) => void;
    onDeleteAccount: (account: Account) => void;
    canManage: boolean;
};

export function getAccountsColumns(actions: AccountsTableActions): ColumnDef<Account>[] {
    const { onEditAccount, onDeleteAccount, canManage } = actions;

    return [
        {
            id: 'actions',
            cell: ({ row }) => {
                if (!canManage) return null;
                const account = row.original;
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
                            <DropdownMenuItem onClick={() => onEditAccount(account)}>
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => onDeleteAccount(account)}
                                className="text-destructive focus:text-destructive"
                            >
                                Delete
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
            accessorKey: 'code',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Code" />
            ),
            cell: ({ row }) => (
                <span className="font-mono font-semibold">{row.original.code}</span>
            ),
        },
        {
            accessorKey: 'name',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Name" />
            ),
            cell: ({ row }) => (
                <span className="block max-w-[200px] truncate font-medium">
                    {row.original.name}
                </span>
            ),
        },
        {
            id: 'account_type',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Type" />
            ),
            cell: ({ row }) => (
                <span className="text-muted-foreground">
                    {row.original.account_type?.name ?? '—'}
                </span>
            ),
        },
        {
            id: 'parent',
            header: 'Parent',
            cell: ({ row }) => {
                const parent = row.original.parent;
                if (!parent) return <span className="text-muted-foreground">—</span>;
                return (
                    <span className="text-muted-foreground">
                        {parent.code} — {parent.name}
                    </span>
                );
            },
        },
        {
            accessorKey: 'is_postable',
            header: 'Postable',
            cell: ({ row }) => (
                <Badge variant={row.original.is_postable ? 'default' : 'secondary'}>
                    {row.original.is_postable ? 'Yes' : 'No'}
                </Badge>
            ),
        },
        {
            accessorKey: 'is_active',
            header: 'Active',
            cell: ({ row }) => (
                <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
                    {row.original.is_active ? 'Yes' : 'No'}
                </Badge>
            ),
        },
        {
            accessorKey: 'cash_flow_section',
            header: 'Cash Flow',
            cell: ({ row }) => (
                <span className="text-muted-foreground">
                    {formatCashFlowSection(row.original.cash_flow_section)}
                </span>
            ),
        },
        {
            accessorKey: 'description',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Description" />
            ),
            cell: ({ row }) => (
                <span className="block max-w-[200px] truncate text-muted-foreground">
                    {row.original.description ?? '—'}
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
    ];
}
