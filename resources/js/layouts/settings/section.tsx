import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
    title: string;
    description?: ReactNode;
    icon?: LucideIcon;
    /** Shown at the right of the header, e.g. a status badge or a link. */
    action?: ReactNode;
    /** A strip under the content for the section's buttons. */
    footer?: ReactNode;
    tone?: 'default' | 'danger';
    className?: string;
    contentClassName?: string;
    children?: ReactNode;
};

/** A card on a settings page: header with icon, title and description, then the content and an optional footer. */
export function SettingsSection({ title, description, icon: Icon, action, footer, tone = 'default', className, contentClassName, children }: Props) {
    const danger = tone === 'danger';

    return (
        <section
            className={cn('bg-card text-card-foreground overflow-hidden rounded-xl border shadow-sm', danger && 'border-destructive/30', className)}
        >
            <header className={cn('flex items-start justify-between gap-4 border-b px-5 py-4', danger && 'border-destructive/20 bg-destructive/5')}>
                <div className="flex min-w-0 gap-3">
                    {Icon && (
                        <span
                            className={cn(
                                'bg-muted/40 text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
                                danger && 'border-destructive/30 bg-destructive/10 text-destructive',
                            )}
                        >
                            <Icon className="size-4" aria-hidden />
                        </span>
                    )}
                    <div className="min-w-0">
                        <h2 className={cn('text-base font-semibold', danger && 'text-destructive')}>{title}</h2>
                        {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </header>
            {children !== undefined && <div className={cn('px-5 py-5', contentClassName)}>{children}</div>}
            {footer && <footer className="bg-muted/30 flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3">{footer}</footer>}
        </section>
    );
}

/** A label / value pair in a details grid. Missing values show a dash. */
export function DetailItem({ label, children, mono, className }: { label: string; children?: ReactNode; mono?: boolean; className?: string }) {
    return (
        <div className={cn('min-w-0', className)}>
            <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</dt>
            <dd className={cn('mt-0.5 text-sm break-words', mono && 'font-mono')}>{children || <span className="text-muted-foreground">—</span>}</dd>
        </div>
    );
}
