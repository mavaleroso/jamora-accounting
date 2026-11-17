import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { overviewNavItem, useNavGroups } from '@/hooks/use-nav-groups';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';
import { router } from '@inertiajs/react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const OPEN_EVENT = 'command-palette:open';

export const openCommandPalette = () => window.dispatchEvent(new Event(OPEN_EVENT));

type Entry = { title: string; group: string; url: string; icon: NavItem['icon'] };

const urlOf = (href: NavItem['href']) => (typeof href === 'string' ? href : href.url);

/** Every word typed must appear in the page or group name, in any order. */
function matches(entry: Entry, query: string): boolean {
    const haystack = `${entry.title} ${entry.group}`.toLowerCase();
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => haystack.includes(word));
}

/** Search box in the page header; opens the palette (as does Ctrl+K / ⌘K). */
export function CommandPaletteButton() {
    return (
        <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Search pages"
            className="text-muted-foreground hover:bg-accent hover:text-accent-foreground inline-flex h-8 shrink-0 items-center gap-2 rounded-md border px-2 text-xs transition-colors"
        >
            <Search className="size-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="bg-muted hidden rounded px-1 py-0.5 font-mono text-[10px] lg:inline">Ctrl K</kbd>
        </button>
    );
}

/** Jump to any page the signed-in user can open, by name. Mounted once in the app layout. */
export function CommandPalette() {
    const { groups, isEmployee } = useNavGroups();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen((v) => !v);
            }
        };
        const onOpen = () => setOpen(true);
        window.addEventListener('keydown', onKey);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener(OPEN_EVENT, onOpen);
        };
    }, []);

    const entries = useMemo<Entry[]>(() => {
        const pages = groups.flatMap((group) =>
            [...(group.hub ? [group.hub] : []), ...group.items].map((item) => ({
                title: item.title,
                group: group.title,
                url: urlOf(item.href),
                icon: item.icon,
            })),
        );
        const overview = isEmployee
            ? []
            : [{ title: overviewNavItem.title, group: 'Home', url: urlOf(overviewNavItem.href), icon: overviewNavItem.icon }];

        return [...overview, ...pages];
    }, [groups, isEmployee]);

    const results = query.trim() ? entries.filter((entry) => matches(entry, query)) : entries;
    const active = Math.min(index, Math.max(results.length - 1, 0));

    const change = (next: boolean) => {
        setOpen(next);
        if (!next) {
            setQuery('');
            setIndex(0);
        }
    };

    const go = (entry?: Entry) => {
        if (!entry) return;
        change(false);
        router.visit(entry.url);
    };

    const move = (step: number) => {
        if (results.length === 0) return;
        const next = (active + step + results.length) % results.length;
        setIndex(next);
        listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    };

    return (
        <Dialog open={open} onOpenChange={change}>
            <DialogContent className="top-4 translate-y-0 gap-0 overflow-hidden p-0 sm:top-[20%] sm:max-w-xl [&>button]:hidden">
                <DialogTitle className="sr-only">Search pages</DialogTitle>
                <DialogDescription className="sr-only">Type a page name, then press Enter to open it.</DialogDescription>
                <div className="flex items-center gap-2 border-b px-4">
                    <Search className="text-muted-foreground size-4 shrink-0" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIndex(0);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                move(1);
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                move(-1);
                            } else if (e.key === 'Enter') {
                                e.preventDefault();
                                go(results[active]);
                            }
                        }}
                        placeholder="Go to a page…"
                        aria-label="Search pages"
                        className="placeholder:text-muted-foreground h-12 w-full bg-transparent text-base outline-none md:text-sm"
                    />
                </div>
                {results.length === 0 ? (
                    <p className="text-muted-foreground px-4 py-8 text-center text-sm">No page matches “{query}”.</p>
                ) : (
                    <ul ref={listRef} role="listbox" className="max-h-[min(20rem,50dvh)] overflow-y-auto p-1.5">
                        {results.map((entry, i) => (
                            <li
                                key={`${entry.group}-${entry.url}`}
                                role="option"
                                aria-selected={i === active}
                                onMouseEnter={() => setIndex(i)}
                                onClick={() => go(entry)}
                                className={cn(
                                    'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm max-md:py-3',
                                    i === active && 'bg-accent text-accent-foreground',
                                )}
                            >
                                {entry.icon && <entry.icon className="size-4 shrink-0 opacity-70" />}
                                <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                                <span className="text-muted-foreground shrink-0 text-xs">{entry.group}</span>
                                {i === active && <CornerDownLeft className="text-muted-foreground size-3.5 shrink-0" />}
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
