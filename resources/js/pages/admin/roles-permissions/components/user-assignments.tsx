import { Link, router } from '@inertiajs/react';
import { AlertTriangle, Search, UserCog } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ROLES_URL, type Role, type UserRow } from '../lib';
import { MUTED_PILL, Pill, UserAvatar } from './shared';

/**
 * Who holds which role. Changing the role here replaces the user's current role
 * (direct per-user permissions are kept and managed in Admin › Users).
 */
export function UserAssignments({ users, roles, currentUserId }: { users: UserRow[]; roles: Role[]; currentUserId: number | null }) {
    const [query, setQuery] = React.useState('');
    const [roleFilter, setRoleFilter] = React.useState('all');
    const [statusFilter, setStatusFilter] = React.useState('all');
    const [pending, setPending] = React.useState<number | null>(null);

    const roleByName = new Map(roles.map((r) => [r.name, r]));
    const unassigned = users.filter((u) => !u.role).length;

    const rows = users.filter((u) => {
        const q = query.trim().toLowerCase();
        if (q && ![u.name, u.email, u.username, u.position].some((v) => v?.toLowerCase().includes(q))) return false;
        if (roleFilter === 'none' ? u.role : roleFilter !== 'all' && u.role !== roleFilter) return false;
        if (statusFilter !== 'all' && u.status !== (statusFilter === 'active')) return false;
        return true;
    });

    const changeRole = (user: UserRow, roleName: string) => {
        const role = roleByName.get(roleName);
        if (!role || roleName === user.role) return;
        setPending(user.id);
        router.post(`${ROLES_URL}/${role.id}/assign`, { user_ids: [user.id] }, { preserveScroll: true, preserveState: true, onFinish: () => setPending(null) });
    };

    return (
        <section className="rounded-xl border bg-card shadow-sm">
            <header className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, position" className="h-9 pl-8" aria-label="Search users" />
                    </div>
                    <Select value={roleFilter} onValueChange={setRoleFilter}>
                        <SelectTrigger className="h-9 w-full sm:w-48">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All roles</SelectItem>
                            {roles.map((r) => (
                                <SelectItem key={r.id} value={r.name}>
                                    {r.name}
                                </SelectItem>
                            ))}
                            <SelectItem value="none">No role</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="h-9 w-full sm:w-36">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Any status</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/users">
                        <UserCog className="size-4" /> Manage user accounts
                    </Link>
                </Button>
            </header>

            {unassigned > 0 && (
                <p className="flex items-center gap-2 border-b bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    {unassigned} user{unassigned === 1 ? ' has' : 's have'} no role and can only use permissions granted to them directly.
                </p>
            )}

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>User</TableHead>
                            <TableHead className="hidden md:table-cell">Position</TableHead>
                            <TableHead className="w-64">Role</TableHead>
                            <TableHead className="hidden sm:table-cell">Permissions</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-28 text-center text-muted-foreground">
                                    No users match these filters.
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map((u) => {
                            const self = u.id === currentUserId;
                            const role = u.role ? roleByName.get(u.role) : undefined;
                            return (
                                <TableRow key={u.id} className={cn(!u.status && 'text-muted-foreground')}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <UserAvatar user={u} />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">
                                                    {u.name}
                                                    {self && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                                                </p>
                                                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="hidden text-sm md:table-cell">{u.position ?? '—'}</TableCell>
                                    <TableCell>
                                        <Select value={u.role ?? ''} onValueChange={(v) => changeRole(u, v)} disabled={self || pending === u.id}>
                                            <SelectTrigger className="h-8 w-full" aria-label={`Role for ${u.name}`} title={self ? 'You cannot change your own role.' : undefined}>
                                                <SelectValue placeholder="No role" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {roles.map((r) => (
                                                    <SelectItem key={r.id} value={r.name}>
                                                        {r.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="hidden text-sm whitespace-nowrap sm:table-cell">
                                        <span className="tabular-nums">{role?.permissions.length ?? 0}</span>
                                        <span className="text-muted-foreground"> via role</span>
                                        {u.directPermissions > 0 && (
                                            <span className="ml-1.5 text-amber-700 dark:text-amber-400" title="Granted directly to this user in Admin › Users">
                                                +{u.directPermissions} direct
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {u.status ? (
                                            <Pill className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Active</Pill>
                                        ) : (
                                            <Pill className={MUTED_PILL}>Disabled</Pill>
                                        )}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
            <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                {rows.length} of {users.length} users. Each user holds one role; changing it takes effect on their next request.
            </p>
        </section>
    );
}
