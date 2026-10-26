import type { User } from '@/types';

export const USERS_URL = '/admin/users';

export type UserRow = User & {
    avatar_url: string | null;
    /** Last request time from the session store; null when never seen (or sessions are not in the database). */
    last_seen_at: string | null;
};

export type RoleOption = {
    name: string;
    description: string | null;
    permissions: string[];
    usersCount: number;
};

export type Module = { key: string; label: string; description: string };

export type PermissionInfo = { key: string; label: string; description: string; module: string; builtin: boolean };

export type UserFilters = { role: string | null; status: 'active' | 'disabled' | null; sort: 'newest' | 'oldest' | 'name' };

export type UserSummary = { total: number; active: number; disabled: number; online: number };

/** Shared by the form, access and details dialogs. */
export type AccessCatalog = { roles: RoleOption[]; permissions: PermissionInfo[]; modules: Module[] };

export const ONLINE_MS = 5 * 60 * 1000;

export function isOnline(user: Pick<UserRow, 'last_seen_at'>): boolean {
    return Boolean(user.last_seen_at && Date.now() - new Date(user.last_seen_at).getTime() < ONLINE_MS);
}

export function initials(name: string | null | undefined): string {
    return (
        (name ?? '')
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]!.toUpperCase())
            .join('') || 'U'
    );
}

export function avatarSrc(user: Partial<UserRow> | null | undefined): string | undefined {
    if (!user) return undefined;
    if (user.avatar_url) return user.avatar_url;
    if (!user.avatar) return undefined;
    return user.avatar.startsWith('http') ? user.avatar : `/storage/${user.avatar}`;
}

export function fmtDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Online", "12 min ago", "3 days ago", or a date. */
export function fmtLastSeen(value: string | null | undefined): string {
    if (!value) return 'Never';
    const diff = (Date.now() - new Date(value).getTime()) / 1000;
    if (diff < ONLINE_MS / 1000) return 'Online';
    if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.round(diff / 3600)} hr ago`;
    if (diff < 86400 * 7) return `${Math.round(diff / 86400)} day${Math.round(diff / 86400) === 1 ? '' : 's'} ago`;
    return fmtDate(value);
}

/** Direct (extra) permissions only — anything the role already grants is dropped. */
export function extrasOnly(direct: string[] | undefined, rolePermissions: string[]): string[] {
    const fromRole = new Set(rolePermissions);
    return (direct ?? []).filter((p) => !fromRole.has(p));
}

export function rolePermissions(roles: RoleOption[], role: string | null | undefined): string[] {
    return roles.find((r) => r.name === role)?.permissions ?? [];
}

/** Random password that satisfies the default rules (mixed case, digits, symbol). */
export function generatePassword(length = 14): string {
    const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%&*?'];
    const all = sets.join('');
    const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
    const out = [...sets.map(pick), ...Array.from({ length: length - sets.length }, () => pick(all))];
    for (let i = out.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out.join('');
}
