import type { ColumnDef, ColumnFiltersState, SortingState, VisibilityState } from '@tanstack/react-table';
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import * as React from 'react';

import { DataTableViewOptions } from '@/components/data-table/data-table-view-options';
import { ServerPagination } from '@/components/data-table/server-pagination';
import { TableCard, TableEmpty, TableSearch, TableToolbar, tableStyles as s } from '@/components/data-table/table-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface DataTableServerSidePaginationProps {
    /** Total number of rows on the server (for "Showing X–Y of Z" and page count) */
    totalRowCount: number;
    /** Current 0-based page index (controlled by parent) */
    pageIndex: number;
    /** Current page size (controlled by parent) */
    pageSize: number;
    /** Current applied search/filter (controlled by parent); used when changing page/size and for filter input display */
    search?: string;
    /** Called when user changes page, page size, or filter; parent should fetch and update data */
    onPaginationChange: (params: { pageIndex: number; pageSize: number; search?: string }) => void;
    /** True while the parent is fetching; dims the rows and shows a spinner. */
    loading?: boolean;
}

export interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    /** Card heading and sub-heading. */
    title?: React.ReactNode;
    description?: React.ReactNode;
    /** Column id to filter by (legacy single-column filter) */
    filterColumn?: string;
    /** Filterable columns: column id -> display label. Shows the search box (and, client-side, a "search in" picker). */
    filterableColumns?: Record<string, string>;
    /** Placeholder for the search input */
    filterPlaceholder?: string;
    /** Custom column labels for visibility toggle (e.g. { email: "Email" }) */
    columnLabels?: Record<string, string>;
    /** Selected filter column id (controlled) */
    filterColumnId?: string;
    /** Selected filter column change handler (controlled) */
    onFilterColumnChange?: (columnId: string) => void;
    /** Enable row selection */
    enableRowSelection?: boolean;
    /** Called when row selection changes with the selected row data (for bulk actions) */
    onRowSelectionChange?: (selectedRows: TData[]) => void;
    /** Enable server-side pagination; requires serverSidePagination props */
    serverSidePagination?: DataTableServerSidePaginationProps;
    /** Rendered at the right of the toolbar, beside the Columns toggle (e.g. Export button) */
    toolbarExtra?: React.ReactNode;
    /** Extra filters rendered in the toolbar after the search box */
    toolbarFilterExtra?: React.ReactNode;
    /** Initial column sorting (e.g. newest first on created_at) */
    initialSorting?: SortingState;
    /** Optional class names for each body row */
    getRowClassName?: (row: TData) => string | undefined;
    /** Open a row (e.g. a details dialog) when it is clicked. */
    onRowClick?: (row: TData) => void;
    /** Adds a # column when the columns do not define `row_number`. Default true. */
    rowNumbers?: boolean;
    /** Text for the empty state. */
    emptyTitle?: string;
    emptyDescription?: React.ReactNode;
}

const ACTIONS = 'actions';
const ROW_NUMBER = 'row_number';

/** Running row number across pages. */
function rowNumberColumn<TData, TValue>(): ColumnDef<TData, TValue> {
    return {
        id: ROW_NUMBER,
        header: '#',
        cell: ({ row, table }) => {
            const { pageIndex, pageSize } = table.getState().pagination;
            const position = table.getRowModel().rows.findIndex((r) => r.id === row.id);
            return pageIndex * pageSize + (position >= 0 ? position : row.index) + 1;
        },
        enableSorting: false,
        enableHiding: false,
    };
}

/** Same order everywhere: actions, #, then the data columns. */
function normalizeColumns<TData, TValue>(columns: ColumnDef<TData, TValue>[], rowNumbers: boolean): ColumnDef<TData, TValue>[] {
    const actions = columns.filter((c) => c.id === ACTIONS);
    const numbers = columns.filter((c) => c.id === ROW_NUMBER);
    const rest = columns.filter((c) => c.id !== ACTIONS && c.id !== ROW_NUMBER);
    return [...actions, ...(numbers.length ? numbers : rowNumbers ? [rowNumberColumn<TData, TValue>()] : []), ...rest];
}

