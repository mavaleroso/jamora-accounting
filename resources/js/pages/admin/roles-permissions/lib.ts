export const ROLES_URL = '/admin/roles';

export type Tab = 'roles' | 'matrix' | 'users' | 'permissions';

export type Module = { key: string; label: string; description: string };

export type Role = {
    id: number;
    name: string;
    description: string | null;
    customDescription: string | null;
    isSystem: boolean;
    isAdmin: boolean;
    permissions: string[];
    usersCount: number;
    updatedAt: string | null;
};

export type Permission = {
    id: number;
    key: string;
    label: string;
    description: string;
    module: string;
    builtin: boolean;
    roles: string[];
    rolesCount: number;
    usersCount: number;
};

export type UserRow = {
    id: number;
    name: string;
    username: string | null;
    email: string;
    position: string | null;
    status: boolean;
    avatarUrl: string | null;
    role: string | null;
    directPermissions: number;
};

/** Permissions the Admin role (and your own role) must keep — mirrors PermissionCatalog::ADMIN_LOCKED. */
export const ADMIN_LOCKED = ['admin.roles-permissions.manage', 'admin.users.manage'];

/** Permissions grouped by module, in module order; empty modules dropped. */
export function groupByModule(modules: Module[], permissions: Permission[]): { module: Module; items: Permission[] }[] {
    return modules
        .map((module) => ({ module, items: permissions.filter((p) => p.module === module.key) }))
        .filter((g) => g.items.length > 0);
}

export function matches(p: Permission, query: string): boolean {
    const q = query.trim().toLowerCase();
    return !q || p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
}

export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join('');
}

export function fmtDate(value: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Keep the current tab / role in the URL so a refresh or shared link lands in the same place. */
export function syncUrl(params: Record<string, string | number | null>) {
    try {
        const url = new URL(window.location.href);
        Object.entries(params).forEach(([k, v]) => (v === null ? url.searchParams.delete(k) : url.searchParams.set(k, String(v))));
        window.history.replaceState(window.history.state, '', url);
    } catch {
        /* ignore */
    }
}

export function readParam(key: string): string | null {
    try {
        return new URLSearchParams(window.location.search).get(key);
    } catch {
        return null;
    }
}
