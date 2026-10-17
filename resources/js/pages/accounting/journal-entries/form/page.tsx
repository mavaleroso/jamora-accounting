import { Head, Link, router } from '@inertiajs/react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { formatPhpCurrency } from '@/lib/currency';
import type {
    AccountOption,
    AccountingPeriodOption,
    BreadcrumbItem,
    CostCenterOption,
    JournalEntry,
    JournalEntryFormLine,
    JournalOption,
} from '@/types';

type Props = {
    journals: JournalOption[];
    accounts: AccountOption[];
    costCenters: CostCenterOption[];
    periods: AccountingPeriodOption[];
    journalEntry?: JournalEntry;
};

function emptyLine(): JournalEntryFormLine {
    return {
        account_id: null,
        debit: '',
        credit: '',
        memo: '',
        cost_center_id: null,
    };
}

function mapEntryToFormLines(entry?: JournalEntry): JournalEntryFormLine[] {
    if (!entry?.lines?.length) {
        return [emptyLine(), emptyLine()];
    }

    return entry.lines.map((line) => ({
        account_id: line.account_id,
        debit: line.debit > 0 ? String(line.debit) : '',
        credit: line.credit > 0 ? String(line.credit) : '',
        memo: line.memo ?? '',
        cost_center_id: line.cost_center_id ?? null,
    }));
}

function parseAmount(value: string): number {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function AccountSelect({
    accounts,
    value,
    onChange,
}: {
    accounts: AccountOption[];
    value: number | null;
    onChange: (value: number | null) => void;
}) {
    const [search, setSearch] = React.useState('');

    const filtered = React.useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return accounts;
        return accounts.filter(
            (account) =>
                account.code.toLowerCase().includes(term) ||
                account.name.toLowerCase().includes(term),
        );
    }, [accounts, search]);

    return (
        <div className="space-y-2">
            <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8"
            />
            <Select
                value={value ? String(value) : ''}
                onValueChange={(next) => onChange(next ? Number(next) : null)}
            >
                <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                    {filtered.length > 0 ? (
                        filtered.map((account) => (
                            <SelectItem key={account.id} value={String(account.id)}>
                                {account.code} — {account.name}
                            </SelectItem>
                        ))
                    ) : (
                        <SelectItem value="__none__" disabled>
                            No accounts found
                        </SelectItem>
                    )}
                </SelectContent>
            </Select>
        </div>
    );
}

