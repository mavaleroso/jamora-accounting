import { useViewModeSwitch } from '@/hooks/use-view-mode-switch';
import type { SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { UserRound } from 'lucide-react';

/** Reminds an Admin that they are in the employee view, with one click back to the admin view. */
export function EmployeeViewBanner() {
    const { auth } = usePage<SharedData>().props;
    const { switchTo, switching } = useViewModeSwitch();
    if (auth?.viewMode !== 'employee') return null;

    return (
        <div className="bg-primary/10 text-foreground flex items-center justify-center gap-2 border-b px-4 py-1.5 text-xs print:hidden">
            <UserRound className="size-3.5 shrink-0" />
            <span>You are in the employee view.</span>
            <button
                type="button"
                disabled={switching}
                onClick={() => switchTo('admin')}
                className="text-primary font-semibold underline-offset-2 hover:underline disabled:opacity-60"
            >
                Back to admin view
            </button>
        </div>
    );
}
