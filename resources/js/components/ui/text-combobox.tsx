'use client';

import { CheckIcon, ChevronDownIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type TextComboboxProps = {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    /** Suggestions shown in the list; the user can also keep their own text. */
    options: string[];
    placeholder?: string;
    disabled?: boolean;
    'aria-invalid'?: boolean;
    className?: string;
};

/**
 * A free-text field with a styled suggestion list (in place of the browser's native datalist):
 * type to filter, pick a suggestion, or keep what was typed. Arrow keys and Enter work.
 */
export function TextCombobox({ id, value, onValueChange, options, placeholder = 'Select or type…', disabled = false, 'aria-invalid': ariaInvalid, className }: TextComboboxProps) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [active, setActive] = React.useState(0);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const listRef = React.useRef<HTMLDivElement>(null);

    const typed = query.trim();
    const unique = Array.from(new Set(options.filter(Boolean)));
    const matches = typed === '' ? unique : unique.filter((o) => o.toLowerCase().includes(typed.toLowerCase()));
    const isNew = typed !== '' && !unique.some((o) => o.toLowerCase() === typed.toLowerCase());
    // The typed text comes first when it is new, so Enter keeps it.
    const items = isNew ? [typed, ...matches] : matches;

    const choose = (next: string) => {
        onValueChange(next);
        setOpen(false);
    };

    const handleOpenChange = (next: boolean) => {
        setOpen(next);
        if (next) {
            setQuery('');
            setActive(Math.max(0, unique.indexOf(value)));
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    };

    React.useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-invalid={ariaInvalid}
                    disabled={disabled}
                    className={cn('h-9 w-full justify-between border-input font-normal shadow-xs', !value && 'text-muted-foreground', className)}
                >
                    <span className="truncate">{value || placeholder}</span>
                    <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0" align="start">
                <div className="flex flex-col gap-1 p-1">
                    <Input
                        ref={inputRef}
                        placeholder="Search or type a new one…"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActive(0);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setActive((i) => Math.min(i + 1, items.length - 1));
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setActive((i) => Math.max(i - 1, 0));
                            } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (items[active] !== undefined) choose(items[active]);
                                else if (typed) choose(typed);
                            } else if (e.key === 'Escape') {
                                setOpen(false);
                            }
                        }}
                        className="h-8"
                        aria-label="Search or type"
                    />
                    <div ref={listRef} className="max-h-[min(16rem,50vh)] overflow-auto" role="listbox">
                        {items.length === 0 ? (
                            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Type to add one.</p>
                        ) : (
                            items.map((item, i) => {
                                const isTyped = isNew && i === 0;
                                const selected = !isTyped && item === value;
                                return (
                                    <button
                                        key={`${isTyped ? 'new' : 'opt'}-${item}`}
                                        type="button"
                                        role="option"
                                        data-index={i}
                                        aria-selected={selected}
                                        className={cn(
                                            'flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none select-none',
                                            i === active && 'bg-accent text-accent-foreground',
                                        )}
                                        onMouseEnter={() => setActive(i)}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => choose(item)}
                                    >
                                        {isTyped ? <PlusIcon className="size-4 shrink-0 opacity-60" /> : <CheckIcon className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />}
                                        <span className="truncate">{isTyped ? `Use “${item}”` : item}</span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    {value && (
                        <button
                            type="button"
                            className="rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            onClick={() => choose('')}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
