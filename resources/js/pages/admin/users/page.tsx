import { Head, router, usePage } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import { Eye, KeyRound, MoreHorizontal, Pencil, Plus, Power, Trash2, UserCheck, Users as UsersIcon, UserX, Wifi } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import { FilterChips, ListTable, ServerPagination, TableCard, TableEmpty, TableSearch, TableToolbar } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { RbacUserDialog, RoleBadge, StatusBadge, UserAvatar, UserFormDialog, ViewUserDialog } from './components';
import type { Module, PermissionInfo, RoleOption, UserFilters, UserRow, UserSummary } from './lib';
import { fmtDate, fmtLastSeen, isOnline, USERS_URL } from './lib';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Administration', href: USERS_URL },
    { title: 'Users', href: USERS_URL },
];

type Props = {
    users: UserRow[];
    totalUsers: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    filters: UserFilters;
    summary: UserSummary;
    currentUserId: number | null;
    canDelete: boolean;
    roles: RoleOption[];
    permissions: PermissionInfo[];
    modules: Module[];
};

type Query = { page?: number; per_page?: number; search?: string; role?: string | null; status?: string | null; sort?: string | null };

const ALL = 'all';
const RELOAD = ['users', 'totalUsers', 'pageSize', 'currentPage', 'search', 'filters', 'summary'];

