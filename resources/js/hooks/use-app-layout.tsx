import { useCallback, useSyncExternalStore } from 'react';

export type AppLayoutMode = 'sidebar' | 'navbar';
export type ContentWidth = 'contained' | 'fluid';

type PreferenceStore<T extends string> = {
    read: () => T;
    write: (value: T) => void;
    subscribe: (notify: () => void) => () => void;
    initialize: () => void;
    fallback: T;
};

/**
 * A per-browser display preference backed by localStorage, with listeners so changing it re-renders every
 * subscriber immediately (no page reload) and other open tabs follow along.
 *
 * Only plain store objects are created here — the hooks below live at module level and reference the stores
 * as module constants. (The React Compiler outlines hook callbacks to module scope, which breaks hooks that
 * close over a factory's local variables.)
 */
function createPreferenceStore<T extends string>(key: string, values: readonly T[], fallback: T, datasetKey: string): PreferenceStore<T> {
    const listeners = new Set<() => void>();

    const read = (): T => {
        if (typeof window === 'undefined') return fallback;
        try {
            const saved = localStorage.getItem(key) as T | null;
            return saved && values.includes(saved) ? saved : fallback;
        } catch {
            return fallback;
        }
    };

    return {
        fallback,
        read,
        write(value: T) {
            try {
                localStorage.setItem(key, value);
            } catch {
                // Storage unavailable: the choice still applies for this session.
            }
            document.documentElement.dataset[datasetKey] = value;
            listeners.forEach((notify) => notify());
        },
        subscribe(notify: () => void) {
            listeners.add(notify);
            const onStorage = (e: StorageEvent) => e.key === key && notify();
            window.addEventListener('storage', onStorage);
            return () => {
                listeners.delete(notify);
                window.removeEventListener('storage', onStorage);
            };
        },
        // Exposed on <html> (data-layout / data-content-width) so CSS can react before React renders.
        initialize() {
            document.documentElement.dataset[datasetKey] = read();
        },
    };
}

const layoutStore = createPreferenceStore<AppLayoutMode>('app-layout', ['sidebar', 'navbar'], 'sidebar', 'layout');
const widthStore = createPreferenceStore<ContentWidth>('app-content-width', ['contained', 'fluid'], 'fluid', 'contentWidth');

export const readAppLayoutMode = (): AppLayoutMode => layoutStore.read();

/** Called once at boot. */
export function initializeAppLayout() {
    layoutStore.initialize();
    widthStore.initialize();
}

/** Sidebar vs top-navbar shell. */
export function useAppLayout() {
    const layout = useSyncExternalStore(layoutStore.subscribe, layoutStore.read, () => layoutStore.fallback);
    const updateLayout = useCallback((mode: AppLayoutMode) => layoutStore.write(mode), []);

    return { layout, updateLayout };
}

/** Contained (centred, max-width) vs fluid (full-width) page content. */
export function useContentWidth() {
    const contentWidth = useSyncExternalStore(widthStore.subscribe, widthStore.read, () => widthStore.fallback);
    const updateContentWidth = useCallback((width: ContentWidth) => widthStore.write(width), []);

    return { contentWidth, updateContentWidth };
}
