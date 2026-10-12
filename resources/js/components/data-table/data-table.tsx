import type {
    ColumnDef,
    ColumnFiltersState,
    SortingState,
    VisibilityState,
} from '@tanstack/react-table';
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from '@tanstack/react-table';
import * as React from 'react';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { DataTableFilter } from '@/components/data-table/data-table-filter';
import { DataTablePagination } from '@/components/data-table/data-table-pagination';
import { DataTableViewOptions } from '@/components/data-table/data-table-view-options';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FilterIcon } from 'lucide-react';

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
    onPaginationChange: (params: {
        pageIndex: number;
        pageSize: number;
        search?: string;
    }) => void;
}

export interface DataTableProps<TData, TValue> {
    columns: ColumnDef<TData, TValue>[];
    data: TData[];
    /** Column id to filter by (legacy single-column filter) */
    filterColumn?: string;
    /** Filterable columns: column id -> display label. When set, shows input + column dropdown + search button. */
    filterableColumns?: Record<string, string>;
    /** Placeholder for the filter input */
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
    /** Optional content rendered in the toolbar beside the column visibility toggle (e.g. Export button) */
    toolbarExtra?: React.ReactNode;
    /** Optional content rendered below the search row, still inside the Search & filter card */
    toolbarFilterExtra?: React.ReactNode;
    /** Initial column sorting (e.g. newest first on created_at) */
    initialSorting?: SortingState;
    /** Optional class names for each body row */
    getRowClassName?: (row: TData) => string | undefined;
}

