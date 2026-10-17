import { router } from '@inertiajs/react';
import { useState, type ReactNode } from 'react';
import { FilterChips, TableSearch, TableToolbar } from '@/components/data-table';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type FilterSelect = {
    key: string;
    label: string;
    options: { value: string; label: string }[];
};

type FilterBarProps = {
    url: string;
    filters: Record<string, string | number | boolean | null | undefined>;
    searchPlaceholder?: string;
    selects?: FilterSelect[];
    /** Show date-from / date-to pickers bound to these filter keys. */
    dateRange?: { from: string; to: string };
    /** Labels for other filter keys (e.g. { overdue: 'Overdue only' }) so they show as removable chips. */
    chipLabels?: Record<string, string>;
    children?: ReactNode;
};

const ALL = '__all';

function asString(v: string | number | boolean | null | undefined): string {
    return v == null || v === false ? '' : v === true ? '1' : String(v);
}

function fmtDate(value: string) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Server-side filter toolbar for a <TableCard>: live search, selects and an optional date range, all sent as
 * query params so filtered views are bookmarkable. Every change applies immediately and resets to page 1.
 */
export function FilterBar({ url, filters, searchPlaceholder = 'Search', selects = [], dateRange, chipLabels = {}, children }: FilterBarProps) {
    const [loading, setLoading] = useState(false);
    const values = Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, asString(v)]));

    const apply = (patch: Record<string, string>) => {
        const perPage = new URLSearchParams(window.location.search).get('per_page');
        const next = { ...values, ...patch, ...(perPage ? { per_page: perPage } : {}) };
        const query = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== ALL));
        router.get(url, query, { preserveState: true, preserveScroll: true, replace: true, onStart: () => setLoading(true), onFinish: () => setLoading(false) });
    };

    const chips: { key: string; label: ReactNode; onRemove: () => void }[] = [];
    if (values.search) chips.push({ key: 'search', label: `“${values.search}”`, onRemove: () => apply({ search: '' }) });
    selects.forEach((s) => {
        if (!values[s.key]) return;
        chips.push({ key: s.key, label: s.options.find((o) => o.value === values[s.key])?.label ?? values[s.key], onRemove: () => apply({ [s.key]: '' }) });
    });
    if (dateRange && (values[dateRange.from] || values[dateRange.to])) {
        const [from, to] = [values[dateRange.from], values[dateRange.to]];
        chips.push({
            key: 'dates',
            label: from && to ? `${fmtDate(from)} – ${fmtDate(to)}` : from ? `From ${fmtDate(from)}` : `Until ${fmtDate(to)}`,
            onRemove: () => apply({ [dateRange.from]: '', [dateRange.to]: '' }),
        });
    }
    Object.entries(chipLabels).forEach(([key, label]) => values[key] && chips.push({ key, label, onRemove: () => apply({ [key]: '' }) }));

    const clearAll = () => apply(Object.fromEntries(Object.keys(values).map((k) => [k, ''])));

    return (
        <TableToolbar loading={loading} below={<FilterChips chips={chips} onClearAll={clearAll} />}>
            <TableSearch value={values.search ?? ''} onSearch={(search) => apply({ search })} placeholder={searchPlaceholder} />
            {selects.map((select) => (
                <Select key={select.key} value={values[select.key] || ALL} onValueChange={(v) => apply({ [select.key]: v === ALL ? '' : v })}>
                    <SelectTrigger className={cn('h-9 w-full lg:w-44', values[select.key] && 'border-primary/50')} aria-label={select.label}>
                        <SelectValue placeholder={select.label} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>All {select.label.toLowerCase()}</SelectItem>
                        {select.options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                                {o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            ))}
            {dateRange && (
                <div className="flex items-center gap-2">
                    <DatePicker value={values[dateRange.from] ?? ''} onChange={(v) => apply({ [dateRange.from]: v })} placeholder="From" className="h-9 w-full lg:w-40" />
                    <span className="text-xs text-muted-foreground">to</span>
                    <DatePicker value={values[dateRange.to] ?? ''} onChange={(v) => apply({ [dateRange.to]: v })} placeholder="To" className="h-9 w-full lg:w-40" />
                </div>
            )}
            {children}
        </TableToolbar>
    );
}
