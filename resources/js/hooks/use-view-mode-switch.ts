import type { ViewMode } from '@/types';
import { router } from '@inertiajs/react';
import { useState } from 'react';

/**
 * Switches an Admin who is also an employee between running the system (admin) and using it as that employee.
 * The server lands them on the right page for the new view.
 */
export function useViewModeSwitch() {
    const [switching, setSwitching] = useState(false);

    const switchTo = (mode: ViewMode) => {
        if (switching) return;
        setSwitching(true);
        // Pages fetched ahead for the other view carry its menu and its side of each page: drop them, before the
        // switch and again after it (a link hovered while it was in flight).
        router.flushAll();
        router.post(
            '/view-mode',
            { mode },
            {
                onSuccess: () => router.flushAll(),
                onFinish: () => setSwitching(false),
            },
        );
    };

    return { switchTo, switching };
}
