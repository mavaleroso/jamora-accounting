import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [10, 25, 50, 100];

function pageWindow(current: number, last: number): (number | 'gap')[] {
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
    const start = Math.max(2, Math.min(current - 1, last - 4));
    const end = Math.min(last - 1, Math.max(current + 1, 5));
    return [1, ...(start > 2 ? ['gap' as const] : []), ...Array.from({ length: end - start + 1 }, (_, i) => start + i), ...(end < last - 1 ? ['gap' as const] : []), last];
}

export type ServerPaginationProps = {
    page: number;
    lastPage: number;
    perPage: number;
    total: number;
    /** 1-based index of the first / last row on this page (null when empty). */
    from: number | null;
    to: number | null;
    disabled?: boolean;
    pageSizes?: number[];
    onPage: (page: number) => void;
    /** Omit to hide the rows-per-page picker (e.g. when the server uses a fixed page size). */
    onPerPage?: (perPage: number) => void;
};

/** Footer for server-paginated lists: "Showing x–y of z", rows per page, and page buttons. */
export function ServerPagination({ page, lastPage, perPage, total, from, to, disabled = false, pageSizes = PAGE_SIZES, onPage, onPerPage }: ServerPaginationProps) {
    const nav = (target: number, label: string, icon: React.ReactNode, className?: string) => (
        <Button variant="outline" size="icon" className={cn('size-8', className)} disabled={disabled || target < 1 || target > lastPage || target === page} onClick={() => onPage(target)} aria-label={label} title={label}>
            {icon}
        </Button>
    );

    return (
        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
                {total === 0 ? (
                    'No entries'
                ) : (
                    <>
                        Showing <span className="font-medium text-foreground tabular-nums">{from?.toLocaleString()}–{to?.toLocaleString()}</span> of <span className="font-medium text-foreground tabular-nums">{total.toLocaleString()}</span>
                    </>
                )}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                {onPerPage && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium whitespace-nowrap">Rows per page</span>
                        <Select value={String(perPage)} onValueChange={(v) => onPerPage(Number(v))}>
                            <SelectTrigger className="h-8 w-[70px]" aria-label="Rows per page">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent side="top">
                                {(pageSizes.includes(perPage) ? pageSizes : [...pageSizes, perPage].sort((a, b) => a - b)).map((n) => (
                                    <SelectItem key={n} value={String(n)}>
                                        {n}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                <nav className="flex items-center gap-1" aria-label="Pagination">
                    {nav(1, 'First page', <ChevronsLeft className="size-4" />, 'hidden lg:inline-flex')}
                    {nav(page - 1, 'Previous page', <ChevronLeft className="size-4" />)}
                    {pageWindow(page, lastPage).map((p, i) =>
                        p === 'gap' ? (
                            <span key={`gap-${i}`} className="flex size-8 items-center justify-center text-muted-foreground" aria-hidden>
                                …
                            </span>
                        ) : (
                            <Button
                                key={p}
                                variant={p === page ? 'default' : 'outline'}
                                size="icon"
                                className="size-8 min-w-8 tabular-nums"
                                disabled={disabled && p !== page}
                                onClick={() => p !== page && onPage(p)}
                                aria-label={`Page ${p}`}
                                aria-current={p === page ? 'page' : undefined}
                            >
                                {p}
                            </Button>
                        ),
                    )}
                    {nav(page + 1, 'Next page', <ChevronRight className="size-4" />)}
                    {nav(lastPage, 'Last page', <ChevronsRight className="size-4" />, 'hidden lg:inline-flex')}
                </nav>
            </div>
        </div>
    );
}
