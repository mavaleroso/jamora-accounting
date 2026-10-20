import { cn } from '@/lib/utils';
import type { SharedData, ViewMode } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

const OPTIONS: { mode: ViewMode; label: string; icon: LucideIcon; hint: string }[] = [
    { mode: 'admin', label: 'Admin', icon: ShieldCheck, hint: 'Every module you manage' },
    { mode: 'employee', label: 'Employee', icon: UserRound, hint: 'Your portal, attendance, requests, schedule and pay' },
];

/**
 * Admin | Employee: for an Admin who is also an employee, switches between running the system and using it as that
 * employee. Shown only to them.
 */
export function ViewModeSwitch({ className }: { className?: string }) {
    const { auth } = usePage<SharedData>().props;
    const [switching, setSwitching] = useState<ViewMode | null>(null);
    const current = auth.viewMode;
    if (!current) return null;

    const switchTo = (mode: ViewMode) => {
        if (mode === current || switching) return;
        setSwitching(mode);
        router.post('/view-mode', { mode }, { onFinish: () => setSwitching(null) });
    };

    return (
        <div role="group" aria-label="View as" className={cn('bg-muted inline-flex shrink-0 rounded-lg border p-0.5', className)}>
            {OPTIONS.map(({ mode, label, icon: Icon, hint }) => {
                const active = (switching ?? current) === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        aria-pressed={active}
                        title={`View as ${label.toLowerCase()}: ${hint}`}
                        disabled={!!switching}
                        onClick={() => switchTo(mode)}
                        className={cn(
                            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-wait',
                            active ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <Icon className="size-3.5" />
                        <span className="hidden sm:inline">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
