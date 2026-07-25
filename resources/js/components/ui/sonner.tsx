import { Toaster as Sonner } from 'sonner';
import type { ToasterProps } from 'sonner';

function Toaster({ ...props }: ToasterProps) {
    return (
        <Sonner
            theme="system"
            className="toaster group"
            toastOptions={{
                classNames: {
                    toast:
                        'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
                    description: 'group-[.toaster]:text-muted-foreground',
                    actionButton:
                        'group-[.toaster]:bg-primary group-[.toaster]:text-primary-foreground',
                    cancelButton:
                        'group-[.toaster]:bg-muted group-[.toaster]:text-muted-foreground',
                },
            }}
            {...props}
        />
    );
}

export { Toaster };
