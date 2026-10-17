import * as React from 'react';
import { cn } from '@/lib/utils';
import { tableStyles as s } from './table-card';

export type ListColumn<T> = {
    id: string;
    header: React.ReactNode;
    cell: (row: T, index: number) => React.ReactNode;
    /** Classes for the body cell. */
    className?: string;
    /** Classes for the header cell. */
    headerClassName?: string;
    align?: 'left' | 'right' | 'center';
    /** Hide the column on screens narrower than this breakpoint. */
    minScreen?: 'sm' | 'md' | 'lg' | 'xl';
};

export type ListTableProps<T> = {
    columns: ListColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string | number;
    /** Row actions (usually a ⋯ menu), rendered as the first column. */
    actions?: (row: T, index: number) => React.ReactNode;
    /** Number of the first row, for the # column (e.g. pagination.from). false hides the column. */
    sequenceStart?: number | false;
    onRowClick?: (row: T, index: number) => void;
    selectedKey?: string | number | null;
    rowClassName?: (row: T) => string | undefined;
    /** Background class for the coloured edge shown on hover and selection (e.g. "bg-sky-500"). */
    rowAccent?: (row: T) => string | undefined;
    /** Split rows under sticky headers, e.g. by day. Rows must already be sorted by the group. */
    groupBy?: { key: (row: T) => string; label: (key: string, rows: T[]) => React.ReactNode };
    /** Card layout for phones. Without it the table scrolls sideways on small screens. */
    mobileRow?: (row: T, index: number) => React.ReactNode;
    /** Shown instead of the table when there are no rows. */
    empty?: React.ReactNode;
    loading?: boolean;
    /** Receives each row element, e.g. to scroll the selected row into view. */
    rowRef?: (key: string | number, el: HTMLElement | null) => void;
};

const HIDE: Record<NonNullable<ListColumn<unknown>['minScreen']>, string> = {
    sm: 'hidden sm:table-cell',
    md: 'hidden md:table-cell',
    lg: 'hidden lg:table-cell',
    xl: 'hidden xl:table-cell',
};
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/**
 * The app's standard list: # and actions first, hover/selected states, optional day-style grouping,
 * and a card layout on phones. Use inside a <TableCard>, followed by <ServerPagination>.
 */
