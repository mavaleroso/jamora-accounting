import { Button } from '@/components/ui/button';
import { router } from '@inertiajs/react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

/** Shape of a Laravel LengthAwarePaginator serialized by Inertia. */
export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    prev_page_url: string | null;
    next_page_url: string | null;
};

export function Paginator({ page, noun = 'records' }: { page: Paginated<unknown>; noun?: string }) {
    const go = (url: string | null) => url && router.get(url, {}, { preserveState: true, preserveScroll: true });

    return (
        <div className="text-muted-foreground flex flex-col items-center justify-between gap-2 text-sm sm:flex-row">
            <span>{page.total === 0 ? `No ${noun}` : `Showing ${page.from}–${page.to} of ${page.total.toLocaleString()} ${noun}`}</span>
            {page.last_page > 1 && (
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={!page.prev_page_url} onClick={() => go(page.prev_page_url)}>
                        <ChevronLeftIcon className="size-4" />
                        Previous
                    </Button>
                    <span className="tabular-nums">
                        Page {page.current_page} of {page.last_page}
                    </span>
                    <Button variant="outline" size="sm" disabled={!page.next_page_url} onClick={() => go(page.next_page_url)}>
                        Next
                        <ChevronRightIcon className="size-4" />
                    </Button>
                </div>
            )}
        </div>
    );
}
