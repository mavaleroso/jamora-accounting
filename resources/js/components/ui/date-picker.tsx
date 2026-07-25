'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_FROM_YEAR = 1900;
const DEFAULT_TO_YEAR = new Date().getFullYear() + 10;

type DatePickerProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    id?: string;
    disabled?: boolean;
    fromYear?: number;
    toYear?: number;
};

export function DatePicker({
    value,
    onChange,
    placeholder = 'Pick a date',
    className,
    id,
    disabled,
    fromYear = DEFAULT_FROM_YEAR,
    toYear = DEFAULT_TO_YEAR,
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false);
    const date = value ? new Date(value) : undefined;

    const handleSelect = (d: Date | undefined) => {
        if (!d) return;
        onChange(format(d, 'yyyy-MM-dd'));
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                        'w-full justify-start text-left font-normal px-2',
                        !date && 'text-muted-foreground',
                        className,
                    )}
                >
                    <span className="flex w-full items-center gap-2">
                        <CalendarIcon className="size-4" />
                        <span className="flex-1 truncate">
                            {date ? format(date, 'MMM d, yyyy') : placeholder}
                        </span>
                        {!disabled && date && (
                            <button
                                type="button"
                                className="inline-flex size-6 items-center justify-center  text-muted-foreground hover:border-slate-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange('');
                                }}
                                aria-label="Clear date"
                            >
                                <X className="size-3.5" />
                            </button>
                        )}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleSelect}
                    defaultMonth={date}
                    captionLayout="dropdown"
                    fromYear={fromYear}
                    toYear={toYear}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
}