export function ListTable<T>({ columns, rows, rowKey, actions, sequenceStart = 1, onRowClick, selectedKey = null, rowClassName, rowAccent, groupBy, mobileRow, empty, loading = false, rowRef }: ListTableProps<T>) {
    const groups = React.useMemo(() => {
        if (!groupBy) return [{ key: '', rows: rows.map((row, index) => ({ row, index })) }];
        const out: { key: string; rows: { row: T; index: number }[] }[] = [];
        rows.forEach((row, index) => {
            const key = groupBy.key(row);
            const last = out[out.length - 1];
            if (last?.key === key) last.rows.push({ row, index });
            else out.push({ key, rows: [{ row, index }] });
        });
        return out;
    }, [rows, groupBy]);

    if (rows.length === 0 && empty) return <>{empty}</>;

    const showSeq = sequenceStart !== false;
    const seq = (index: number) => ((sequenceStart || 1) + index).toLocaleString();
    const colCount = columns.length + (actions ? 1 : 0) + (showSeq ? 1 : 0);
    const groupLabel = (key: string, items: { row: T }[]) => groupBy?.label(key, items.map((i) => i.row));

    const activate = (row: T, index: number) => onRowClick?.(row, index);
    const keyActivate = (e: React.KeyboardEvent, row: T, index: number) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        activate(row, index);
    };
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    return (
        <div className={cn('transition-opacity', loading && 'pointer-events-none opacity-60', !mobileRow && 'overflow-x-auto')}>
            <table className={cn(s.table, mobileRow && 'hidden md:table')}>
                <thead className={s.thead}>
                    <tr>
                        {actions && (
                            <th className={s.actionsTh}>
                                <span className="sr-only">Actions</span>
                            </th>
                        )}
                        {showSeq && <th className={cn(s.seqTh, !actions && 'pl-5')}>#</th>}
                        {columns.map((c, i) => (
                            <th key={c.id} className={cn(s.th, ALIGN[c.align ?? 'left'], !actions && !showSeq && i === 0 && s.first, i === columns.length - 1 && s.last, c.minScreen && HIDE[c.minScreen], c.headerClassName)}>
                                {c.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                {groups.map((g) => (
                    <tbody key={g.key || 'all'}>
                        {groupBy && (
                            <tr>
                                <th colSpan={colCount} className={s.groupTh}>
                                    {groupLabel(g.key, g.rows)}
                                </th>
                            </tr>
                        )}
                        {g.rows.map(({ row, index }) => {
                            const key = rowKey(row);
                            const selected = selectedKey !== null && key === selectedKey;
                            const accent = rowAccent?.(row);
                            const accentEdge = accent && <span className={cn('absolute inset-y-0 left-0 w-1 opacity-0 transition-opacity', accent, selected ? 'opacity-100' : 'group-hover:opacity-100')} />;
                            return (
                                <tr
                                    key={key}
                                    ref={rowRef ? (el) => rowRef(key, el) : undefined}
                                    className={cn('group', s.tr, onRowClick && s.trClickable, selected && s.trSelected, rowClassName?.(row))}
                                    onClick={onRowClick ? () => activate(row, index) : undefined}
                                    onKeyDown={onRowClick ? (e) => keyActivate(e, row, index) : undefined}
                                    tabIndex={onRowClick ? 0 : undefined}
                                    aria-selected={onRowClick ? selected : undefined}
                                >
                                    {actions && (
                                        <td className={cn('relative', s.actionsTd)} onClick={stop} onKeyDown={stop}>
                                            {accentEdge}
                                            {actions(row, index)}
                                        </td>
                                    )}
                                    {showSeq && (
                                        <td className={cn(s.seqTd, !actions && 'relative pl-5')}>
                                            {!actions && accentEdge}
                                            {seq(index)}
                                        </td>
                                    )}
                                    {columns.map((c, i) => (
                                        <td key={c.id} className={cn(s.td, ALIGN[c.align ?? 'left'], !actions && !showSeq && i === 0 && cn('relative', s.first), i === columns.length - 1 && s.last, c.minScreen && HIDE[c.minScreen], c.className)}>
                                            {!actions && !showSeq && i === 0 && accentEdge}
                                            {c.cell(row, index)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                ))}
            </table>

            {mobileRow && (
                <div className="md:hidden">
                    {groups.map((g) => (
                        <div key={g.key || 'all'}>
                            {groupBy && <p className="sticky top-0 z-10 border-y bg-muted/80 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase backdrop-blur">{groupLabel(g.key, g.rows)}</p>}
                            <ul className="divide-y">
                                {g.rows.map(({ row, index }) => {
                                    const key = rowKey(row);
                                    const selected = selectedKey !== null && key === selectedKey;
                                    return (
                                        <li
                                            key={key}
                                            className={cn('flex items-start gap-3 px-4 py-3', onRowClick && 'cursor-pointer active:bg-muted/50', selected && 'bg-primary/5', rowClassName?.(row))}
                                            onClick={onRowClick ? () => activate(row, index) : undefined}
                                            onKeyDown={onRowClick ? (e) => keyActivate(e, row, index) : undefined}
                                            tabIndex={onRowClick ? 0 : undefined}
                                            role={onRowClick ? 'button' : undefined}
                                        >
                                            {showSeq && <span className="mt-1 w-6 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">{seq(index)}</span>}
                                            <div className="min-w-0 flex-1">{mobileRow(row, index)}</div>
                                            {actions && (
                                                <div className="shrink-0" onClick={stop} onKeyDown={stop}>
                                                    {actions(row, index)}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
