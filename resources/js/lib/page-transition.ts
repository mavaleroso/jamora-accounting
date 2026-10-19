import { router } from '@inertiajs/react';

type VisitOptions = NonNullable<Parameters<typeof router.visit>[1]>;

const reducedMotion = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/**
 * Default visit options: animate navigation to another page with the View Transitions API.
 *
 * Only plain GET visits to a different path animate. Filters, pagination, partial reloads and
 * form posts stay on the same page and swap instantly, so tables and open dialogs don't flash.
 * Inertia merges what this returns over the visit's own options, hence `{}` to leave a visit alone.
 */
export function pageTransitionOptions(href: string, options: VisitOptions): VisitOptions {
    if (options.viewTransition || reducedMotion?.matches || typeof document.startViewTransition !== 'function') {
        return {};
    }

    const method = (options.method ?? 'get').toLowerCase();

    if (method !== 'get' || options.preserveState || options.only?.length || options.except?.length) {
        return {};
    }

    const target = new URL(href, window.location.href);

    if (target.origin !== window.location.origin || target.pathname === window.location.pathname) {
        return {};
    }

    return { viewTransition: markPageTransition };
}

let current: ViewTransition | null = null;

/**
 * The class names the page content (see app.css) for as long as the transition runs. A quick second
 * click skips the running transition, so only the latest one may remove the class.
 */
function markPageTransition(transition: ViewTransition) {
    const root = document.documentElement;

    current = transition;
    root.classList.add('page-transition');
    transition.finished.finally(() => {
        if (current === transition) {
            current = null;
            root.classList.remove('page-transition');
        }
    });
}
