import { Head, router } from '@inertiajs/react';
import { KeyRound, Plus, ShieldCheck, Table2, Users } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { SegmentedControl, SegmentedControlItem, segmentedControlBadgeClass } from '@/components/ui/segmented-control';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { AccessMatrix } from './components/access-matrix';
import { AssignUsersDialog, RoleDialog, type RoleDialogMode } from './components/dialogs';
import { PermissionKeys } from './components/permission-keys';
import { RoleEditor, RoleList } from './components/role-editor';
import { UserAssignments } from './components/user-assignments';
import { readParam, ROLES_URL, syncUrl, type Module, type Permission, type Role, type Tab, type UserRow } from './lib';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Administration', href: '/admin/users' },
    { title: 'Roles & Permissions', href: ROLES_URL },
];

type Props = {
    tab: Tab;
    currentUserId: number | null;
    modules: Module[];
    roles: Role[];
    permissions: Permission[];
    users: UserRow[];
};

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'roles', label: 'Roles', icon: ShieldCheck },
    { key: 'matrix', label: 'Access matrix', icon: Table2 },
    { key: 'users', label: 'User assignments', icon: Users },
    { key: 'permissions', label: 'Permission keys', icon: KeyRound },
];

export default function RolesPermissionsPage({ tab: initialTab, currentUserId, modules, roles, permissions, users }: Props) {
    const [tab, setTabState] = React.useState<Tab>(initialTab);
    const [selectedId, setSelectedId] = React.useState<number | null>(() => {
        const fromUrl = Number(readParam('role'));
        return roles.some((r) => r.id === fromUrl) ? fromUrl : (roles[0]?.id ?? null);
    });
    const [dirty, setDirty] = React.useState(false);
    const [pendingRole, setPendingRole] = React.useState<Role | null>(null);
    const [roleDialog, setRoleDialog] = React.useState<RoleDialogMode | null>(null);
    const [assignRole, setAssignRole] = React.useState<Role | null>(null);
    const [deleteRole, setDeleteRole] = React.useState<Role | null>(null);

    // After create / delete the server redirects with ?role=…; follow it.
    React.useEffect(() => {
        const fromUrl = Number(readParam('role'));
        if (roles.some((r) => r.id === fromUrl)) setSelectedId(fromUrl);
        else if (!roles.some((r) => r.id === selectedId)) setSelectedId(roles[0]?.id ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roles]);

    // Warn before leaving the page with unsaved permission changes.
    React.useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [dirty]);

    const selected = roles.find((r) => r.id === selectedId) ?? null;
    const currentUserRole = users.find((u) => u.id === currentUserId)?.role ?? null;

    const setTab = (t: Tab) => {
        setTabState(t);
        syncUrl({ tab: t });
    };
    const selectRole = (role: Role, force = false) => {
        if (role.id === selectedId) return;
        if (dirty && !force) {
            setPendingRole(role);
            return;
        }
        setDirty(false);
        setSelectedId(role.id);
        syncUrl({ role: role.id });
    };
    const openRole = (role: Role) => {
        setTab('roles');
        selectRole(role);
    };

    const custom = roles.filter((r) => !r.isSystem).length;
    const activeUsers = users.filter((u) => u.status).length;
    const unassigned = users.filter((u) => !u.role).length;
    const directGrants = users.filter((u) => u.directPermissions > 0).length;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Roles & Permissions" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <Heading title="Roles & Permissions" description="Decide what each role can do and who holds it. Every user has one role; its permissions apply across all branches they can access." />
                    <Button onClick={() => setRoleDialog({ kind: 'create' })}>
                        <Plus className="size-4" /> New role
                    </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label="Roles" value={roles.length} hint={`${roles.length - custom} built-in · ${custom} custom`} />
                    <Stat label="Users" value={users.length} hint={`${activeUsers} active${unassigned ? ` · ${unassigned} without a role` : ''}`} warn={unassigned > 0} />
                    <Stat label="Permissions" value={permissions.length} hint={`Across ${new Set(permissions.map((p) => p.module)).size} modules`} />
                    <Stat label="Direct grants" value={directGrants} hint={directGrants ? 'Users with extra per-user permissions' : 'All access comes from roles'} />
                </div>

                <SegmentedControl aria-label="Roles and permissions views">
                    {TABS.map(({ key, label, icon: Icon }) => (
                        <SegmentedControlItem key={key} active={tab === key} onClick={() => setTab(key)}>
                            <Icon className="size-4" /> {label}
                            {key === 'users' && <span className={segmentedControlBadgeClass(tab === key)}>{users.length}</span>}
                        </SegmentedControlItem>
                    ))}
                </SegmentedControl>

                {tab === 'roles' && (
                    <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
                        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
                            <RoleList roles={roles} selectedId={selectedId} total={permissions.length} onSelect={(r) => selectRole(r)} />
                        </div>
                        {selected ? (
                            <RoleEditor
                                key={selected.id}
                                role={selected}
                                modules={modules}
                                permissions={permissions}
                                users={users}
                                currentUserId={currentUserId}
                                currentUserRole={currentUserRole}
                                onDirtyChange={setDirty}
                                onEditDetails={() => setRoleDialog({ kind: 'edit', role: selected })}
                                onDuplicate={() => setRoleDialog({ kind: 'create', from: selected })}
                                onDelete={() => setDeleteRole(selected)}
                                onAddMembers={() => setAssignRole(selected)}
                            />
                        ) : (
                            <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">Create a role to get started.</div>
                        )}
                    </div>
                )}

                {tab === 'matrix' && <AccessMatrix roles={roles} modules={modules} permissions={permissions} onOpenRole={openRole} />}
                {tab === 'users' && <UserAssignments users={users} roles={roles} currentUserId={currentUserId} />}
                {tab === 'permissions' && <PermissionKeys permissions={permissions} modules={modules} roles={roles} />}
            </div>

            <RoleDialog mode={roleDialog} roles={roles} onClose={() => setRoleDialog(null)} />
            <AssignUsersDialog role={assignRole} users={users} currentUserId={currentUserId} onClose={() => setAssignRole(null)} />
            <ConfirmDialog
                open={pendingRole !== null}
                onOpenChange={(o) => !o && setPendingRole(null)}
                title="Discard unsaved changes?"
                description={`Your permission changes to “${selected?.name}” haven’t been saved.`}
                confirmLabel="Discard changes"
                variant="destructive"
                onConfirm={() => pendingRole && selectRole(pendingRole, true)}
            />
            <ConfirmDialog
                open={deleteRole !== null}
                onOpenChange={(o) => !o && setDeleteRole(null)}
                title={`Delete “${deleteRole?.name}”?`}
                description="The role and its permission set are removed permanently. No users hold it."
                confirmLabel="Delete role"
                variant="destructive"
                onConfirm={() => deleteRole && router.delete(`${ROLES_URL}/${deleteRole.id}`, { preserveScroll: true })}
            />
        </AppLayout>
    );
}

function Stat({ label, value, hint, warn }: { label: string; value: number; hint: string; warn?: boolean }) {
    return (
        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            <p className={warn ? 'mt-0.5 text-[11px] text-amber-700 dark:text-amber-400' : 'mt-0.5 text-[11px] text-muted-foreground'}>{hint}</p>
        </div>
    );
}
