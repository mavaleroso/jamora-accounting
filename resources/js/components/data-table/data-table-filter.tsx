import type { Table } from '@tanstack/react-table';
import { RotateCcwIcon, SearchIcon } from 'lucide-react';
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
        <div className="flex flex-wrap items-center gap-2">
            <Input
                placeholder={placeholder}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-9 w-[200px] lg:w-[240px]"
                aria-label="Search"
            />
            <Select
                value={effectiveSelectedColumnId}
                onValueChange={setSelectedColumnId}
            >
                <SelectTrigger className="h-9 w-[140px] lg:w-[160px]">
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
            <Button
                type="button"
                variant="secondary"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={handleSearch}
                aria-label="Search"
            >
                <SearchIcon className="size-4" />
            </Button>
            {hasActiveFilters && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={handleReset}
                    aria-label="Clear filters"
                    title="Clear filters"
                >
                    <RotateCcwIcon className="size-4" />
                </Button>
            )}
        </div>
    );
}
