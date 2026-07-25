'use client';

import { ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { Input } from './input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from './popover';

export type ComboboxOption = { id: number; name: string };

type ComboboxProps = {
    options: ComboboxOption[];
    value: number | '';
    onValueChange: (value: number | '') => void;
    placeholder?: string;
    disabled?: boolean;
    'aria-invalid'?: boolean;
    className?: string;
    /** Optional: get display label for value (default: options.find(o => o.id === value)?.name) */
    getOptionLabel?: (option: ComboboxOption) => string;
};

function defaultGetOptionLabel(option: ComboboxOption) {
    return option.name ?? `Category ${option.id}`;
}

export function Combobox({
    options,
    value,
    onValueChange,
    placeholder = 'Select…',
    disabled = false,
    'aria-invalid': ariaInvalid,
    className,
    getOptionLabel = defaultGetOptionLabel,
}: ComboboxProps) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const listRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const selectedOption = value !== '' ? options.find((o) => o.id === value) : null;
    const displayLabel = selectedOption ? getOptionLabel(selectedOption) : '';

    const searchLower = search.trim().toLowerCase();
    const filtered =
        searchLower === ''
            ? options
            : options.filter((o) => (o.name ?? '').toLowerCase().includes(searchLower));

    const handleSelect = (option: ComboboxOption) => {
        onValueChange(option.id);
        setSearch('');
        setOpen(false);
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (!next) setSearch('');
        if (next) setTimeout(() => inputRef.current?.focus(), 0);
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-invalid={ariaInvalid}
                    disabled={disabled}
                    className={cn(
                        'border-input data-placeholder:text-muted-foreground h-9 w-full justify-between font-normal shadow-xs',
                        !displayLabel && 'text-muted-foreground',
                        className
                    )}
                >
                    <span className="truncate">{displayLabel || placeholder}</span>
                    <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                <div className="flex flex-col gap-1 p-1">
                    <Input
                        ref={inputRef}
                        placeholder="Search…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                setOpen(false);
                            }
                        }}
                        className="h-8"
                    />
                    <div
                        ref={listRef}
                        className="max-h-[min(16rem,50vh)] overflow-auto rounded-md"
                        role="listbox"
                    >
                        {filtered.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                No results.
                            </div>
                        ) : (
                            filtered.map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    role="option"
                                    aria-selected={value === option.id}
                                    className={cn(
                                        'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                                        value === option.id && 'bg-accent'
                                    )}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleSelect(option)}
                                >
                                    {getOptionLabel(option)}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
