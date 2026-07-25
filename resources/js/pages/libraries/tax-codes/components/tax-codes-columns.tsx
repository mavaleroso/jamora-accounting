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
import type { TaxCode } from '@/types';

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

function formatRate(rate: number | string): string {
    const numeric = Number(rate);
    if (!Number.isFinite(numeric)) return String(rate);
    return `${(numeric * 100).toFixed(2)}%`;
}

export const taxCodesColumnLabels: Record<string, string> = {
    row_number: '#',
    code: 'Code',
    name: 'Name',
    rate: 'Rate',
    type: 'Type',
    account: 'Account',
    is_active: 'Active',
    created_at: 'Created',
};

export const taxCodesFilterableColumns: Record<string, string> = {
    code: 'Code',
    name: 'Name',
    type: 'Type',
};

export type TaxCodesTableActions = {
    onEdit: (taxCode: TaxCode) => void;
    onDelete: (taxCode: TaxCode) => void;
};

export function getTaxCodesColumns(actions: TaxCodesTableActions): ColumnDef<TaxCode>[] {
    const { onEdit, onDelete } = actions;

    return [
        {
            id: 'actions',
            cell: ({ row }) => {
                const taxCode = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open menu">
                                <MoreHorizontalIcon className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => onEdit(taxCode)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => onDelete(taxCode)}
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
            header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
            cell: ({ row }) => <span className="font-mono font-semibold">{row.original.code}</span>,
        },
        {
            accessorKey: 'name',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
            cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        },
        {
            accessorKey: 'rate',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Rate" />,
            cell: ({ row }) => (
                <span className="tabular-nums text-muted-foreground">
                    {formatRate(row.original.rate)}
                </span>
            ),
        },
        {
            accessorKey: 'type',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
            cell: ({ row }) => (
                <span className="text-muted-foreground">
                    {String(row.getValue('type')).replace(/_/g, ' ')}
                </span>
            ),
        },
        {
            id: 'account',
            header: 'Account',
            cell: ({ row }) => {
                const account = row.original.account;
                if (!account) return <span className="text-muted-foreground">—</span>;
                return (
                    <span className="text-muted-foreground">
                        {account.code} — {account.name}
                    </span>
                );
            },
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
