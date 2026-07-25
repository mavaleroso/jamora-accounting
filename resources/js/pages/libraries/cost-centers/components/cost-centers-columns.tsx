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
import type { CostCenter } from '@/types';

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

export const costCentersColumnLabels: Record<string, string> = {
    row_number: '#',
    code: 'Code',
    name: 'Name',
    is_active: 'Active',
    created_at: 'Created',
};

export const costCentersFilterableColumns: Record<string, string> = {
    code: 'Code',
    name: 'Name',
};

export type CostCentersTableActions = {
    onEdit: (costCenter: CostCenter) => void;
    onDelete: (costCenter: CostCenter) => void;
};

export function getCostCentersColumns(
    actions: CostCentersTableActions,
): ColumnDef<CostCenter>[] {
    const { onEdit, onDelete } = actions;

    return [
        {
            id: 'actions',
            cell: ({ row }) => {
                const costCenter = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open menu">
                                <MoreHorizontalIcon className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => onEdit(costCenter)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => onDelete(costCenter)}
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
