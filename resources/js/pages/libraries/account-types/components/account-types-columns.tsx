import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontalIcon } from 'lucide-react';

import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AccountType } from '@/types';

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

export const accountTypesColumnLabels: Record<string, string> = {
    row_number: '#',
    name: 'Name',
    classification: 'Classification',
    normal_balance: 'Normal Balance',
    statement: 'Statement',
    created_at: 'Created',
};

export const accountTypesFilterableColumns: Record<string, string> = {
    name: 'Name',
    classification: 'Classification',
    statement: 'Statement',
};

export type AccountTypesTableActions = {
    onEdit: (accountType: AccountType) => void;
    onDelete: (accountType: AccountType) => void;
};

export function getAccountTypesColumns(
    actions: AccountTypesTableActions,
): ColumnDef<AccountType>[] {
    const { onEdit, onDelete } = actions;

    return [
        {
            id: 'actions',
            cell: ({ row }) => {
                const accountType = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open menu">
                                <MoreHorizontalIcon className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => onEdit(accountType)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => onDelete(accountType)}
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
            accessorKey: 'name',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
            cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        },
        {
            accessorKey: 'classification',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Classification" />
            ),
            cell: ({ row }) => (
                <span className="capitalize text-muted-foreground">
                    {row.getValue('classification')}
                </span>
            ),
        },
        {
            accessorKey: 'normal_balance',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Normal Balance" />
            ),
            cell: ({ row }) => (
                <span className="capitalize text-muted-foreground">
                    {row.getValue('normal_balance')}
                </span>
            ),
        },
        {
            accessorKey: 'statement',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Statement" />,
            cell: ({ row }) => <span className="text-muted-foreground">{row.getValue('statement')}</span>,
        },
        {
            accessorKey: 'created_at',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
            cell: ({ row }) => (
                <span className="text-muted-foreground">
                    {formatDate(row.getValue('created_at') as string | undefined)}
                </span>
            ),
        },
    ];
}
