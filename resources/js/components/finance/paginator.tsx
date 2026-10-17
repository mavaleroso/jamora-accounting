import { router } from '@inertiajs/react';
import { ServerPagination } from '@/components/data-table';

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

/**
 * Footer for a Laravel paginator: the standard ServerPagination, driven through the current URL so filters stay.
 * `pageParam` matches a custom page name (e.g. paginate(..., 'requests_page')).
 */
export function Paginator({ page, pageParam = 'page', perPage = true }: { page: Paginated<unknown>; noun?: string; pageParam?: string; perPage?: boolean }) {
    const visit = (params: Record<string, string | null>) => {
        const url = new URL(window.location.href);
        Object.entries(params).forEach(([k, v]) => (v === null ? url.searchParams.delete(k) : url.searchParams.set(k, v)));
        router.get(url.pathname + url.search, {}, { preserveState: true, preserveScroll: true, replace: true });
    };

    return (
        <ServerPagination
            page={page.current_page}
            lastPage={Math.max(1, page.last_page)}
            perPage={page.per_page}
            total={page.total}
            from={page.from}
            to={page.to}
            onPage={(p) => visit({ [pageParam]: String(p) })}
            onPerPage={perPage ? (size) => visit({ per_page: String(size), [pageParam]: null }) : undefined}
        />
    );
}
