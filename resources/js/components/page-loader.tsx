import { APP_BRAND } from '@/lib/entities';
import { cn } from '@/lib/utils';
import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';

/** Loads faster than this never show the loader, so quick and prefetched pages do not flash. */
const SHOW_AFTER_MS = 150;

type Visit = {
    url: URL;
    method: string;
    prefetch?: boolean;
    async?: boolean;
    preserveState?: unknown;
    only?: string[];
    except?: string[];
};

/**
 * Only a move to another page counts. Filters, pagination, partial reloads, background requests and form posts
 * stay on the same page, where covering the screen would get in the way; the progress bar covers those.
 */
function isPageLoad(visit: Visit): boolean {
    if (visit.prefetch || visit.async || visit.method.toLowerCase() !== 'get') return false;
    if (visit.preserveState === true || visit.only?.length || visit.except?.length) return false;

    return visit.url.pathname !== window.location.pathname;
}

/**
 * Full-screen loader while the next page is fetched: the current page blurs behind the brand mark inside a
 * spinning ring. Mounted once, next to the app.
 */
export function PageLoader() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        // A second click cancels the first visit, whose finish must not hide the loader for the new one.
        let loading: unknown = null;

        const stopStart = router.on('start', (event) => {
            clearTimeout(timer);
            loading = event.detail.visit;
            if (isPageLoad(event.detail.visit as Visit)) {
                timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
            } else {
                setVisible(false);
            }
        });
        const stopFinish = router.on('finish', (event) => {
            if (event.detail.visit !== loading) return;
            clearTimeout(timer);
            setVisible(false);
        });

        return () => {
            clearTimeout(timer);
            stopStart();
            stopFinish();
        };
    }, []);

    return (
        <div
            role="status"
            aria-live="polite"
            aria-hidden={!visible}
            className={cn(
                'bg-background/50 fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm transition-opacity duration-200 print:hidden',
                visible ? 'cursor-progress opacity-100' : 'pointer-events-none opacity-0',
            )}
        >
            <div className={cn('flex flex-col items-center gap-4 transition-transform duration-300 ease-out', visible ? 'scale-100' : 'scale-90')}>
                <div className="relative flex size-20 items-center justify-center">
                    <span className="border-primary/15 absolute inset-0 rounded-full border-[3px]" />
                    {visible && (
                        <>
                            <span className="border-t-primary absolute inset-0 rounded-full border-[3px] border-transparent motion-safe:animate-spin" />
                            <span className="bg-primary/10 absolute inset-2 rounded-full motion-safe:animate-ping" />
                        </>
                    )}
                    <span className="bg-card relative flex size-12 items-center justify-center rounded-full shadow-md">
                        <APP_BRAND.logo className="size-7" />
                    </span>
                </div>
                <p className="text-foreground/80 text-sm font-medium tracking-wide">{visible ? 'Loading…' : ''}</p>
            </div>
        </div>
    );
}
