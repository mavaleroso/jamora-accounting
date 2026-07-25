import type { Auth } from '@/types';

export function hasPermission(auth: Auth | undefined | null, permission: string): boolean {
    if (!auth?.user) return false;
    const roles = Array.isArray(auth.user.roles) ? auth.user.roles : [];
    if (roles.includes('Admin')) return true;
    const permissions = Array.isArray(auth.user.permissions) ? auth.user.permissions : [];
    return permissions.includes(permission);
}

export function hasAnyPermission(auth: Auth | undefined | null, permissions: string[]): boolean {
    if (!auth?.user) return false;
    const roles = Array.isArray(auth.user.roles) ? auth.user.roles : [];
    if (roles.includes('Admin')) return true;
    const userPerms = Array.isArray(auth.user.permissions) ? auth.user.permissions : [];
    return permissions.some((permission) => userPerms.includes(permission));
}