export default function Users({ users, totalUsers, pageSize, currentPage, search = '', filters, summary, currentUserId, canDelete, roles, permissions, modules }: Props) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [loading, setLoading] = React.useState(false);
    const [selectedId, setSelectedId] = React.useState<number | null>(null);
    const [dialog, setDialog] = React.useState<'view' | 'form' | 'access' | null>(null);
    const [formUser, setFormUser] = React.useState<UserRow | null>(null);
    const [confirmUser, setConfirmUser] = React.useState<UserRow | null>(null);
    const [pendingStatus, setPendingStatus] = React.useState<number | null>(null);
    const [deleteUser, setDeleteUser] = React.useState<UserRow | null>(null);

    const catalog = { roles, permissions, modules };
    // Keep the open dialog in sync with fresh server data after saves
    const selected = users.find((u) => u.id === selectedId) ?? null;

    const apply = (next: Query) => {
        const merged: Query = { search, role: filters.role, status: filters.status, sort: filters.sort, per_page: pageSize, page: 1, ...next };
        const params = Object.fromEntries(Object.entries(merged).filter(([k, v]) => v !== null && v !== undefined && v !== '' && !(k === 'sort' && v === 'newest')));
        router.get(USERS_URL, params, { preserveState: true, preserveScroll: true, replace: true, only: RELOAD, onStart: () => setLoading(true), onFinish: () => setLoading(false) });
    };

    const open = (kind: 'view' | 'access', user: UserRow) => {
        setSelectedId(user.id);
        setDialog(kind);
    };
    const openForm = (user: UserRow | null) => {
        setFormUser(user);
        setDialog('form');
    };

    const setStatus = (user: UserRow, status: boolean) => {
        setPendingStatus(user.id);
        router.patch(`${USERS_URL}/${user.id}/status`, { status }, {
            preserveScroll: true,
            preserveState: true,
            only: [...RELOAD, 'flash', 'errors'],
            onError: (errs) => toast.error(errs.status ?? 'Could not change the account status.'),
            onFinish: () => setPendingStatus(null),
        });
    };
    // Disabling locks someone out, so confirm it; enabling is instant
    const toggleStatus = (user: UserRow) => (user.status !== false ? setConfirmUser(user) : setStatus(user, true));

    const destroy = (user: UserRow) =>
        router.delete(`${USERS_URL}/${user.id}`, {
            preserveScroll: true,
            preserveState: true,
            only: [...RELOAD, 'flash', 'errors'],
            onSuccess: () => selectedId === user.id && setDialog(null),
            onError: (errs) => toast.error(errs.user ?? 'Could not delete the user.'),
        });

    const anyFilter = Boolean(search || filters.role || filters.status);
    const clearAll = () => {
        apply({ search: '', role: null, status: null });
    };

    const from = totalUsers === 0 ? null : (currentPage - 1) * pageSize + 1;
    const to = totalUsers === 0 ? null : Math.min(currentPage * pageSize, totalUsers);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Users" />
            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <Heading title="Users" description="Who can sign in, what role they hold, and whether their account is active." />
                    <Button onClick={() => openForm(null)} className="shrink-0">
                        <Plus className="size-4" /> Create user
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat icon={UsersIcon} label="Total users" value={summary.total} hint={filters.status ? 'Click to show all' : undefined} onClick={() => apply({ status: null })} />
                    <Stat icon={UserCheck} label="Active" value={summary.active} tone="emerald" active={filters.status === 'active'} onClick={() => apply({ status: filters.status === 'active' ? null : 'active' })} />
                    <Stat icon={UserX} label="Disabled" value={summary.disabled} tone="rose" active={filters.status === 'disabled'} onClick={() => apply({ status: filters.status === 'disabled' ? null : 'disabled' })} />
                    <Stat icon={Wifi} label="Online now" value={summary.online} tone="emerald" hint="Active in the last 5 min" />
                </div>

                <TableCard>
                    <TableToolbar
                        loading={loading}
                        below={
                            <FilterChips
                                chips={[
                                    ...(search ? [{ key: 'search', label: `“${search}”`, onRemove: () => apply({ search: '' }) }] : []),
                                    ...(filters.role ? [{ key: 'role', label: filters.role === 'none' ? 'No role' : filters.role, onRemove: () => apply({ role: null }) }] : []),
                                    ...(filters.status ? [{ key: 'status', label: filters.status === 'active' ? 'Active' : 'Disabled', onRemove: () => apply({ status: null }) }] : []),
                                ]}
                                onClearAll={clearAll}
                            />
                        }
                    >
                        <TableSearch value={search} onSearch={(value) => apply({ search: value })} placeholder="Search name, username, email, position" className="lg:w-80" />
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                            <Select value={filters.role ?? ALL} onValueChange={(v) => apply({ role: v === ALL ? null : v })}>
                                <SelectTrigger className={cn('h-9 w-full sm:w-48', filters.role && 'border-primary/50')} aria-label="Filter by role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All roles</SelectItem>
                                    {roles.map((r) => (
                                        <SelectItem key={r.name} value={r.name}>
                                            {r.name} <span className="text-muted-foreground">({r.usersCount})</span>
                                        </SelectItem>
                                    ))}
                                    <SelectItem value="none">No role</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={filters.sort} onValueChange={(v) => apply({ sort: v })}>
                                <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Sort">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="newest">Newest first</SelectItem>
                                    <SelectItem value="oldest">Oldest first</SelectItem>
                                    <SelectItem value="name">Name A–Z</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </TableToolbar>

                    <ListTable
                        rows={users}
                        rowKey={(user) => user.id}
                        sequenceStart={from ?? 1}
                        loading={loading}
                        onRowClick={(user) => open('view', user)}
                        rowClassName={(user) => (user.status === false ? 'bg-muted/20' : undefined)}
                        rowAccent={(user) => (user.status === false ? 'bg-muted-foreground/50' : 'bg-primary')}
                        actions={(user) => <RowActions user={user} self={user.id === currentUserId} onView={() => open('view', user)} onEdit={() => openForm(user)} onAccess={() => open('access', user)} onToggle={() => toggleStatus(user)} onDelete={canDelete ? () => setDeleteUser(user) : undefined} />}
                        columns={[
                            {
                                id: 'user',
                                header: 'User',
                                cell: (user) => {
                                    const active = user.status !== false;
                                    return (
                                        <div className="flex items-center gap-3">
                                            <UserAvatar user={user} showPresence className={cn(!active && 'opacity-60 grayscale')} />
                                            <div className="min-w-0">
                                                <p className={cn('flex items-center gap-1.5 truncate font-medium', !active && 'text-muted-foreground')}>
                                                    <span className="truncate">{user.name}</span>
                                                    {user.id === currentUserId && <YouTag />}
                                                </p>
                                                {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                                            </div>
                                        </div>
                                    );
                                },
                            },
                            {
                                id: 'username',
                                header: 'Username',
                                className: 'max-w-44 truncate font-mono text-sm',
                                cell: (user) => user.username || <span className="font-sans text-muted-foreground">—</span>,
                            },
                            {
                                id: 'role',
                                header: 'Role',
                                className: 'max-w-44',
                                cell: (user) => (
                                    <>
                                        <RoleBadge role={user.roles?.[0]} />
                                        {extraCount(user, roles) > 0 && <span className="mt-1 block text-[11px] text-amber-700 dark:text-amber-400">+{extraCount(user, roles)} extra</span>}
                                    </>
                                ),
                            },
                            { id: 'position', header: 'Position', minScreen: 'lg', className: 'max-w-48 truncate text-muted-foreground', cell: (user) => user.position || '—' },
                            {
                                id: 'status',
                                header: 'Status',
                                cell: (user) => {
                                    const active = user.status !== false;
                                    const self = user.id === currentUserId;
                                    return (
                                        <div className="flex items-center gap-2.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                            <Switch
                                                checked={active}
                                                disabled={self || pendingStatus === user.id}
                                                onCheckedChange={() => toggleStatus(user)}
                                                aria-label={active ? `Disable ${user.name}` : `Enable ${user.name}`}
                                                title={self ? 'You cannot disable your own account' : undefined}
                                            />
                                            <StatusBadge active={active} className="hidden sm:inline-flex" />
                                        </div>
                                    );
                                },
                            },
                            {
                                id: 'last_seen',
                                header: 'Last active',
                                minScreen: 'xl',
                                cell: (user) => (
                                    <span className={cn('text-xs whitespace-nowrap', isOnline(user) ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')} title={user.last_seen_at ?? undefined}>
                                        {fmtLastSeen(user.last_seen_at)}
                                    </span>
                                ),
                            },
                            {
                                id: 'created_at',
                                header: 'Created at',
                                minScreen: 'lg',
                                className: 'text-xs whitespace-nowrap text-muted-foreground',
                                cell: (user) => <span title={user.created_at ?? undefined}>{fmtDate(user.created_at)}</span>,
                            },
                            {
                                id: 'updated_at',
                                header: 'Updated at',
                                minScreen: 'lg',
                                className: 'text-xs whitespace-nowrap text-muted-foreground',
                                cell: (user) => <span title={user.updated_at ?? undefined}>{fmtDate(user.updated_at)}</span>,
                            },
                        ]}
                        mobileRow={(user) => (
                            <div className="flex items-start gap-3">
                                <UserAvatar user={user} showPresence className={cn(user.status === false && 'opacity-60 grayscale')} />
                                <div className="min-w-0 flex-1 space-y-1">
                                    <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                                        <span className="truncate">{user.name}</span>
                                        {user.id === currentUserId && <YouTag />}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        @{user.username}
                                        {user.position && ` · ${user.position}`}
                                    </span>
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        <RoleBadge role={user.roles?.[0]} />
                                        <StatusBadge active={user.status !== false} />
                                    </span>
                                </div>
                            </div>
                        )}
                        empty={
                            <TableEmpty
                                icon={UsersIcon}
                                title={anyFilter ? 'No users match these filters' : 'No users yet'}
                                description={anyFilter ? 'Try a different search or clear the filters.' : 'Create the first account to let someone sign in.'}
                                action={
                                    anyFilter ? (
                                        <Button size="sm" variant="outline" onClick={clearAll}>
                                            Clear filters
                                        </Button>
                                    ) : (
                                        <Button size="sm" onClick={() => openForm(null)}>
                                            <Plus className="size-4" /> Create user
                                        </Button>
                                    )
                                }
                            />
                        }
                    />

                    <ServerPagination
                        page={currentPage}
                        lastPage={Math.max(1, Math.ceil(totalUsers / pageSize))}
                        perPage={pageSize}
                        total={totalUsers}
                        from={from}
                        to={to}
                        disabled={loading}
                        onPage={(page) => apply({ page })}
                        onPerPage={(per_page) => apply({ per_page })}
                    />
                </TableCard>
            </div>

            <ViewUserDialog
                open={dialog === 'view' && !!selected}
                onOpenChange={(o) => !o && setDialog(null)}
                user={selected}
                isSelf={selected?.id === currentUserId}
                onEdit={(u) => openForm(u)}
                onAccess={(u) => open('access', u)}
                onToggleStatus={toggleStatus}
                {...catalog}
            />
            <UserFormDialog open={dialog === 'form'} onOpenChange={(o) => !o && setDialog(null)} user={formUser} errors={errors} {...catalog} />
            <RbacUserDialog open={dialog === 'access' && !!selected} onOpenChange={(o) => !o && setDialog(null)} user={selected} {...catalog} />
            <ConfirmDialog
                open={confirmUser !== null}
                onOpenChange={(o) => !o && setConfirmUser(null)}
                title={`Disable ${confirmUser?.name ?? 'user'}?`}
                description="They will no longer be able to sign in. Their records and history are kept, and you can enable the account again at any time."
                confirmLabel="Disable account"
                variant="destructive"
                onConfirm={() => confirmUser && setStatus(confirmUser, false)}
            />
            <ConfirmDialog
                open={deleteUser !== null}
                onOpenChange={(o) => !o && setDeleteUser(null)}
                title={`Delete ${deleteUser?.name ?? 'user'}?`}
                description="The account is removed permanently and they can no longer sign in. Records they filed or approved are kept, and a linked employee stays in the directory without a login. To keep the account, disable it instead."
                confirmLabel="Delete user"
                variant="destructive"
                onConfirm={() => deleteUser && destroy(deleteUser)}
            />
        </AppLayout>
    );
}

function YouTag() {
    return <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">You</span>;
}

function extraCount(user: UserRow, roles: RoleOption[]): number {
    const fromRole = new Set(roles.find((r) => r.name === user.roles?.[0])?.permissions ?? []);
    return (user.permissions ?? []).filter((p) => !fromRole.has(p)).length;
}

function RowActions({ user, self, onView, onEdit, onAccess, onToggle, onDelete }: { user: UserRow; self: boolean; onView: () => void; onEdit: () => void; onAccess: () => void; onToggle: () => void; onDelete?: () => void }) {
    const active = user.status !== false;
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${user.name}`}>
                    <MoreHorizontal className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem onSelect={onView}>
                    <Eye className="size-4" /> View details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onEdit}>
                    <Pencil className="size-4" /> Edit profile
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onAccess}>
                    <KeyRound className="size-4" /> Manage access
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onToggle} disabled={self} variant={active ? 'destructive' : 'default'}>
                    <Power className="size-4" /> {active ? 'Disable account' : 'Enable account'}
                </DropdownMenuItem>
                {onDelete && (
                    <DropdownMenuItem onSelect={onDelete} disabled={self} variant="destructive">
                        <Trash2 className="size-4" /> Delete user
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

const STAT_TONE = {
    default: { icon: 'bg-primary/10 text-primary', ring: 'ring-primary/40 border-primary' },
    emerald: { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/30 border-emerald-500' },
    rose: { icon: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', ring: 'ring-rose-500/30 border-rose-500' },
} as const;

function Stat({ icon: Icon, label, value, hint, tone = 'default', active, onClick }: { icon: LucideIcon; label: string; value: number; hint?: string; tone?: keyof typeof STAT_TONE; active?: boolean; onClick?: () => void }) {
    const t = STAT_TONE[tone];
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            aria-pressed={onClick ? active : undefined}
            className={cn(
                'rounded-xl border bg-card p-3.5 text-left shadow-sm transition-all',
                onClick && 'hover:border-foreground/20 hover:shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                onClick && active && cn('ring-2', t.ring),
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
                <span className={cn('rounded-md p-1', t.icon)}>
                    <Icon className="size-3.5" />
                </span>
            </div>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </Tag>
    );
}
