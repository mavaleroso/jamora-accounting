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
    /** Initial column sorting (e.g. newest first on created_at) */
    initialSorting?: SortingState;
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
    initialSorting = [],
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

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
                <div className="flex flex-wrap items-center gap-4">
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
                        <Input
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
                            className="max-w-sm"
                        />
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {toolbarExtra}
                    <DataTableViewOptions
                        table={table}
                        columnLabels={columnLabels}
                    />
                </div>
            </div>
            <div className="overflow-hidden rounded-md border">
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id}>
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                  header.column.columnDef
                                                      .header,
                                                  header.getContext(),
                                              )}
                                    </TableHead>
                                ))}
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
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </TableCell>
                                    ))}
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
