'use client';

import * as React from 'react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'destructive';
    onConfirm: () => void;
    loading?: boolean;
};

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    loading = false,
}: ConfirmDialogProps) {
    const handleConfirm = () => {
        onConfirm();
        // Parent closes dialog (e.g. onSuccess) for async actions; close here only when not loading
        if (!loading) onOpenChange(false);
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>
                        {cancelLabel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleConfirm();
                        }}
                        disabled={loading}
                        className={cn(
                            variant === 'destructive' && buttonVariants({ variant: 'destructive' }),
                        )}
                    >
                        {loading ? 'Please wait…' : confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export type ConfirmOptions = {
    title: string;
    description: string;
    confirmLabel?: string;
    variant?: 'default' | 'destructive';
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

// Without a provider (e.g. an isolated render) fall back to the browser prompt.
const ConfirmContext = React.createContext<ConfirmFn>((o) => Promise.resolve(window.confirm(`${o.title}\n\n${o.description}`)));

/**
 * One shared confirmation dialog for the app. Pages ask with `await confirm({...})` before an
 * important action and continue only when it resolves true.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
    const resolver = React.useRef<((ok: boolean) => void) | null>(null);

    const settle = React.useCallback((ok: boolean) => {
        resolver.current?.(ok);
        resolver.current = null;
        setOptions(null);
    }, []);

    const confirm = React.useCallback<ConfirmFn>((next) => {
        resolver.current?.(false);
        setOptions(next);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <ConfirmDialog
                open={options !== null}
                onOpenChange={(open) => !open && settle(false)}
                title={options?.title ?? ''}
                description={options?.description ?? ''}
                confirmLabel={options?.confirmLabel}
                variant={options?.variant}
                onConfirm={() => settle(true)}
            />
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmFn {
    return React.useContext(ConfirmContext);
}
