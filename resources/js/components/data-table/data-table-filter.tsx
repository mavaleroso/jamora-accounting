import type { Table } from '@tanstack/react-table';
import { FilterIcon, RotateCcwIcon, SearchIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface DataTableFilterProps<TData> {
    table: Table<TData>;
    /** Column id -> display label for filterable columns */
    filterableColumns: Record<string, string>;
    placeholder?: string;
    /** Whether any column filter is active (passed from parent state so reset button visibility updates) */
    hasActiveFilters?: boolean;
    /** When using server-side search, current applied search from parent (keeps input in sync, e.g. after reset) */
    appliedSearchValue?: string;
    /** Optional controlled selected column id */
    selectedColumnId?: string;
    /** Optional controlled setter for selected column id */
    onSelectedColumnIdChange?: (columnId: string) => void;
    /** When using server-side search, called when user applies search (columnId, value) */
    onSearchApplied?: (columnId: string, value: string) => void;
    /** When using server-side search, called when user resets filters */
    onReset?: () => void;
}

export function DataTableFilter<TData>({
    table,
    filterableColumns,
    placeholder = 'Search...',
    hasActiveFilters = false,
    appliedSearchValue,
    selectedColumnId,
    onSelectedColumnIdChange,
    onSearchApplied,
    onReset,
}: DataTableFilterProps<TData>) {
    const columnIds = Object.keys(filterableColumns);
    const firstColumnId = columnIds[0] ?? '';

    const [searchValue, setSearchValue] = React.useState('');
    const [internalSelectedColumnId, setInternalSelectedColumnId] =
        React.useState<string>(firstColumnId);
    const effectiveSelectedColumnId =
        selectedColumnId ?? internalSelectedColumnId;
    const setSelectedColumnId =
        onSelectedColumnIdChange ?? setInternalSelectedColumnId;

    // Keep input in sync with parent's applied search (e.g. when reset clears it)
    React.useEffect(() => {
        if (appliedSearchValue !== undefined) {
            setSearchValue(appliedSearchValue);
        }
    }, [appliedSearchValue]);

    React.useEffect(() => {
        if (!effectiveSelectedColumnId || !columnIds.includes(effectiveSelectedColumnId)) {
            if (firstColumnId) {
                setSelectedColumnId(firstColumnId);
            }
        }
    }, [columnIds.join('|'), effectiveSelectedColumnId, firstColumnId, setSelectedColumnId]);

    const handleSearch = () => {
        if (onSearchApplied) {
            onSearchApplied(effectiveSelectedColumnId, searchValue.trim());
            return;
        }
        const column = table.getColumn(effectiveSelectedColumnId);
        if (column) {
            table.setColumnFilters((prev) => {
                const rest = prev.filter((f) => f.id !== effectiveSelectedColumnId);
                if (searchValue.trim() === '') {
                    return rest;
                }
                return [...rest, { id: effectiveSelectedColumnId, value: searchValue }];
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
    };

    const handleReset = () => {
        setSearchValue('');
        if (onReset) {
            onReset();
        } else {
            table.resetColumnFilters();
        }
    };

    return (
        <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
                <label htmlFor="data-table-search" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Search
                </label>
                <Input
                    id="data-table-search"
                    placeholder={placeholder}
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-10 w-[200px] border-border bg-background shadow-sm lg:w-[260px]"
                    aria-label="Search"
                />
            </div>
            {columnIds.length > 1 ? (
                <div className="space-y-1">
                    <label htmlFor="data-table-search-column" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Search in
                    </label>
                    <Select
                        value={effectiveSelectedColumnId}
                        onValueChange={setSelectedColumnId}
                    >
                        <SelectTrigger
                            id="data-table-search-column"
                            className="h-10 w-[140px] border-border bg-background shadow-sm lg:w-[170px]"
                        >
                            <SelectValue placeholder="Column" />
                        </SelectTrigger>
                        <SelectContent>
                            {columnIds.map((id) => (
                                <SelectItem key={id} value={id}>
                                    {filterableColumns[id]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            ) : null}
            <Button
                type="button"
                size="default"
                className="h-10 shrink-0 gap-1.5 px-4 shadow-sm"
                onClick={handleSearch}
                aria-label="Search"
            >
                <SearchIcon className="size-4" />
                Search
            </Button>
            {hasActiveFilters && (
                <Button
                    type="button"
                    variant="outline"
                    className="h-10 shrink-0 gap-1.5 border-border bg-background px-3 shadow-sm"
                    onClick={handleReset}
                    aria-label="Clear filters"
                    title="Clear filters"
                >
                    <RotateCcwIcon className="size-4" />
                    Clear
                </Button>
            )}
            {!hasActiveFilters ? (
                <span className="hidden items-center gap-1.5 pb-2 text-xs text-muted-foreground sm:inline-flex">
                    <FilterIcon className="size-3.5" />
                    Press Enter or Search
                </span>
            ) : null}
        </div>
    );
}
