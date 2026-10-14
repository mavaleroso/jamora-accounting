import { useForm } from '@inertiajs/react';
import { Info, Loader2, Search } from 'lucide-react';
import * as React from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ROLES_URL, type Role, type UserRow } from '../lib';
import { UserAvatar } from './shared';

/* ---------------------------------------------------------------------------------------------- */
/* Create / rename / duplicate                                                                     */
/* ---------------------------------------------------------------------------------------------- */

export type RoleDialogMode = { kind: 'create'; from?: Role } | { kind: 'edit'; role: Role };

export function RoleDialog({ mode, roles, onClose }: { mode: RoleDialogMode | null; roles: Role[]; onClose: () => void }) {
    return (
        <Dialog open={mode !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">{mode && <RoleForm mode={mode} roles={roles} onDone={onClose} />}</DialogContent>
        </Dialog>
    );
}

function RoleForm({ mode, roles, onDone }: { mode: RoleDialogMode; roles: Role[]; onDone: () => void }) {
    const editing = mode.kind === 'edit' ? mode.role : null;
    const from = mode.kind === 'create' ? mode.from : undefined;
    const form = useForm({
        name: editing?.name ?? (from ? `${from.name} (copy)` : ''),
        description: editing?.customDescription ?? editing?.description ?? (from ? from.description ?? '' : ''),
        copy_from: from ? String(from.id) : 'none',
        permissions: editing?.permissions ?? [],
    });
    const { data, setData, errors, processing } = form;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editing) {
            form.transform((d) => ({ name: d.name.trim(), description: d.description.trim() || null, permissions: d.permissions }));
            form.put(`${ROLES_URL}/${editing.id}`, { preserveScroll: true, onSuccess: onDone });
        } else {
            form.transform((d) => ({ name: d.name.trim(), description: d.description.trim() || null, copy_from: d.copy_from === 'none' ? null : Number(d.copy_from) }));
            form.post(ROLES_URL, { preserveScroll: true, onSuccess: onDone });
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{editing ? (editing.isSystem ? `Describe ${editing.name}` : `Edit ${editing.name}`) : from ? `Duplicate ${from.name}` : 'New role'}</DialogTitle>
                <DialogDescription>
                    {editing
                        ? 'Permissions are edited on the role page.'
                        : 'Start from scratch or copy an existing role’s permissions, then fine-tune them.'}
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
                <Label htmlFor="role-name">Name</Label>
                <Input id="role-name" value={data.name} onChange={(e) => setData('name', e.target.value)} disabled={editing?.isSystem} placeholder="e.g. Branch Cashier" autoFocus required />
                {editing?.isSystem && <p className="text-[11px] text-muted-foreground">Built-in roles are referenced by the application and keep their name.</p>}
                <InputError message={errors.name} />
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="role-desc">Description</Label>
                <Textarea id="role-desc" rows={2} value={data.description} onChange={(e) => setData('description', e.target.value)} placeholder="What is this role for? Who should hold it?" />
                <InputError message={errors.description} />
            </div>

            {!editing && (
                <div className="space-y-1.5">
                    <Label htmlFor="role-copy">Start with permissions from</Label>
                    <Select value={data.copy_from} onValueChange={(v) => setData('copy_from', v)}>
                        <SelectTrigger id="role-copy">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">No permissions (blank role)</SelectItem>
                            {roles.map((r) => (
                                <SelectItem key={r.id} value={String(r.id)}>
                                    {r.name} · {r.permissions.length} permissions
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <InputError message={errors.copy_from} />
                </div>
            )}

            <InputError message={errors.permissions} />

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone} disabled={processing}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing || !data.name.trim()}>
                    {processing && <Loader2 className="size-4 animate-spin" />} {editing ? 'Save' : 'Create role'}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Assign users to a role                                                                          */
/* ---------------------------------------------------------------------------------------------- */

export function AssignUsersDialog({ role, users, currentUserId, onClose }: { role: Role | null; users: UserRow[]; currentUserId: number | null; onClose: () => void }) {
    return (
        <Dialog open={role !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">{role && <AssignForm role={role} users={users} currentUserId={currentUserId} onDone={onClose} />}</DialogContent>
        </Dialog>
    );
}

function AssignForm({ role, users, currentUserId, onDone }: { role: Role; users: UserRow[]; currentUserId: number | null; onDone: () => void }) {
    const form = useForm({ user_ids: [] as number[] });
    const [query, setQuery] = React.useState('');
    const candidates = users.filter((u) => u.role !== role.name);
    const shown = candidates.filter((u) => {
        const q = query.trim().toLowerCase();
        return !q || [u.name, u.email, u.username, u.position].some((v) => v?.toLowerCase().includes(q));
    });
    const selected = form.data.user_ids;
    const replacing = candidates.filter((u) => selected.includes(u.id) && u.role).length;

    const toggle = (id: number, on: boolean) => form.setData('user_ids', on ? [...selected, id] : selected.filter((x) => x !== id));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(`${ROLES_URL}/${role.id}/assign`, { preserveScroll: true, onSuccess: onDone });
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Assign “{role.name}”</DialogTitle>
                <DialogDescription>Each user holds one role. Assigning this role replaces the user’s current one.</DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border">
                <div className="border-b p-2">
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users" className="h-9 pl-8" />
                    </div>
                </div>
                <ul className="max-h-72 divide-y overflow-y-auto">
                    {shown.length === 0 && <li className="px-3 py-8 text-center text-xs text-muted-foreground">{candidates.length === 0 ? 'Everyone already holds this role.' : 'No users match.'}</li>}
                    {shown.map((u) => {
                        const self = u.id === currentUserId;
                        const checked = selected.includes(u.id);
                        return (
                            <li key={u.id}>
                                <label className={cn('flex items-center gap-3 px-3 py-2', self ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40', checked && 'bg-primary/5')}>
                                    <Checkbox checked={checked} disabled={self} onCheckedChange={(v) => toggle(u.id, v === true)} />
                                    <UserAvatar user={u} className="size-7" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium">
                                            {u.name}
                                            {self && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
                                        </span>
                                        <span className="block truncate text-[11px] text-muted-foreground">{u.email}</span>
                                    </span>
                                    <span className="shrink-0 text-[11px] text-muted-foreground">{u.role ?? 'No role'}</span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {replacing > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    {replacing} selected user{replacing === 1 ? '' : 's'} will lose their current role.
                </p>
            )}
            <InputError message={form.errors.user_ids ?? (form.errors as Record<string, string>)['user_ids.0']} />

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone} disabled={form.processing}>
                    Cancel
                </Button>
                <Button type="submit" disabled={form.processing || selected.length === 0}>
                    {form.processing && <Loader2 className="size-4 animate-spin" />}
                    {selected.length === 0 ? 'Assign' : `Assign to ${selected.length} user${selected.length === 1 ? '' : 's'}`}
                </Button>
            </DialogFooter>
        </form>
    );
}
