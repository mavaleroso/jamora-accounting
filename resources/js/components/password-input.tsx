import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

/** A password field with a button to show or hide what was typed. */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
    const [visible, setVisible] = React.useState(false);
    const Icon = visible ? EyeOff : Eye;

    return (
        <div className="relative">
            <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} />
            <button
                type="button"
                onClick={() => setVisible((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                tabIndex={-1}
            >
                <Icon className="size-4" aria-hidden />
            </button>
        </div>
    );
}
