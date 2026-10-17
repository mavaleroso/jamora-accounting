import type { ColumnDef } from '@tanstack/react-table';
import {
    CheckCircle2Icon,
    EyeIcon,
    FileTextIcon,
    MoreHorizontalIcon,
    PencilIcon,
    SendIcon,
    Trash2Icon,
    XCircleIcon,
} from 'lucide-react';
import { Link } from '@inertiajs/react';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatPhpCurrency } from '@/lib/currency';
import type { JournalEntry, JournalEntryStatus } from '@/types';

const JOURNAL_ENTRY_TIME_ZONE = 'Asia/Manila';

function formatDate(value: string | null | undefined): string {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-PH', {
        timeZone: JOURNAL_ENTRY_TIME_ZONE,
        dateStyle: 'medium',
    });
}

function statusBadge(status: JournalEntryStatus) {
    switch (status) {
        case 'draft':
            return { variant: 'outline' as const, icon: FileTextIcon, label: 'Draft' };
        case 'pending':
            return { variant: 'secondary' as const, icon: SendIcon, label: 'For approval' };
        case 'posted':
            return { variant: 'default' as const, icon: CheckCircle2Icon, label: 'Posted' };
        case 'void':
            return { variant: 'destructive' as const, icon: XCircleIcon, label: 'Void' };
        default:
            return { variant: 'outline' as const, icon: FileTextIcon, label: status };
    }
}

export const journalEntryColumnLabels: Record<string, string> = {
    entry_no: 'Entry No.',
    entry_date: 'Date',
    journal: 'Journal',
    reference: 'Reference',
    status: 'Status',
    total_debit: 'Debit',
    total_credit: 'Credit',
};

export const journalEntryFilterableColumns: Record<string, string> = {
    entry_no: 'Entry No.',
    reference: 'Reference',
    memo: 'Memo',
};

export type JournalEntryTableActions = {
    canView: boolean;
    canEdit: boolean;
    canPost: boolean;
    /** Manual entries are posted by approving them (journals.approve). */
    canApprove: boolean;
    canVoid: boolean;
    canDelete: boolean;
    onView: (entry: JournalEntry) => void;
    onPost: (entry: JournalEntry) => void;
    onVoid: (entry: JournalEntry) => void;
    onDelete: (entry: JournalEntry) => void;
};

export function getJournalEntryColumns(
    actions: JournalEntryTableActions,
): ColumnDef<JournalEntry>[] {
    const { canView, canEdit, canPost, canApprove, canVoid, canDelete, onView, onPost, onVoid, onDelete } = actions;

    return [
        {
            id: 'actions',
            cell: ({ row }) => {
                const entry = row.original;
                const editable = entry.status === 'draft' || entry.status === 'pending';
                const manual = entry.source_system === 'manual';
                const postable = editable && (manual ? canApprove : canPost);
                const hasActions = canView || (canEdit && editable) || postable || (canVoid && entry.status === 'posted') || (canDelete && entry.status === 'draft');

                if (!hasActions) {
                    return null;
                }

                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" aria-label="Open menu">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontalIcon className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            {canView ? (
                                <DropdownMenuItem onClick={() => onView(entry)}>
                                    <EyeIcon className="mr-2 size-4" />
                                    View
                                </DropdownMenuItem>
                            ) : null}
                            {canEdit && editable ? (
                                <DropdownMenuItem asChild>
                                    <Link href={`/accounting/journal-entries/${entry.id}/edit`}>
                                        <PencilIcon className="mr-2 size-4" />
                                        Edit
                                    </Link>
                                </DropdownMenuItem>
                            ) : null}
                            {postable ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => onPost(entry)}>
                                        <CheckCircle2Icon className="mr-2 size-4" />
                                        {manual ? 'Approve & post' : 'Post'}
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                            {canVoid && entry.status === 'posted' ? (
                                <DropdownMenuItem onClick={() => onVoid(entry)}>
                                    <XCircleIcon className="mr-2 size-4" />
                                    Void
                                </DropdownMenuItem>
                            ) : null}
                            {canDelete && entry.status === 'draft' ? (
                                <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => onDelete(entry)}
                                    >
                                        <Trash2Icon className="mr-2 size-4" />
                                        Delete
                                    </DropdownMenuItem>
                                </>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: 'entry_no',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Entry No." />
            ),
            cell: ({ row }) => (
                <span className="font-mono text-sm font-medium">{row.getValue('entry_no')}</span>
            ),
        },
        {
            accessorKey: 'entry_date',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Date" />
            ),
            cell: ({ row }) => (
                <span className="text-sm">{formatDate(row.getValue('entry_date'))}</span>
            ),
        },
        {
            id: 'journal',
            accessorFn: (row) => row.journal?.name ?? row.journal?.code,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Journal" />
            ),
            cell: ({ row }) => {
                const journal = row.original.journal;
                if (!journal) return '--';
                return (
                    <div className="flex flex-col">
                        <span className="text-sm font-medium">{journal.code}</span>
                        <span className="text-xs text-muted-foreground">{journal.name}</span>
                    </div>
                );
            },
        },
        {
            accessorKey: 'reference',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Reference" />
            ),
            cell: ({ row }) => (
                <span className="text-sm text-muted-foreground">
                    {row.getValue('reference') ?? '--'}
                </span>
            ),
        },
        {
            accessorKey: 'status',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Status" />
            ),
            cell: ({ row }) => {
                const { variant, icon: Icon, label } = statusBadge(
                    row.getValue('status') as JournalEntryStatus,
                );
                return (
                    <Badge variant={variant} className="gap-1">
                        <Icon className="size-3" />
                        {label}
                    </Badge>
                );
            },
        },
        {
            accessorKey: 'total_debit',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Debit" className="justify-end" />
            ),
            cell: ({ row }) => (
                <span className="block text-right font-mono text-sm tabular-nums">
                    {formatPhpCurrency(row.getValue('total_debit'))}
                </span>
            ),
        },
        {
            accessorKey: 'total_credit',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Credit" className="justify-end" />
            ),
            cell: ({ row }) => (
                <span className="block text-right font-mono text-sm tabular-nums">
                    {formatPhpCurrency(row.getValue('total_credit'))}
                </span>
            ),
        },
    ];
}
