import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { router } from '@inertiajs/react';
import { SearchIcon, XIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';

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
    children?: ReactNode;
};

const ALL = '__all';

/**
 * Server-side filter bar: search, selects and an optional date range, submitted as query params so filtered
 * views are bookmarkable and survive refresh. Selects apply immediately; search and dates apply on submit.
 */
export function FilterBar({ url, filters, searchPlaceholder = 'Search…', selects = [], dateRange, children }: FilterBarProps) {
    const initial = Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v == null || v === false ? '' : v === true ? '1' : String(v)]));
    const [values, setValues] = useState<Record<string, string>>(initial);
    const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

    const apply = (next: Record<string, string>) => {
        const query = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v !== ALL));
        router.get(url, query, { preserveState: true, preserveScroll: true, replace: true });
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        apply(values);
    };

    const active = Object.values(values).some((v) => v !== '');
    const reset = () => {
        const cleared = Object.fromEntries(Object.keys(values).map((k) => [k, '']));
        setValues(cleared);
        apply(cleared);
    };

    return (
        <form onSubmit={submit} className="bg-card flex flex-col gap-3 rounded-xl border p-3 shadow-xs lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative min-w-0 flex-1 lg:min-w-64">
                <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input value={values.search ?? ''} onChange={(e) => set('search', e.target.value)} placeholder={searchPlaceholder} className="pl-9" />
            </div>
            {selects.map((select) => (
                <Select
                    key={select.key}
                    value={values[select.key] || ALL}
                    onValueChange={(v) => {
                        const next = { ...values, [select.key]: v === ALL ? '' : v };
                        setValues(next);
                        apply(next);
                    }}
                >
                    <SelectTrigger className="w-full lg:w-44" aria-label={select.label}>
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
                    <DatePicker
                        value={values[dateRange.from] ?? ''}
                        onChange={(v) => set(dateRange.from, v)}
                        placeholder="From"
                        className="w-full lg:w-40"
                    />
                    <span className="text-muted-foreground text-xs">to</span>
                    <DatePicker
                        value={values[dateRange.to] ?? ''}
                        onChange={(v) => set(dateRange.to, v)}
                        placeholder="To"
                        className="w-full lg:w-40"
                    />
                </div>
            )}
            {children}
            <div className="flex gap-2">
                <Button type="submit">Apply</Button>
                {active && (
                    <Button type="button" variant="ghost" onClick={reset}>
                        <XIcon className="size-4" />
                        Clear
                    </Button>
                )}
            </div>
        </form>
    );
}
