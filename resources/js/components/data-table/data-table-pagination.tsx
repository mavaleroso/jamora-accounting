import type { Table } from '@tanstack/react-table';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronsLeftIcon,
    ChevronsRightIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface DataTablePaginationProps<TData> {
    table: Table<TData>;
    /** When using server-side pagination, pass total row count for "Showing X–Y of Z" and page count */
    totalRowCount?: number;
    /** When using server-side pagination, pass current page index so status stays in sync with parent state */
    pageIndex?: number;
    /** When using server-side pagination, pass current page size so status stays in sync with parent state */
    pageSize?: number;
}

function getShowingRange(
    pageIndex: number,
    pageSize: number,
    totalRows: number,
): string {
    if (totalRows === 0) return 'Showing 0 of 0';
    const start = pageIndex * pageSize + 1;
    const end = Math.min((pageIndex + 1) * pageSize, totalRows);
    return `Showing ${start}–${end} of ${totalRows}`;
}

/** Build page numbers to display: first, ... window around current ..., last */
function getPageNumbers(
    currentPage: number,
    pageCount: number,
    maxVisible: number = 5,
): (number | 'ellipsis')[] {
    if (pageCount <= maxVisible) {
        return Array.from({ length: pageCount }, (_, i) => i + 1);
    }
    const half = Math.floor(maxVisible / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(pageCount, currentPage + half);
    if (end - start + 1 < maxVisible) {
        if (start === 1) end = Math.min(pageCount, maxVisible);
        else start = Math.max(1, end - maxVisible + 1);
    }
    const pages: (number | 'ellipsis')[] = [];
    if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('ellipsis');
    }
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < pageCount) {
        if (end < pageCount - 1) pages.push('ellipsis');
        pages.push(pageCount);
    }
    return pages;
}

export function DataTablePagination<TData>({
    table,
    totalRowCount,
    pageIndex: pageIndexProp,
    pageSize: pageSizeProp,
}: DataTablePaginationProps<TData>) {
    const tablePagination = table.getState().pagination;
    const pageIndex =
        pageIndexProp !== undefined ? pageIndexProp : tablePagination.pageIndex;
    const pageSize =
        pageSizeProp !== undefined ? pageSizeProp : tablePagination.pageSize;
    const totalRows = totalRowCount ?? table.getFilteredRowModel().rows.length;
    const pageCount =
        totalRowCount !== undefined
            ? Math.max(1, Math.ceil(totalRowCount / pageSize))
            : table.getPageCount();
    const currentPage = pageIndex + 1;
    const pageNumbers = getPageNumbers(currentPage, pageCount);

    return (
        <div className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
                {getShowingRange(pageIndex, pageSize, totalRows)}
            </div>
            <div className="flex items-center space-x-4 lg:space-x-6">
                <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium">Rows per page</p>
                    <Select
                        value={`${pageSize}`}
                        onValueChange={(value) => {
                            table.setPageSize(Number(value));
                        }}
                    >
                        <SelectTrigger className="h-8 w-[70px]">
                            <SelectValue placeholder={pageSize} />
                        </SelectTrigger>
                        <SelectContent side="top">
                            {[10, 20, 25, 30, 40, 50].map((size) => (
                                <SelectItem key={size} value={`${size}`}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="hidden size-8 lg:flex"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className="sr-only">Go to first page</span>
                        <ChevronsLeftIcon className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className="sr-only">Go to previous page</span>
                        <ChevronLeftIcon className="size-4" />
                    </Button>
                    <div className="flex items-center gap-0.5">
                        {pageNumbers.map((p, i) =>
                            p === 'ellipsis' ? (
                                <span
                                    key={`ellipsis-${i}`}
                                    className="flex size-8 items-center justify-center px-1 text-muted-foreground"
                                    aria-hidden
                                >
                                    …
                                </span>
                            ) : (
                                <Button
                                    type="button"
                                    key={p}
                                    variant={
                                        p === currentPage
                                            ? 'default'
                                            : 'outline'
                                    }
                                    size="icon"
                                    className="size-8 min-w-8"
                                    onClick={() => table.setPageIndex(p - 1)}
                                    aria-label={`Go to page ${p}`}
                                    aria-current={
                                        p === currentPage ? 'page' : undefined
                                    }
                                >
                                    {p}
                                </Button>
                            ),
                        )}
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-8"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        <span className="sr-only">Go to next page</span>
                        <ChevronRightIcon className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="hidden size-8 lg:flex"
                        onClick={() =>
                            table.setPageIndex(table.getPageCount() - 1)
                        }
                        disabled={!table.getCanNextPage()}
                    >
                        <span className="sr-only">Go to last page</span>
                        <ChevronsRightIcon className="size-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
