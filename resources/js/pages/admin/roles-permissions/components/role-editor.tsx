import { router } from '@inertiajs/react';
import { ChevronDown, Copy, Loader2, Lock, MoreHorizontal, Pencil, Search, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ADMIN_LOCKED, fmtDate, groupByModule, matches, ROLES_URL, type Module, type Permission, type Role, type UserRow } from '../lib';
import { Coverage, CUSTOM_PILL, Pill, SYSTEM_PILL, UserAvatar } from './shared';

/* ---------------------------------------------------------------------------------------------- */
/* Role list                                                                                       */
/* ---------------------------------------------------------------------------------------------- */

export function RoleList({ roles, selectedId, total, onSelect }: { roles: Role[]; selectedId: number | null; total: number; onSelect: (role: Role) => void }) {
    const [query, setQuery] = React.useState('');
    const shown = roles.filter((r) => !query.trim() || r.name.toLowerCase().includes(query.trim().toLowerCase()));
    const groups: [string, Role[]][] = [
        ['Built-in roles', shown.filter((r) => r.isSystem)],
        ['Custom roles', shown.filter((r) => !r.isSystem)],
    ];

    return (
        <aside className="flex min-h-0 flex-col rounded-xl border bg-card shadow-sm">
            <div className="border-b p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a role" className="h-9 pl-8" aria-label="Find a role" />
                </div>
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Roles">
                {groups.map(
                    ([title, items]) =>
                        items.length > 0 && (
                            <div key={title} className="mb-2">
                                <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</p>
                                <ul className="space-y-0.5">
                                    {items.map((role) => {
                                        const active = role.id === selectedId;
                                        return (
                                            <li key={role.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => onSelect(role)}
                                                    aria-current={active ? 'true' : undefined}
                                                    className={cn(
                                                        'w-full rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                        active ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/60',
                                                    )}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className={cn('truncate text-sm', active ? 'font-semibold text-foreground' : 'font-medium')}>{role.name}</span>
                                                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                                                            <Users className="size-3" />
                                                            {role.usersCount}
                                                        </span>
                                                    </div>
                                                    <div className="mt-1.5 flex items-center gap-2">
                                                        <Coverage value={role.permissions.length} total={total} />
                                                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                                                            {role.permissions.length}/{total}
                                                        </span>
                                                    </div>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ),
                )}
                {shown.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">No role matches “{query}”.</p>}
            </nav>
        </aside>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Role editor                                                                                     */
/* ---------------------------------------------------------------------------------------------- */

type EditorProps = {
    role: Role;
    modules: Module[];
    permissions: Permission[];
    users: UserRow[];
    currentUserId: number | null;
    currentUserRole: string | null;
    onDirtyChange: (dirty: boolean) => void;
    onEditDetails: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onAddMembers: () => void;
};

export function RoleEditor({ role, modules, permissions, users, currentUserId, currentUserRole, onDirtyChange, onEditDetails, onDuplicate, onDelete, onAddMembers }: EditorProps) {
    const [view, setView] = React.useState<'permissions' | 'members'>('permissions');
    const [draft, setDraft] = React.useState<Set<string>>(() => new Set(role.permissions));
    const [query, setQuery] = React.useState('');
    const [grantedOnly, setGrantedOnly] = React.useState(false);
    const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const original = React.useMemo(() => new Set(role.permissions), [role.permissions]);
    const added = [...draft].filter((p) => !original.has(p));
    const removed = [...original].filter((p) => !draft.has(p));
    const dirty = added.length + removed.length > 0;

    React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

    // A role that grants access administration to the Admin role or to yourself keeps it.
    const protectsAccess = role.isAdmin || role.name === currentUserRole;
    const isLocked = (key: string) => protectsAccess && ADMIN_LOCKED.includes(key) && original.has(key);

    const toggle = (key: string, on: boolean) => {
        if (isLocked(key)) return;
        setDraft((prev) => {
            const next = new Set(prev);
            if (on) next.add(key);
            else next.delete(key);
            return next;
        });
    };
    const toggleMany = (keys: string[], on: boolean) => keys.forEach((k) => toggle(k, on));

    const visible = permissions.filter((p) => matches(p, query) && (!grantedOnly || draft.has(p.key)));
    const groups = groupByModule(modules, visible);
    const members = users.filter((u) => u.role === role.name);

    const save = () => {
        setSaving(true);
        setError(null);
        router.put(
            `${ROLES_URL}/${role.id}`,
            { name: role.name, description: role.customDescription, permissions: [...draft] },
            {
                preserveScroll: true,
                preserveState: true,
                onError: (errs) => setError(Object.values(errs)[0] ?? 'Could not save this role.'),
                onFinish: () => setSaving(false),
            },
        );
    };

    return (
        <section className="flex min-w-0 flex-col rounded-xl border bg-card shadow-sm">
            {/* Header */}
            <header className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold tracking-tight">{role.name}</h2>
                        {role.isSystem ? (
                            <Pill className={SYSTEM_PILL} title="Referenced by the application — cannot be renamed or deleted.">
                                <Lock className="size-3" /> Built-in
                            </Pill>
                        ) : (
                            <Pill className={CUSTOM_PILL}>Custom</Pill>
                        )}
                    </div>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{role.description || 'No description yet.'}</p>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        {original.size} of {permissions.length} permissions · {role.usersCount} user{role.usersCount === 1 ? '' : 's'} · updated {fmtDate(role.updatedAt)}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onAddMembers}>
                        <UserPlus className="size-4" /> Assign users
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="size-8" aria-label={`More actions for ${role.name}`}>
                                <MoreHorizontal className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onSelect={onEditDetails}>
                                <Pencil className="size-4" /> {role.isSystem ? 'Edit description' : 'Rename & describe'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={onDuplicate}>
                                <Copy className="size-4" /> Duplicate role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" disabled={role.isSystem || role.usersCount > 0} onSelect={onDelete}>
                                <Trash2 className="size-4" /> Delete role
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* View switch */}
            <div className="flex items-center gap-1 border-b px-4" role="tablist">
                {(
                    [
                        ['permissions', 'Permissions', draft.size],
                        ['members', 'Members', members.length],
                    ] as const
                ).map(([key, label, count]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={view === key}
                        onClick={() => setView(key)}
                        className={cn(
                            '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                            view === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                    >
                        {label}
                        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{count}</span>
                    </button>
                ))}
            </div>

            {view === 'permissions' ? (
                <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="relative min-w-48 flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions" className="h-9 pl-8" aria-label="Search permissions" />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Switch checked={grantedOnly} onCheckedChange={setGrantedOnly} /> Granted only
                        </label>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCollapsed(collapsed.size > 0 ? new Set() : new Set(modules.map((m) => m.key)))}
                        >
                            {collapsed.size > 0 ? 'Expand all' : 'Collapse all'}
                        </Button>
                    </div>

                    {role.isAdmin && (
                        <p className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                            The Admin role always keeps user and access administration so the system can’t be locked out.
                        </p>
                    )}

                    <div className="space-y-3 px-4 pb-4">
                        {groups.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No permissions match.</p>}
                        {groups.map(({ module, items }) => {
                            const keys = items.map((p) => p.key);
                            const granted = keys.filter((k) => draft.has(k)).length;
                            const all = permissions.filter((p) => p.module === module.key);
                            const grantedAll = all.filter((p) => draft.has(p.key)).length;
                            const state = granted === 0 ? false : granted === keys.length ? true : 'indeterminate';
                            const isCollapsed = collapsed.has(module.key) && !query;
                            return (
                                <div key={module.key} className="overflow-hidden rounded-lg border">
                                    <div className="flex items-center gap-3 bg-muted/40 px-3 py-2.5">
                                        <Checkbox
                                            checked={state}
                                            onCheckedChange={(v) => toggleMany(keys, v === true)}
                                            aria-label={`Grant all ${module.label} permissions`}
                                        />
                                        <button
                                            type="button"
                                            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                                            onClick={() =>
                                                setCollapsed((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(module.key)) next.delete(module.key);
                                                    else next.add(module.key);
                                                    return next;
                                                })
                                            }
                                            aria-expanded={!isCollapsed}
                                        >
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold">{module.label}</span>
                                                <span className="block truncate text-xs text-muted-foreground">{module.description}</span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-2">
                                                <span className={cn('text-xs tabular-nums', grantedAll > 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                                                    {grantedAll}/{all.length}
                                                </span>
                                                <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
                                            </span>
                                        </button>
                                    </div>
                                    {!isCollapsed && (
                                        <ul className="divide-y">
                                            {items.map((p) => {
                                                const checked = draft.has(p.key);
                                                const locked = isLocked(p.key);
                                                const changed = checked !== original.has(p.key);
                                                return (
                                                    <li key={p.key}>
                                                        <label
                                                            className={cn(
                                                                'flex items-start gap-3 px-3 py-2.5 transition-colors',
                                                                locked ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/30',
                                                                changed && (checked ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : 'bg-rose-50/70 dark:bg-rose-950/20'),
                                                            )}
                                                        >
                                                            <Checkbox className="mt-0.5" checked={checked} disabled={locked} onCheckedChange={(v) => toggle(p.key, v === true)} />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="flex flex-wrap items-center gap-2">
                                                                    <span className="text-sm font-medium">{p.label}</span>
                                                                    {locked && <Lock className="size-3 text-muted-foreground" aria-label="Required" />}
                                                                    {changed && (
                                                                        <span className={cn('text-[10px] font-semibold uppercase', checked ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                                                                            {checked ? 'Adding' : 'Removing'}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
                                                            </span>
                                                            <code className="hidden shrink-0 pt-0.5 font-mono text-[11px] text-muted-foreground/80 md:block">{p.key}</code>
                                                        </label>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Save bar */}
                    {(dirty || error) && (
                        <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm">
                                {error ? (
                                    <span className="text-rose-600 dark:text-rose-400">{error}</span>
                                ) : (
                                    <>
                                        <span className="font-medium">Unsaved changes</span>
                                        <span className="ml-2 text-muted-foreground">
                                            {added.length > 0 && <span className="text-emerald-700 dark:text-emerald-400">+{added.length} granted</span>}
                                            {added.length > 0 && removed.length > 0 && ' · '}
                                            {removed.length > 0 && <span className="text-rose-700 dark:text-rose-400">−{removed.length} revoked</span>}
                                            {role.usersCount > 0 && ` · affects ${role.usersCount} user${role.usersCount === 1 ? '' : 's'}`}
                                        </span>
                                    </>
                                )}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={saving}
                                    onClick={() => {
                                        setDraft(new Set(role.permissions));
                                        setError(null);
                                    }}
                                >
                                    Discard
                                </Button>
                                <Button size="sm" onClick={save} disabled={saving || !dirty}>
                                    {saving && <Loader2 className="size-4 animate-spin" />} Save changes
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <Members members={members} currentUserId={currentUserId} onAdd={onAddMembers} />
            )}
        </section>
    );
}

function Members({ members, currentUserId, onAdd }: { members: UserRow[]; currentUserId: number | null; onAdd: () => void }) {
    if (members.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                <Users className="size-8 text-muted-foreground/50" />
                <div>
                    <p className="text-sm font-medium">No one holds this role</p>
                    <p className="text-xs text-muted-foreground">Assign users to give them these permissions.</p>
                </div>
                <Button size="sm" onClick={onAdd}>
                    <UserPlus className="size-4" /> Assign users
                </Button>
            </div>
        );
    }

    return (
        <ul className="divide-y">
            {members.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-4 py-2.5">
                    <UserAvatar user={u} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                            {u.name}
                            {u.id === currentUserId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                            {u.email}
                            {u.position && ` · ${u.position}`}
                        </p>
                    </div>
                    {u.directPermissions > 0 && (
                        <span className="hidden text-xs text-amber-700 sm:inline dark:text-amber-400" title="Extra permissions granted directly to this user (Admin › Users)">
                            +{u.directPermissions} direct
                        </span>
                    )}
                    <span className={cn('text-xs', u.status ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>{u.status ? 'Active' : 'Disabled'}</span>
                </li>
            ))}
        </ul>
    );
}
