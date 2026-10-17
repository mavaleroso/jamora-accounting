import { Inbox, Loader2, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Building blocks shared by every list in the app, so tables look and behave the same:
 *
 *   <TableCard title="Entries" description="…" actions={…}>
 *       <TableToolbar loading={loading}>
 *           <TableSearch value={search} onSearch={…} />
 *           …filters
 *       </TableToolbar>
 *       <ListTable … />            (or the TanStack <DataTable />, which renders all of this itself)
 *       <ServerPagination … />
 *   </TableCard>
 */

export function TableCard({
    title,
    description,
    actions,
    className,
    children,
}: {
    title?: React.ReactNode;
    description?: React.ReactNode;
    /** Rendered at the right of the card header (e.g. Export). */
    actions?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <section className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', className)}>
            {(title || actions) && (
                <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                    <div className="min-w-0">
                        {title && <h2 className="text-sm font-semibold">{title}</h2>}
                        {description && <p className="text-xs text-muted-foreground">{description}</p>}
                    </div>
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </header>
            )}
            {children}
        </section>
    );
}

/** Filter row at the top of a table card. Put the search first; a spinner shows while loading. */
export function TableToolbar({ loading = false, className, children, below }: { loading?: boolean; className?: string; children: React.ReactNode; below?: React.ReactNode }) {
    return (
        <div className={cn('space-y-2 border-b p-3', className)}>
            <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
                {children}
                {loading && <Loader2 className="size-4 animate-spin text-muted-foreground lg:ml-auto" aria-label="Loading" />}
            </div>
            {below}
        </div>
    );
}

/**
 * Search box with icon, clear button, Esc to clear and "/" to focus. Calls onSearch after typing pauses
 * (or on every keystroke when `debounce` is 0).
 */
export function TableSearch({
    value,
    onSearch,
    placeholder = 'Search',
    debounce = 350,
    shortcut = true,
    className,
}: {
    /** The applied search (e.g. from the server); the box follows it when it changes from outside. */
    value: string;
    onSearch: (value: string) => void;
    placeholder?: string;
    debounce?: number;
    /** Focus with "/" — enable on one search per page. */
    shortcut?: boolean;
    className?: string;
}) {
    const [text, setText] = React.useState(value);
    const ref = React.useRef<HTMLInputElement>(null);
    const latest = React.useRef(onSearch);
    latest.current = onSearch;
    const applied = React.useRef(value);
    // Only text the user typed triggers a search, never a value pushed in from outside
    const edited = React.useRef(false);

    React.useEffect(() => {
        applied.current = value;
        edited.current = false;
        setText(value);
    }, [value]);

    React.useEffect(() => {
        if (!edited.current || text.trim() === applied.current.trim()) return;
        if (debounce <= 0) return void latest.current(text.trim());
        const t = window.setTimeout(() => latest.current(text.trim()), debounce);
        return () => window.clearTimeout(t);
    }, [text, debounce]);

    const edit = (next: string) => {
        edited.current = true;
        setText(next);
    };

    React.useEffect(() => {
        if (!shortcut) return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (e.key !== '/' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))) return;
            e.preventDefault();
            ref.current?.focus();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [shortcut]);

    return (
        <div className={cn('relative w-full lg:w-72', className)}>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={ref} value={text} onChange={(e) => edit(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && edit('')} placeholder={placeholder} className="h-9 pr-9 pl-8" aria-label={placeholder} />
            {text ? (
                <button type="button" onClick={() => edit('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                    <X className="size-3.5" />
                </button>
            ) : (
                shortcut && <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:block">/</kbd>
            )}
        </div>
    );
}

/** Removable chips for the filters in effect, with "Clear all". */
export function FilterChips({ chips, onClearAll }: { chips: { key: string; label: React.ReactNode; onRemove: () => void }[]; onClearAll?: () => void }) {
    if (chips.length === 0) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Filtered by</span>
            {chips.map((c) => (
                <button key={c.key} type="button" onClick={c.onRemove} className="group inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1.5 pl-2.5 text-xs font-medium hover:border-foreground/30 hover:bg-muted" aria-label="Remove filter">
                    {c.label}
                    <X className="size-3 text-muted-foreground group-hover:text-foreground" />
                </button>
            ))}
            {onClearAll && (
                <button type="button" onClick={onClearAll} className="ml-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                    Clear all
                </button>
            )}
        </div>
    );
}

export function TableEmpty({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <div className="rounded-full bg-muted p-3">
                <Icon className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{title}</p>
            {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

/** Class names shared by ListTable and DataTable so both render identical tables. */
export const tableStyles = {
    table: 'w-full text-sm',
    thead: 'border-b bg-muted/40 text-xs text-muted-foreground',
    th: 'px-3 py-2.5 text-left font-medium whitespace-nowrap',
    tr: 'border-b transition-colors last:border-b-0 hover:bg-muted/40',
    trClickable: 'cursor-pointer focus-visible:bg-muted/40 focus-visible:outline-none',
    trSelected: 'bg-primary/5 hover:bg-primary/5',
    td: 'px-3 py-3 align-middle',
    /** First cell of a row gets extra left padding for the accent edge. */
    first: 'pl-5',
    last: 'pr-4',
    actionsTh: 'w-12 py-2.5 pr-1 pl-3',
    actionsTd: 'w-12 py-3 pr-1 pl-3',
    seqTh: 'w-10 py-2.5 pr-2 pl-1 text-right font-medium',
    seqTd: 'w-10 py-3 pr-2 pl-1 text-right font-mono text-xs text-muted-foreground tabular-nums',
    groupTh: 'sticky top-0 z-10 border-y bg-muted/60 px-5 py-1.5 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur',
};