export function DataTable<TData, TValue>({
    columns,
    data,
    filterColumn,
    filterableColumns,
    filterPlaceholder = 'Filter...',
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
}: DataTableProps<TData, TValue>) {
    const hasFilterableColumns =
        filterableColumns && Object.keys(filterableColumns).length > 0;
    const hasLegacyFilter = filterColumn && !hasFilterableColumns;
    const isServerSide = Boolean(serverSidePagination);
    const [sorting, setSorting] = React.useState<SortingState>(initialSorting);
    const [columnFilters, setColumnFilters] =
        React.useState<ColumnFiltersState>([]);
    const [columnVisibility, setColumnVisibility] =
        React.useState<VisibilityState>({});
    const [rowSelection, setRowSelection] = React.useState({});
    /** When server-side, use parent's search for onPaginationChange; local serverSearch only for apply flow */
    const currentServerSearch =
        isServerSide && serverSidePagination?.search !== undefined
            ? serverSidePagination.search
            : undefined;

    const paginationState = isServerSide
        ? {
              pageIndex: serverSidePagination!.pageIndex,
              pageSize: serverSidePagination!.pageSize,
          }
        : undefined;
    const pageCount = isServerSide
        ? Math.max(
              1,
              Math.ceil(
                  serverSidePagination!.totalRowCount /
                      serverSidePagination!.pageSize,
              ),
          )
        : undefined;

    const table = useReactTable({
        data,
        columns,
        getRowId: (row, index) => (row as { id?: number }).id != null ? String((row as { id: number }).id) : String(index),
        enableRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: isServerSide
            ? undefined
            : getPaginationRowModel(),
        getSortedRowModel: isServerSide ? undefined : getSortedRowModel(),
        getFilteredRowModel: isServerSide ? undefined : getFilteredRowModel(),
        manualSorting: isServerSide,
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        manualPagination: isServerSide,
        pageCount: pageCount,
        onPaginationChange: isServerSide
            ? (updater) => {
                  const next =
                      typeof updater === 'function'
                          ? updater({
                                pageIndex: serverSidePagination!.pageIndex,
                                pageSize: serverSidePagination!.pageSize,
                            })
                          : updater;
                  serverSidePagination!.onPaginationChange({
                      pageIndex: next.pageIndex,
                      pageSize: next.pageSize,
                      search: currentServerSearch ?? undefined,
                  });
              }
            : undefined,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
            ...(paginationState && { pagination: paginationState }),
        },
    });

    React.useEffect(() => {
        if (onRowSelectionChangeProp) {
            const selected = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
            onRowSelectionChangeProp(selected);
        }
    }, [rowSelection, data, onRowSelectionChangeProp]);

    const showFilters = hasFilterableColumns || Boolean(hasLegacyFilter);

    return (
        <div className="space-y-4">
            <div className="rounded-xl border-2 border-border bg-muted/50 p-3 shadow-sm sm:p-4">
                {showFilters ? (
                    <div className="mb-3 flex items-center gap-2 border-b border-border/80 pb-2">
                        <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <FilterIcon className="size-3.5" aria-hidden />
                        </span>
                        <div>
                            <p className="text-sm font-semibold text-foreground">Search &amp; filter</p>
                            <p className="text-xs text-muted-foreground">
                                Find records, then refine columns or clear to reset.
                            </p>
                        </div>
                    </div>
                ) : null}
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex min-w-0 flex-1 flex-wrap items-end gap-4">
                        {hasFilterableColumns ? (
                            <DataTableFilter
                                table={table}
                                filterableColumns={filterableColumns}
                                placeholder={filterPlaceholder}
                                hasActiveFilters={
                                    isServerSide
                                        ? (currentServerSearch?.length ?? 0) > 0
                                        : columnFilters.length > 0
                                }
                                appliedSearchValue={
                                    isServerSide ? currentServerSearch : undefined
                                }
                                selectedColumnId={filterColumnId}
                                onSelectedColumnIdChange={onFilterColumnChange}
                                onSearchApplied={
                                    isServerSide
                                        ? (_columnId, value) => {
                                              serverSidePagination!.onPaginationChange(
                                                  {
                                                      pageIndex: 0,
                                                      pageSize:
                                                          serverSidePagination!
                                                              .pageSize,
                                                      search: value || undefined,
                                                  },
                                              );
                                          }
                                        : undefined
                                }
                                onReset={
                                    isServerSide
                                        ? () => {
                                              serverSidePagination!.onPaginationChange(
                                                  {
                                                      pageIndex: 0,
                                                      pageSize:
                                                          serverSidePagination!
                                                              .pageSize,
                                                      search: '',
                                                  },
                                              );
                                          }
                                        : undefined
                                }
                            />
                        ) : hasLegacyFilter ? (
                            <div className="space-y-1">
                                <label
                                    htmlFor="data-table-legacy-filter"
                                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                                >
                                    Search
                                </label>
                                <Input
                                    id="data-table-legacy-filter"
                                    placeholder={filterPlaceholder}
                                    value={
                                        (table
                                            .getColumn(filterColumn)
                                            ?.getFilterValue() as string) ?? ''
                                    }
                                    onChange={(event) =>
                                        table
                                            .getColumn(filterColumn)
                                            ?.setFilterValue(event.target.value)
                                    }
                                    className="h-10 max-w-sm border-border bg-background shadow-sm"
                                />
                            </div>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pb-0.5">
                        {toolbarExtra}
                        <DataTableViewOptions
                            table={table}
                            columnLabels={columnLabels}
                        />
                    </div>
                </div>
                {toolbarFilterExtra ? (
                    <div className="mt-3 border-t border-border/80 pt-3">
                        {toolbarFilterExtra}
                    </div>
                ) : null}
            </div>
            <div className="overflow-hidden rounded-xl border-2 border-border bg-card shadow-sm">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    const meta = header.column.columnDef.meta as
                                        | { width?: number; minWidth?: number }
                                        | undefined;
                                    return (
                                        <TableHead
                                            key={header.id}
                                            style={
                                                meta?.width || meta?.minWidth
                                                    ? {
                                                          width: meta.width,
                                                          minWidth:
                                                              meta.minWidth ??
                                                              meta.width,
                                                      }
                                                    : undefined
                                            }
                                        >
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef
                                                          .header,
                                                      header.getContext(),
                                                  )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={
                                        row.getIsSelected() && 'selected'
                                    }
                                    className={cn(getRowClassName?.(row.original))}
                                >
                                    {row.getVisibleCells().map((cell) => {
                                        const meta = cell.column.columnDef
                                            .meta as
                                            | {
                                                  width?: number;
                                                  minWidth?: number;
                                              }
                                            | undefined;
                                        return (
                                            <TableCell
                                                key={cell.id}
                                                style={
                                                    meta?.width ||
                                                    meta?.minWidth
                                                        ? {
                                                              width: meta.width,
                                                              minWidth:
                                                                  meta.minWidth ??
                                                                  meta.width,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {flexRender(
                                                    cell.column.columnDef.cell,
                                                    cell.getContext(),
                                                )}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell
                                    colSpan={columns.length}
                                    className="h-24 text-center"
                                >
                                    No results.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <DataTablePagination
                table={table}
                totalRowCount={
                    isServerSide
                        ? serverSidePagination!.totalRowCount
                        : undefined
                }
                pageIndex={
                    isServerSide ? serverSidePagination!.pageIndex : undefined
                }
                pageSize={
                    isServerSide ? serverSidePagination!.pageSize : undefined
                }
            />
        </div>
    );
}
