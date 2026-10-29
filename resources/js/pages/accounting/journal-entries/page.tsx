import { Head, Link, router, usePage } from '@inertiajs/react';
import { CheckCheckIcon, PlusIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
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
import { DatePicker } from '@/components/ui/date-picker';
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
    initialStatus?: string;
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
    initialStatus = '',
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
    const [loading, setLoading] = React.useState(false);
    const [filters, setFilters] = React.useState<ListFilters>({
        status: initialStatus,
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
    const [approveAllOpen, setApproveAllOpen] = React.useState(false);
    const [approvingAll, setApprovingAll] = React.useState(false);
    const needsApproval = (entry: JournalEntry | null) => entry?.source_system === 'manual' || entry?.status === 'pending';

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
            setLoading(true);
            fetchPage({
                pageIndex: params.pageIndex,
                pageSize: params.pageSize,
                search: params.search ?? search,
            }).finally(() => setLoading(false));
        },
        [fetchPage, search],
    );

    // Filters apply as soon as they change, like every other table toolbar
    const setFilter = (patch: Partial<ListFilters>) => {
        const next = { ...filters, ...patch };
        setLoading(true);
        fetchPage({ pageIndex: 0, pageSize, search, filters: next }).finally(() => setLoading(false));
    };

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
                        toast.success(needsApproval(entry) ? 'Journal entry approved and posted.' : 'Journal entry posted successfully.');
                        setPostTarget(null);
                        fetchPage({ pageIndex, pageSize, search, filters });
                    },
                    onError: () => toast.error('Failed to post journal entry.'),
                },
            );
        },
        [fetchPage, filters, pageIndex, pageSize, search],
    );

    // Approves everything waiting that matches the current filters (search, journal, dates).
    const handleApproveAll = React.useCallback(async () => {
        setApprovingAll(true);
        try {
            const res = await fetch('/accounting/journal-entries/approve-pending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': getCsrfToken() },
                credentials: 'same-origin',
                body: JSON.stringify({
                    search: search || undefined,
                    journal_id: filters.journalId ? Number(filters.journalId) : undefined,
                    date_from: filters.dateFrom || undefined,
                    date_to: filters.dateTo || undefined,
                }),
            });
            const json = (await res.json().catch(() => ({}))) as { message?: string };
            if (res.ok) toast.success(json.message ?? 'Entries approved and posted.');
            else toast.error(json.message ?? 'Could not approve the entries.');
        } catch {
            toast.error('Could not approve the entries.');
        } finally {
            setApprovingAll(false);
            setApproveAllOpen(false);
            fetchPage({ pageIndex: 0, pageSize, search, filters });
        }
    }, [fetchPage, filters, pageSize, search]);

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
                canApprove: can('journals.approve'),
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
                        description="Create manual entries, and review and approve the entries waiting for approval before they reach the ledger."
                    />
                    <div className="flex flex-wrap gap-2">
                        {filters.status === 'pending' && can('journals.approve') && total > 0 ? (
                            <Button variant="outline" onClick={() => setApproveAllOpen(true)} disabled={approvingAll}>
                                <CheckCheckIcon className="mr-2 size-4" />
                                Approve all {total.toLocaleString()}
                            </Button>
                        ) : null}
                        {can('journals.create') ? (
                            <Button asChild>
                                <Link href="/accounting/journal-entries/create">
                                    <PlusIcon className="mr-2 size-4" />
                                    New Entry
                                </Link>
                            </Button>
                        ) : null}
                    </div>
                </div>

                <DataTable
                    title="Entries"
                    description={`${total.toLocaleString()} journal ${total === 1 ? 'entry' : 'entries'} found.`}
                    columns={columns}
                    data={journalEntries}
                    filterableColumns={journalEntryFilterableColumns}
                    filterPlaceholder="Search entries"
                    columnLabels={journalEntryColumnLabels}
                    initialSorting={[{ id: 'entry_date', desc: true }]}
                    enableRowSelection={false}
                    emptyTitle="No journal entries found"
                    toolbarFilterExtra={
                        <>
                            <Select value={filters.status || 'all'} onValueChange={(value) => setFilter({ status: value === 'all' ? '' : value })}>
                                <SelectTrigger className={cn('h-9 w-full lg:w-36', filters.status && 'border-primary/50')} aria-label="Status">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All statuses</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="pending">For approval</SelectItem>
                                    <SelectItem value="posted">Posted</SelectItem>
                                    <SelectItem value="void">Void</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={filters.journalId || 'all'} onValueChange={(value) => setFilter({ journalId: value === 'all' ? '' : value })}>
                                <SelectTrigger className={cn('h-9 w-full lg:w-48', filters.journalId && 'border-primary/50')} aria-label="Journal">
                                    <SelectValue />
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
                            <div className="flex items-center gap-2">
                                <DatePicker value={filters.dateFrom} onChange={(value) => setFilter({ dateFrom: value })} placeholder="From" className="h-9 w-full lg:w-36" />
                                <span className="text-xs text-muted-foreground">to</span>
                                <DatePicker value={filters.dateTo} onChange={(value) => setFilter({ dateTo: value })} placeholder="To" className="h-9 w-full lg:w-36" />
                            </div>
                            {hasActiveFilters && (
                                <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                                    <XIcon className="size-4" /> Clear
                                </Button>
                            )}
                        </>
                    }
                    serverSidePagination={{
                        totalRowCount: total,
                        pageIndex,
                        pageSize,
                        search,
                        onPaginationChange: handlePaginationChange,
                        loading,
                    }}
                />
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
                        <AlertDialogTitle>
                            {needsApproval(postTarget) ? 'Approve and post journal entry?' : 'Post journal entry?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {needsApproval(postTarget)
                                ? `You are approving entry ${postTarget?.entry_no}${postTarget?.prepared_by_user ? ` prepared by ${postTarget.prepared_by_user.name}` : postTarget?.source_system !== 'manual' ? ' recorded from its source document' : ''}. It will be posted and update account balances.`
                                : `This will post entry ${postTarget?.entry_no} and update account balances.`}{' '}
                            This action cannot be undone except by voiding the entry.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => postTarget && handlePost(postTarget)}>
                            {needsApproval(postTarget) ? 'Approve & post' : 'Post entry'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={approveAllOpen} onOpenChange={(open) => !open && !approvingAll && setApproveAllOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approve {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Every entry waiting for approval that matches the current search and filters is posted to the ledger, oldest first (up to 500
                            per click). Narrow the list by journal or date first to approve part of it. Posted entries can only be undone by voiding them.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={approvingAll}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={approvingAll}
                            onClick={(event) => {
                                event.preventDefault();
                                handleApproveAll();
                            }}
                        >
                            {approvingAll ? 'Approving…' : 'Approve & post'}
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
