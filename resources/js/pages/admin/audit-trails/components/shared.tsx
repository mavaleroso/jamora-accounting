import { FilePlus2, FileX2, LogIn, LogOut, PencilLine, RotateCcw, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuditEvent } from '@/types';

export const EVENT: Record<AuditEvent, { label: string; icon: LucideIcon; className: string; dot: string }> = {
    created: {
        label: 'Created',
        icon: FilePlus2,
        className: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
        dot: 'bg-emerald-500',
    },
    updated: {
        label: 'Updated',
        icon: PencilLine,
        className: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
        dot: 'bg-sky-500',
    },
    deleted: {
        label: 'Deleted',
        icon: FileX2,
        className: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300',
        dot: 'bg-rose-500',
    },
    restored: {
        label: 'Restored',
        icon: RotateCcw,
        className: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
        dot: 'bg-violet-500',
    },
    request: { label: 'Action', icon: Zap, className: 'border-border bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
    login: {
        label: 'Signed in',
        icon: LogIn,
        className: 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300',
        dot: 'bg-teal-500',
    },
    logout: { label: 'Signed out', icon: LogOut, className: 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300', dot: 'bg-slate-400' },
};

export function EventBadge({ event, className }: { event: AuditEvent; className?: string }) {
    const e = EVENT[event] ?? EVENT.request;
    const Icon = e.icon;
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', e.className, className)}>
            <Icon className="size-3" aria-hidden />
            {e.label}
        </span>
    );
}

export function fmtDateTime(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function fmtTime(value: string | null): string {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

/** "just now", "5 min ago", "3 hr ago"; falls back to the clock time after a day. */
export function fmtRelative(value: string | null, now = Date.now()): string {
    if (!value) return '—';
    const diff = Math.round((now - new Date(value).getTime()) / 1000);
    if (diff < 45) return 'just now';
    if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)} hr ago`;
    return fmtTime(value);
}

/** Local calendar day, used to group the timeline. */
export function dayKey(value: string | null): string {
    if (!value) return 'unknown';
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabel(key: string): string {
    if (key === 'unknown') return 'Unknown date';
    const today = dayKey(new Date().toISOString());
    const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
    const d = new Date(`${key}T00:00:00`);
    const long = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (key === today) return `Today · ${long}`;
    if (key === yesterday) return `Yesterday · ${long}`;
    return long;
}

export function initials(name: string | null | undefined): string {
    if (!name) return 'SY';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ''))).toUpperCase();
}

const AVATAR_TONES = [
    'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
    'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
];

export function UserAvatar({ id, name, className }: { id: number | null | undefined; name: string | null | undefined; className?: string }) {
    const tone = id ? AVATAR_TONES[id % AVATAR_TONES.length] : 'bg-muted text-muted-foreground';
    return (
        <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', tone, className)} aria-hidden>
            {id ? initials(name) : 'SYS'}
        </span>
    );
}

/** "Chrome on Windows" from a raw user-agent string. */
export function describeDevice(ua: string | null): string | null {
    if (!ua) return null;
    const browser = /Edg\//.test(ua)
        ? 'Edge'
        : /OPR\/|Opera/.test(ua)
          ? 'Opera'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Chrome\//.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : /curl|Guzzle|Symfony|PHP/i.test(ua)
                  ? 'Script'
                  : null;
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
    if (!browser && !os) return null;
    return [browser, os].filter(Boolean).join(' on ');
}

export function fmtValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map((v) => fmtValue(v)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

export type Change = { field: string; label: string; from: unknown; to: unknown };

function short(v: unknown) {
    const s = fmtValue(v).replace(/\s+/g, ' ');
    return s.length > 28 ? `${s.slice(0, 27)}…` : s;
}

/** Compact inline preview of the first changes, for the list. */
export function ChangePreview({ changes, event, fallback }: { changes: Change[]; event: AuditEvent; fallback?: string | null }) {
    if (changes.length === 0) return <span className="text-muted-foreground">{fallback || '—'}</span>;
    if (event === 'created' || event === 'deleted') {
        return (
            <span className="text-muted-foreground">
                {changes.length} field{changes.length === 1 ? '' : 's'} {event === 'created' ? 'set' : 'removed'}
                <span className="hidden xl:inline"> · {changes.slice(0, 3).map((c) => c.label).join(', ')}{changes.length > 3 ? '…' : ''}</span>
            </span>
        );
    }
    return (
        <span className="flex flex-wrap items-center gap-1">
            {changes.slice(0, 2).map((c) => (
                <span key={c.field} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-1.5 py-0.5">
                    <span className="font-medium text-foreground">{c.label}</span>
                    {c.from !== null && c.from !== undefined && <span className="truncate text-rose-600 line-through decoration-rose-400/60 dark:text-rose-400">{short(c.from)}</span>}
                    {c.from !== null && c.from !== undefined && c.to !== null && c.to !== undefined && <span className="text-muted-foreground">→</span>}
                    {c.to !== null && c.to !== undefined && <span className="truncate text-emerald-700 dark:text-emerald-400">{short(c.to)}</span>}
                </span>
            ))}
            {changes.length > 2 && <span className="text-muted-foreground">+{changes.length - 2} more</span>}
        </span>
    );
}

export type DiffPart = { text: string; kind: 'same' | 'added' | 'removed' };

/** Word-level diff (LCS) for short text; null when either side is too long to be worth it. */
export function wordDiff(before: string, after: string): DiffPart[] | null {
    const a = before.split(/(\s+)/);
    const b = after.split(/(\s+)/);
    if (a.length * b.length > 90000) return null;
    const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out: DiffPart[] = [];
    const push = (text: string, kind: DiffPart['kind']) => {
        const last = out[out.length - 1];
        if (last && last.kind === kind) last.text += text;
        else out.push({ text, kind });
    };
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            push(a[i], 'same');
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) push(a[i++], 'removed');
        else push(b[j++], 'added');
    }
    while (i < a.length) push(a[i++], 'removed');
    while (j < b.length) push(b[j++], 'added');
    return out;
}