export function DataTable<TData, TValue>({
    columns: columnsProp,
    data,
    title,
    description,
    filterColumn,
    filterableColumns,
    filterPlaceholder = 'Search',
    columnLabels = {},
    filterColumnId,
    onFilterColumnChange,
    enableRowSelection = true,
    onRowSelectionChange: onRowSelectionChangeProp,
    serverSidePagination,
    toolbarExtra,
    toolbarFilterExtra,
    initialSorting = [],
    getRowClassName,
    onRowClick,
    rowNumbers = true,
    emptyTitle = 'No records found',
    emptyDescription,
}: DataTableProps<TData, TValue>) {
    const isServerSide = Boolean(serverSidePagination);
    const server = serverSidePagination;
    const columns = React.useMemo(() => normalizeColumns(columnsProp, rowNumbers), [columnsProp, rowNumbers]);

    const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = React.useState({});

    const searchColumns = filterableColumns ? Object.keys(filterableColumns) : filterColumn ? [filterColumn] : [];
    const [internalColumn, setInternalColumn] = React.useState(searchColumns[0] ?? '');
    const searchColumn = filterColumnId ?? internalColumn;
    const setSearchColumn = onFilterColumnChange ?? setInternalColumn;
    const showSearch = searchColumns.length > 0;

    const table = useReactTable({
        data,
        columns,
        getRowId: (row, index) => ((row as { id?: number }).id != null ? String((row as { id: number }).id) : String(index)),
        enableRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: isServerSide ? undefined : getPaginationRowModel(),
        getSortedRowModel: isServerSide ? undefined : getSortedRowModel(),
        getFilteredRowModel: isServerSide ? undefined : getFilteredRowModel(),
        manualSorting: isServerSide,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        manualPagination: isServerSide,
        pageCount: server ? Math.max(1, Math.ceil(server.totalRowCount / server.pageSize)) : undefined,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
            ...(server && { pagination: { pageIndex: server.pageIndex, pageSize: server.pageSize } }),
        },
    });

    React.useEffect(() => {
        if (onRowSelectionChangeProp) onRowSelectionChangeProp(table.getFilteredSelectedRowModel().rows.map((r) => r.original));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowSelection, data, onRowSelectionChangeProp]);

    // --- search -------------------------------------------------------------------------------
    const appliedSearch = server ? (server.search ?? '') : String((searchColumn && columnFilters.find((f) => f.id === searchColumn)?.value) ?? '');
    const onSearch = (value: string) => {
        if (server) return server.onPaginationChange({ pageIndex: 0, pageSize: server.pageSize, search: value });
        table.setColumnFilters((prev) => [...prev.filter((f) => !searchColumns.includes(f.id)), ...(value ? [{ id: searchColumn, value }] : [])]);
        table.setPageIndex(0);
    };
    const changeSearchColumn = (next: string) => {
        setSearchColumn(next);
        if (!server && appliedSearch) table.setColumnFilters((prev) => [...prev.filter((f) => !searchColumns.includes(f.id)), { id: next, value: appliedSearch }]);
    };

    // --- pagination ---------------------------------------------------------------------------
    const { pageIndex, pageSize } = table.getState().pagination;
    const total = server ? server.totalRowCount : table.getFilteredRowModel().rows.length;
    const from = total === 0 ? null : pageIndex * pageSize + 1;
    const to = total === 0 ? null : Math.min((pageIndex + 1) * pageSize, total);
    const loading = server?.loading ?? false;

    const rows = table.getRowModel().rows;
    const headerCellClass = (id: string, i: number, count: number) =>
        id === ACTIONS ? s.actionsTh : id === ROW_NUMBER ? cn(s.seqTh, i === 0 && 'pl-5') : cn(s.th, i === 0 && s.first, i === count - 1 && s.last);
    const bodyCellClass = (id: string, i: number, count: number) =>
        id === ACTIONS ? s.actionsTd : id === ROW_NUMBER ? cn(s.seqTd, i === 0 && 'pl-5') : cn(s.td, i === 0 && s.first, i === count - 1 && s.last);
    const sizeStyle = (meta: unknown) => {
        const m = meta as { width?: number; minWidth?: number } | undefined;
        return m?.width || m?.minWidth ? { width: m.width, minWidth: m.minWidth ?? m.width } : undefined;
    };

    return (
        <TableCard title={title} description={description}>
            <TableToolbar loading={loading}>
                {showSearch && <TableSearch value={appliedSearch} onSearch={onSearch} placeholder={filterPlaceholder} debounce={server ? 350 : 0} />}
                {/* Server-side search covers all fields, so the column picker only applies client-side */}
                {showSearch && !server && searchColumns.length > 1 && (
                    <Select value={searchColumn} onValueChange={changeSearchColumn}>
                        <SelectTrigger className="h-9 w-full lg:w-44" aria-label="Search in">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {searchColumns.map((id) => (
                                <SelectItem key={id} value={id}>
                                    In {filterableColumns?.[id] ?? id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                {toolbarFilterExtra}
                <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                    {toolbarExtra}
                    <DataTableViewOptions table={table} columnLabels={columnLabels} />
                </div>
            </TableToolbar>

            {rows.length === 0 ? (
                <TableEmpty title={emptyTitle} description={emptyDescription ?? (appliedSearch ? `Nothing matches “${appliedSearch}”. Try a different search.` : undefined)} />
            ) : (
                <div className={cn('overflow-x-auto transition-opacity', loading && 'pointer-events-none opacity-60')}>
                    <table className={s.table}>
                        <thead className={s.thead}>
                            {table.getHeaderGroups().map((group) => (
                                <tr key={group.id}>
                                    {group.headers.map((header, i) => (
                                        <th key={header.id} className={headerCellClass(header.column.id, i, group.headers.length)} style={sizeStyle(header.column.columnDef.meta)}>
                                            {header.isPlaceholder ? null : header.column.id === ACTIONS ? <span className="sr-only">Actions</span> : flexRender(header.column.columnDef.header, header.getContext())}
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {rows.map((row) => {
                                const cells = row.getVisibleCells();
                                return (
                                    <tr
                                        key={row.id}
                                        data-state={row.getIsSelected() ? 'selected' : undefined}
                                        className={cn(s.tr, onRowClick && s.trClickable, row.getIsSelected() && s.trSelected, getRowClassName?.(row.original))}
                                        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                                        onKeyDown={onRowClick ? (e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row.original)) : undefined}
                                        tabIndex={onRowClick ? 0 : undefined}
                                    >
                                        {cells.map((cell, i) => (
                                            <td
                                                key={cell.id}
                                                className={bodyCellClass(cell.column.id, i, cells.length)}
                                                style={sizeStyle(cell.column.columnDef.meta)}
                                                onClick={cell.column.id === ACTIONS ? (e) => e.stopPropagation() : undefined}
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <ServerPagination
                page={pageIndex + 1}
                lastPage={Math.max(1, table.getPageCount())}
                perPage={pageSize}
                total={total}
                from={from}
                to={to}
                disabled={loading}
                onPage={(page) => (server ? server.onPaginationChange({ pageIndex: page - 1, pageSize, search: server.search }) : table.setPageIndex(page - 1))}
                onPerPage={(size) => (server ? server.onPaginationChange({ pageIndex: 0, pageSize: size, search: server.search }) : table.setPageSize(size))}
            />
        </TableCard>
    );
}
