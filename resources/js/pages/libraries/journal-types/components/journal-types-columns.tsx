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
import type { Journal } from '@/types';

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

export const journalsColumnLabels: Record<string, string> = {
    row_number: '#',
    code: 'Code',
    name: 'Name',
    type: 'Type',
    sequence_prefix: 'Prefix',
    default_account: 'Default Account',
    next_sequence: 'Next Sequence',
    created_at: 'Created',
};

export const journalsFilterableColumns: Record<string, string> = {
    code: 'Code',
    name: 'Name',
    type: 'Type',
    sequence_prefix: 'Prefix',
};

export type JournalsTableActions = {
    onEdit: (journal: Journal) => void;
    onDelete: (journal: Journal) => void;
};

export function getJournalsColumns(actions: JournalsTableActions): ColumnDef<Journal>[] {
    const { onEdit, onDelete } = actions;

    return [
        {
            id: 'actions',
            cell: ({ row }) => {
                const journal = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open menu">
                                <MoreHorizontalIcon className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => onEdit(journal)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => onDelete(journal)}
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
            accessorKey: 'type',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
            cell: ({ row }) => (
                <span className="text-muted-foreground">{String(row.getValue('type')).replace(/_/g, ' ')}</span>
            ),
        },
        {
            accessorKey: 'sequence_prefix',
            header: ({ column }) => <DataTableColumnHeader column={column} title="Prefix" />,
            cell: ({ row }) => <span className="font-mono">{row.getValue('sequence_prefix')}</span>,
        },
        {
            id: 'default_account',
            header: 'Default Account',
            cell: ({ row }) => {
                const account = row.original.default_account;
                if (!account) return <span className="text-muted-foreground">—</span>;
                return (
                    <span className="text-muted-foreground">
                        {account.code} — {account.name}
                    </span>
                );
            },
        },
        {
            accessorKey: 'next_sequence',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Next Sequence" />
            ),
            cell: ({ row }) => (
                <span className="tabular-nums text-muted-foreground">{row.getValue('next_sequence')}</span>
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