export default function JournalEntryFormPage({
    journals,
    accounts,
    costCenters,
    periods,
    journalEntry,
}: Props) {
    const isEdit = Boolean(journalEntry?.id);
    const confirm = useConfirm();
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Journal Entries', href: '/accounting/journal-entries' },
        {
            title: isEdit ? `Edit ${journalEntry?.entry_no ?? ''}` : 'New Entry',
            href: isEdit
                ? `/accounting/journal-entries/${journalEntry?.id}/edit`
                : '/accounting/journal-entries/create',
        },
    ];

    const [journalId, setJournalId] = React.useState(
        journalEntry?.journal_id ? String(journalEntry.journal_id) : '',
    );
    const [entryDate, setEntryDate] = React.useState(
        journalEntry?.entry_date ?? new Date().toISOString().slice(0, 10),
    );
    const [reference, setReference] = React.useState(journalEntry?.reference ?? '');
    const [memo, setMemo] = React.useState(journalEntry?.memo ?? '');
    const [lines, setLines] = React.useState<JournalEntryFormLine[]>(() => mapEntryToFormLines(journalEntry));
    const [processing, setProcessing] = React.useState(false);

    const totals = React.useMemo(() => {
        const totalDebit = lines.reduce((sum, line) => sum + parseAmount(line.debit), 0);
        const totalCredit = lines.reduce((sum, line) => sum + parseAmount(line.credit), 0);
        const difference = Math.round((totalDebit - totalCredit) * 100) / 100;
        return { totalDebit, totalCredit, difference };
    }, [lines]);

    const updateLine = (index: number, patch: Partial<JournalEntryFormLine>) => {
        setLines((prev) =>
            prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
        );
    };

    const addLine = () => setLines((prev) => [...prev, emptyLine()]);

    const removeLine = (index: number) => {
        setLines((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
    };

    const buildPayload = (status: 'draft' | 'pending') => ({
        journal_id: Number(journalId),
        entry_date: entryDate,
        reference: reference || null,
        memo: memo || null,
        status,
        lines: lines.map((line) => ({
            account_id: line.account_id,
            debit: parseAmount(line.debit),
            credit: parseAmount(line.credit),
            memo: line.memo || null,
            cost_center_id: line.cost_center_id,
        })),
    });

    const submit = async (status: 'draft' | 'pending') => {
        if (!journalId) return;
        if (!isEdit) {
            const ok = await confirm({
                title: status === 'pending' ? 'Create and submit this entry?' : 'Create this entry as a draft?',
                description:
                    status === 'pending'
                        ? `A ${formatPhpCurrency(totals.totalDebit)} journal entry is created and sent for approval. It reaches the ledger once approved.`
                        : `A ${formatPhpCurrency(totals.totalDebit)} journal entry is saved as a draft. Nothing is posted yet.`,
                confirmLabel: status === 'pending' ? 'Create & submit' : 'Save draft',
            });
            if (!ok) return;
        }

        setProcessing(true);

        const payload = buildPayload(status);
        const options = {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
        };

        if (isEdit && journalEntry) {
            router.put(`/accounting/journal-entries/${journalEntry.id}`, payload, options);
        } else {
            router.post('/accounting/journal-entries', payload, options);
        }
    };

    const openPeriod = periods.find(
        (period) =>
            period.status === 'open' &&
            entryDate >= period.start_date &&
            entryDate <= period.end_date,
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={isEdit ? `Edit ${journalEntry?.entry_no}` : 'New Journal Entry'} />
            <div className="flex h-full flex-1 flex-col gap-5 rounded-xl p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <Heading
                        title={isEdit ? `Edit ${journalEntry?.entry_no}` : 'New Journal Entry'}
                        description={
                            isEdit
                                ? 'Update draft or pending journal entry lines.'
                                : 'Create a balanced manual journal entry.'
                        }
                    />
                    <Button variant="outline" asChild>
                        <Link href="/accounting/journal-entries">Back to list</Link>
                    </Button>
                </div>

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 py-4">
                        <CardTitle className="text-base">Header</CardTitle>
                        <CardDescription>Journal, date, and reference information.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 p-4 md:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="journal_id">Journal *</Label>
                            <Select value={journalId} onValueChange={setJournalId}>
                                <SelectTrigger id="journal_id">
                                    <SelectValue placeholder="Select journal" />
                                </SelectTrigger>
                                <SelectContent>
                                    {journals.map((journal) => (
                                        <SelectItem key={journal.id} value={String(journal.id)}>
                                            {journal.code} — {journal.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="entry_date">Entry date *</Label>
                            <DatePicker
                                id="entry_date"
                                value={entryDate}
                                onChange={setEntryDate}
                                placeholder="Select date"
                            />
                            {entryDate ? (
                                <p className="text-xs text-muted-foreground">
                                    {openPeriod
                                        ? `Open period #${openPeriod.period_no} (${openPeriod.start_date} to ${openPeriod.end_date})`
                                        : 'No open accounting period covers this date.'}
                                </p>
                            ) : null}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reference">Reference</Label>
                            <Input
                                id="reference"
                                value={reference}
                                onChange={(e) => setReference(e.target.value)}
                                placeholder="External reference"
                            />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="memo">Memo</Label>
                            <Textarea
                                id="memo"
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                placeholder="Entry description"
                                rows={3}
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/30 py-4">
                        <div>
                            <CardTitle className="text-base">Lines</CardTitle>
                            <CardDescription>Each line must have either a debit or credit amount.</CardDescription>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addLine}>
                            <PlusIcon className="mr-2 size-4" />
                            Add line
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-[240px]">Account</TableHead>
                                        <TableHead className="w-[120px]">Debit</TableHead>
                                        <TableHead className="w-[120px]">Credit</TableHead>
                                        <TableHead className="min-w-[160px]">Memo</TableHead>
                                        <TableHead className="min-w-[180px]">Cost center</TableHead>
                                        <TableHead className="w-[48px]" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {lines.map((line, index) => (
                                        <TableRow key={index}>
                                            <TableCell className="align-top">
                                                <AccountSelect
                                                    accounts={accounts}
                                                    value={line.account_id}
                                                    onChange={(value) =>
                                                        updateLine(index, { account_id: value })
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={line.debit}
                                                    onChange={(e) =>
                                                        updateLine(index, {
                                                            debit: e.target.value,
                                                            credit: e.target.value ? '' : line.credit,
                                                        })
                                                    }
                                                    className="font-mono"
                                                    placeholder="0.00"
                                                />
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={line.credit}
                                                    onChange={(e) =>
                                                        updateLine(index, {
                                                            credit: e.target.value,
                                                            debit: e.target.value ? '' : line.debit,
                                                        })
                                                    }
                                                    className="font-mono"
                                                    placeholder="0.00"
                                                />
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <Input
                                                    value={line.memo}
                                                    onChange={(e) =>
                                                        updateLine(index, { memo: e.target.value })
                                                    }
                                                    placeholder="Line memo"
                                                />
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <Select
                                                    value={
                                                        line.cost_center_id
                                                            ? String(line.cost_center_id)
                                                            : 'none'
                                                    }
                                                    onValueChange={(value) =>
                                                        updateLine(index, {
                                                            cost_center_id:
                                                                value === 'none' ? null : Number(value),
                                                        })
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Optional" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none">None</SelectItem>
                                                        {costCenters.map((center) => (
                                                            <SelectItem
                                                                key={center.id}
                                                                value={String(center.id)}
                                                            >
                                                                {center.code} — {center.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    disabled={lines.length <= 2}
                                                    onClick={() => removeLine(index)}
                                                    aria-label="Remove line"
                                                >
                                                    <Trash2Icon className="size-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm">
                    <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="grid gap-2 text-sm sm:grid-cols-3">
                            <div>
                                <span className="text-muted-foreground">Total Debit: </span>
                                <span className="font-mono font-medium tabular-nums">
                                    {formatPhpCurrency(totals.totalDebit)}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Total Credit: </span>
                                <span className="font-mono font-medium tabular-nums">
                                    {formatPhpCurrency(totals.totalCredit)}
                                </span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Difference: </span>
                                <span
                                    className={cn(
                                        'font-mono font-medium tabular-nums',
                                        Math.abs(totals.difference) >= 0.01 && 'text-destructive',
                                    )}
                                >
                                    {formatPhpCurrency(totals.difference)}
                                </span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={
                                    processing ||
                                    !journalId ||
                                    Math.abs(totals.difference) >= 0.01 ||
                                    totals.totalDebit <= 0
                                }
                                onClick={() => submit('draft')}
                            >
                                Save as Draft
                            </Button>
                            <Button
                                type="button"
                                disabled={
                                    processing ||
                                    !journalId ||
                                    Math.abs(totals.difference) >= 0.01 ||
                                    totals.totalDebit <= 0
                                }
                                onClick={() => submit('pending')}
                            >
                                Submit for approval
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
