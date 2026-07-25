import { Head, Link, router, usePage } from '@inertiajs/react';
import { PlusIcon } from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import { DataTable } from '@/components/data-table';
import Heading from '@/components/heading';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { hasPermission } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import type { Auth, BreadcrumbItem, JournalEntry, JournalOption } from '@/types';
import {
    getJournalEntryColumns,
    journalEntryColumnLabels,
    journalEntryFilterableColumns,
} from './components/journal-entries-columns';
import { JournalEntryViewDialog } from './components/journal-entry-view-dialog';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Journal Entries', href: '/accounting/journal-entries' },
];

type Props = {
    journalEntries: JournalEntry[];
    total: number;
    pageSize: number;
    journals: JournalOption[];
};

type ListFilters = {
    status: string;
    journalId: string;
    dateFrom: string;
    dateTo: string;
};

function getCsrfToken(): string {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

function unwrapEntries(payload: { data?: JournalEntry[] } | JournalEntry[]): JournalEntry[] {
    return Array.isArray(payload) ? payload : (payload.data ?? []);
}

export default function JournalEntriesPage({
    journalEntries: initialJournalEntries,
    total: initialTotal,
    pageSize: initialPageSize,
    journals,
}: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const can = (permission: string) => hasPermission(auth, permission);

    const [journalEntries, setJournalEntries] = React.useState<JournalEntry[]>(
        unwrapEntries(initialJournalEntries as JournalEntry[] | { data?: JournalEntry[] }),
    );
    const [total, setTotal] = React.useState(initialTotal);
    const [pageIndex, setPageIndex] = React.useState(0);
    const [pageSize, setPageSize] = React.useState(initialPageSize);
    const [search, setSearch] = React.useState('');
    const [filters, setFilters] = React.useState<ListFilters>({
        status: '',
        journalId: '',
        dateFrom: '',
        dateTo: '',
    });

    const [viewOpen, setViewOpen] = React.useState(false);
    const [selectedEntry, setSelectedEntry] = React.useState<JournalEntry | null>(null);
    const [viewLoading, setViewLoading] = React.useState(false);
    const [deleteTarget, setDeleteTarget] = React.useState<JournalEntry | null>(null);
    const [voidTarget, setVoidTarget] = React.useState<JournalEntry | null>(null);
    const [postTarget, setPostTarget] = React.useState<JournalEntry | null>(null);

    const fetchPage = React.useCallback(
        async (params: {
            pageIndex: number;
            pageSize: number;
            search?: string;
            filters?: ListFilters;
        }) => {
            const activeFilters = params.filters ?? filters;
            const activeSearch = params.search ?? search;

            try {
                const res = await fetch('/accounting/journal-entries/list', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-XSRF-TOKEN': getCsrfToken(),
                    },
                    body: JSON.stringify({
                        page: params.pageIndex + 1,
                        per_page: params.pageSize,
                        search: activeSearch,
                        status: activeFilters.status || undefined,
                        journal_id: activeFilters.journalId ? Number(activeFilters.journalId) : undefined,
                        date_from: activeFilters.dateFrom || undefined,
                        date_to: activeFilters.dateTo || undefined,
                    }),
                    credentials: 'same-origin',
                });

                if (!res.ok) throw new Error('Failed to fetch');

                const json = (await res.json()) as {
                    journal_entries: { data?: JournalEntry[] } | JournalEntry[];
                    total: number;
                };

                setJournalEntries(unwrapEntries(json.journal_entries));
                setTotal(json.total);
                setPageIndex(params.pageIndex);
                setPageSize(params.pageSize);
                if (params.search !== undefined) setSearch(params.search);
                if (params.filters) setFilters(params.filters);
            } catch {
                toast.error('Failed to load journal entries. Please try again.');
            }
        },
        [filters, search],
    );

    const handlePaginationChange = React.useCallback(
        (params: { pageIndex: number; pageSize: number; search?: string }) => {
            fetchPage({
                pageIndex: params.pageIndex,
                pageSize: params.pageSize,
                search: params.search ?? search,
            });
        },
        [fetchPage, search],
    );

    const applyFilters = React.useCallback(() => {
        fetchPage({ pageIndex: 0, pageSize, search, filters });
    }, [fetchPage, pageSize, search, filters]);

    const resetFilters = React.useCallback(() => {
        const cleared: ListFilters = { status: '', journalId: '', dateFrom: '', dateTo: '' };
        setFilters(cleared);
        fetchPage({ pageIndex: 0, pageSize, search: '', filters: cleared });
    }, [fetchPage, pageSize]);

    const handleView = React.useCallback(async (entry: JournalEntry) => {
        setSelectedEntry(entry);
        setViewOpen(true);
        setViewLoading(true);

        try {
            const res = await fetch(`/accounting/journal-entries/${entry.id}`, {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });
            if (!res.ok) throw new Error('Failed to load entry');
            const json = (await res.json()) as { journal_entry: JournalEntry };
            setSelectedEntry(json.journal_entry);
        } catch {
            toast.error('Failed to load journal entry details.');
        } finally {
            setViewLoading(false);
        }
    }, []);

    const handlePost = React.useCallback(
        (entry: JournalEntry) => {
            router.post(
                `/accounting/journal-entries/${entry.id}/post`,
                {},
                {
                    preserveScroll: true,
                    onSuccess: () => {
                        toast.success('Journal entry posted successfully.');
                        setPostTarget(null);
                        fetchPage({ pageIndex, pageSize, search, filters });
                    },
                    onError: () => toast.error('Failed to post journal entry.'),
                },
            );
        },
        [fetchPage, filters, pageIndex, pageSize, search],
    );

    const handleVoid = React.useCallback(
        (entry: JournalEntry) => {
            router.post(
                `/accounting/journal-entries/${entry.id}/void`,
                {},
                {
                    preserveScroll: true,
                    onSuccess: () => {
                        toast.success('Journal entry voided successfully.');
                        setVoidTarget(null);
                        fetchPage({ pageIndex, pageSize, search, filters });
                    },
                    onError: () => toast.error('Failed to void journal entry.'),
                },
            );
        },
        [fetchPage, filters, pageIndex, pageSize, search],
    );

    const handleDelete = React.useCallback(
        (entry: JournalEntry) => {
            router.delete(`/accounting/journal-entries/${entry.id}`, {
                preserveScroll: true,
                onSuccess: () => {
                    toast.success('Journal entry deleted successfully.');
                    setDeleteTarget(null);
                    fetchPage({ pageIndex, pageSize, search, filters });
                },
                onError: () => toast.error('Failed to delete journal entry.'),
            });
        },
        [fetchPage, filters, pageIndex, pageSize, search],
    );

    const columns = React.useMemo(
        () =>
            getJournalEntryColumns({
                canView: can('journals.view'),
                canEdit: can('journals.update'),
                canPost: can('journals.post'),
                canVoid: can('journals.void'),
                canDelete: can('journals.delete'),
                onView: handleView,
                onPost: (entry) => setPostTarget(entry),
                onVoid: (entry) => setVoidTarget(entry),
                onDelete: (entry) => setDeleteTarget(entry),
            }),
        [can, handleView],
    );

    React.useEffect(() => {
        setJournalEntries(unwrapEntries(initialJournalEntries as JournalEntry[] | { data?: JournalEntry[] }));
        setTotal(initialTotal);
        setPageSize(initialPageSize);
    }, [initialJournalEntries, initialTotal, initialPageSize]);

    const hasActiveFilters =
        Boolean(filters.status) ||
        Boolean(filters.journalId) ||
        Boolean(filters.dateFrom) ||
        Boolean(filters.dateTo);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Journal Entries" />
            <div className="flex h-full flex-1 flex-col gap-5 rounded-xl p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <Heading
                        title="Journal Entries"
                        description="Create, review, and post manual journal entries."
                    />
                    {can('journals.create') ? (
                        <Button asChild>
                            <Link href="/accounting/journal-entries/create">
                                <PlusIcon className="mr-2 size-4" />
                                New Entry
                            </Link>
                        </Button>
                    ) : null}
                </div>

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 py-4">
                        <CardTitle className="text-base">Filters</CardTitle>
                        <CardDescription>Filter by status, journal, or date range.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                                value={filters.status || 'all'}
                                onValueChange={(value) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        status: value === 'all' ? '' : value,
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="posted">Posted</SelectItem>
                                    <SelectItem value="void">Void</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Journal</Label>
                            <Select
                                value={filters.journalId || 'all'}
                                onValueChange={(value) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        journalId: value === 'all' ? '' : value,
                                    }))
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All journals" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All journals</SelectItem>
                                    {journals.map((journal) => (
                                        <SelectItem key={journal.id} value={String(journal.id)}>
                                            {journal.code} — {journal.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Date from</Label>
                            <DatePicker
                                value={filters.dateFrom}
                                onChange={(value) =>
                                    setFilters((prev) => ({ ...prev, dateFrom: value }))
                                }
                                placeholder="Start date"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Date to</Label>
                            <DatePicker
                                value={filters.dateTo}
                                onChange={(value) =>
                                    setFilters((prev) => ({ ...prev, dateTo: value }))
                                }
                                placeholder="End date"
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            <Button type="button" onClick={applyFilters}>
                                Apply
                            </Button>
                            {hasActiveFilters ? (
                                <Button type="button" variant="outline" onClick={resetFilters}>
                                    Reset
                                </Button>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/60 shadow-sm">
                    <CardHeader className="border-b border-border/60 bg-muted/30 py-5">
                        <CardTitle className="text-base font-semibold">Entries</CardTitle>
                        <CardDescription>
                            {total.toLocaleString()} journal {total === 1 ? 'entry' : 'entries'} found.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4">
                        <DataTable
                            columns={columns}
                            data={journalEntries}
                            filterableColumns={journalEntryFilterableColumns}
                            filterPlaceholder="Search entries..."
                            columnLabels={journalEntryColumnLabels}
                            initialSorting={[{ id: 'entry_date', desc: true }]}
                            enableRowSelection={false}
                            serverSidePagination={{
                                totalRowCount: total,
                                pageIndex,
                                pageSize,
                                search,
                                onPaginationChange: handlePaginationChange,
                            }}
                        />
                    </CardContent>
                </Card>
            </div>

            <JournalEntryViewDialog
                open={viewOpen}
                onOpenChange={(open) => {
                    setViewOpen(open);
                    if (!open) setSelectedEntry(null);
                }}
                journalEntry={selectedEntry}
                loading={viewLoading}
            />

            <AlertDialog open={Boolean(postTarget)} onOpenChange={(open) => !open && setPostTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Post journal entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will post entry {postTarget?.entry_no} and update account balances. This action
                            cannot be undone except by voiding the entry.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => postTarget && handlePost(postTarget)}>
                            Post entry
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={Boolean(voidTarget)} onOpenChange={(open) => !open && setVoidTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Void journal entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will void entry {voidTarget?.entry_no} and create a reversing posted entry.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => voidTarget && handleVoid(voidTarget)}>
                            Void entry
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete journal entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete draft entry {deleteTarget?.entry_no}. This action cannot
                            be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteTarget && handleDelete(deleteTarget)}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AppLayout>
    );
}
