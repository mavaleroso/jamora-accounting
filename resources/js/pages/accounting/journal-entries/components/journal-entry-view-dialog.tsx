import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatPhpCurrency } from '@/lib/currency';
import type { JournalEntry, JournalEntryStatus } from '@/types';
import { TableShell } from '@/components/ui/table-shell';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    journalEntry: JournalEntry | null;
    loading?: boolean;
};

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

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleString('en-PH', {
        timeZone: JOURNAL_ENTRY_TIME_ZONE,
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function statusVariant(status: JournalEntryStatus) {
    switch (status) {
        case 'posted':
            return 'default' as const;
        case 'pending':
            return 'secondary' as const;
        case 'void':
            return 'destructive' as const;
        default:
            return 'outline' as const;
    }
}

export function JournalEntryViewDialog({ open, onOpenChange, journalEntry, loading }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Journal Entry</DialogTitle>
                    <DialogDescription>
                        {journalEntry?.entry_no ?? 'Loading entry details...'}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
                ) : journalEntry ? (
                    <div className="space-y-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <p className="text-xs text-muted-foreground">Entry No.</p>
                                <p className="font-mono text-sm font-medium">{journalEntry.entry_no}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Status</p>
                                <Badge variant={statusVariant(journalEntry.status)} className="mt-1 capitalize">
                                    {journalEntry.status}
                                </Badge>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Date</p>
                                <p className="text-sm">{formatDate(journalEntry.entry_date)}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Journal</p>
                                <p className="text-sm">
                                    {journalEntry.journal
                                        ? `${journalEntry.journal.code} — ${journalEntry.journal.name}`
                                        : '--'}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Reference</p>
                                <p className="text-sm">{journalEntry.reference ?? '--'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Memo</p>
                                <p className="text-sm">{journalEntry.memo ?? '--'}</p>
                            </div>
                        </div>

                        <TableShell>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>#</TableHead>
                                        <TableHead>Account</TableHead>
                                        <TableHead>Memo</TableHead>
                                        <TableHead>Cost Center</TableHead>
                                        <TableHead className="text-right">Debit</TableHead>
                                        <TableHead className="text-right">Credit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(journalEntry.lines ?? []).length > 0 ? (
                                        journalEntry.lines!.map((line) => (
                                            <TableRow key={line.id ?? line.line_no}>
                                                <TableCell>{line.line_no ?? '--'}</TableCell>
                                                <TableCell>
                                                    {line.account
                                                        ? `${line.account.code} — ${line.account.name}`
                                                        : '--'}
                                                </TableCell>
                                                <TableCell className="max-w-[180px] truncate text-muted-foreground">
                                                    {line.memo ?? '--'}
                                                </TableCell>
                                                <TableCell>
                                                    {line.cost_center
                                                        ? `${line.cost_center.code}`
                                                        : '--'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {line.debit > 0 ? formatPhpCurrency(line.debit) : '--'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {line.credit > 0 ? formatPhpCurrency(line.credit) : '--'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                                                No lines found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableShell>

                        <div className="flex flex-wrap justify-end gap-6 text-sm">
                            <div>
                                <span className="text-muted-foreground">Total Debit: </span>
                                <span className="font-mono font-medium tabular-nums">
                                    {formatPhpCurrency(journalEntry.total_debit)}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Total Credit: </span>
                                <span className="font-mono font-medium tabular-nums">
                                    {formatPhpCurrency(journalEntry.total_credit)}
                                </span>
                            </div>
                        </div>

                        <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:grid-cols-2">
                            {journalEntry.prepared_by_user ? (
                                <div>
                                    <p className="text-xs text-muted-foreground">Prepared by</p>
                                    <p>{journalEntry.prepared_by_user.name}</p>
                                </div>
                            ) : null}
                            {journalEntry.posted_by_user ? (
                                <div>
                                    <p className="text-xs text-muted-foreground">Posted by</p>
                                    <p>
                                        {journalEntry.posted_by_user.name}
                                        {journalEntry.posted_at ? ` · ${formatDateTime(journalEntry.posted_at)}` : ''}
                                    </p>
                                </div>
                            ) : null}
                            {journalEntry.voided_by_user ? (
                                <div>
                                    <p className="text-xs text-muted-foreground">Voided by</p>
                                    <p>
                                        {journalEntry.voided_by_user.name}
                                        {journalEntry.voided_at ? ` · ${formatDateTime(journalEntry.voided_at)}` : ''}
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        No journal entry selected.
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
