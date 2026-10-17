import { useForm, router } from '@inertiajs/react';
import { Code2, Loader2, Lock, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog, useConfirm } from '@/components/confirm-dialog';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { matches, type Module, type Permission, type Role } from '../lib';
import { CUSTOM_PILL, Pill, SYSTEM_PILL } from './shared';

/**
 * Advanced: the permission keys themselves. Built-in keys are checked by the application and cannot be
 * renamed or deleted; custom keys do nothing until code checks them.
 */
export function PermissionKeys({ permissions, modules, roles }: { permissions: Permission[]; modules: Module[]; roles: Role[] }) {
    const [query, setQuery] = React.useState('');
    const [editing, setEditing] = React.useState<Permission | 'new' | null>(null);
    const [deleting, setDeleting] = React.useState<Permission | null>(null);
    const moduleLabel = new Map(modules.map((m) => [m.key, m.label]));
    const rows = permissions.filter((p) => matches(p, query));

    return (
        <section className="rounded-xl border bg-card shadow-sm">
            <header className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search keys" className="h-9 pl-8" aria-label="Search permission keys" />
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
                    <Plus className="size-4" /> Custom key
                </Button>
            </header>

            <p className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Code2 className="mt-0.5 size-3.5 shrink-0" />
                For developers. Permission keys are checked in code; a new key has no effect until a route or screen checks it. To change what a role can do, use the Roles tab.
            </p>

            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>Permission</TableHead>
                            <TableHead className="hidden md:table-cell">Module</TableHead>
                            <TableHead>Granted to</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="w-10" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((p) => (
                            <TableRow key={p.id}>
                                <TableCell>
                                    <p className="text-sm font-medium">{p.label}</p>
                                    <code className="font-mono text-[11px] text-muted-foreground">{p.key}</code>
                                </TableCell>
                                <TableCell className="hidden text-sm md:table-cell">{moduleLabel.get(p.module) ?? 'Other'}</TableCell>
                                <TableCell className="text-sm">
                                    <span className="tabular-nums">{p.rolesCount}</span> role{p.rolesCount === 1 ? '' : 's'}
                                    {p.usersCount > 0 && <span className="text-muted-foreground"> · {p.usersCount} direct</span>}
                                </TableCell>
                                <TableCell>
                                    {p.builtin ? (
                                        <Pill className={SYSTEM_PILL}>
                                            <Lock className="size-3" /> Built-in
                                        </Pill>
                                    ) : (
                                        <Pill className={CUSTOM_PILL}>Custom</Pill>
                                    )}
                                </TableCell>
                                <TableCell>
                                    {!p.builtin && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="icon" variant="ghost" className="size-8" aria-label={`Actions for ${p.key}`}>
                                                    <MoreHorizontal className="size-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => setEditing(p)}>
                                                    <Pencil className="size-4" /> Edit
                                                </DropdownMenuItem>
                                                <DropdownMenuItem variant="destructive" disabled={p.rolesCount + p.usersCount > 0} onSelect={() => setDeleting(p)}>
                                                    <Trash2 className="size-4" /> Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No keys match.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
                <DialogContent className="sm:max-w-md">
                    {editing && <KeyForm permission={editing === 'new' ? null : editing} roles={roles} onDone={() => setEditing(null)} />}
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(o) => !o && setDeleting(null)}
                title="Delete permission key?"
                description={`“${deleting?.key}” will be removed permanently.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={() => deleting && router.delete(`/admin/permissions/${deleting.id}`, { preserveScroll: true })}
            />
        </section>
    );
}

function KeyForm({ permission, roles, onDone }: { permission: Permission | null; roles: Role[]; onDone: () => void }) {
    const form = useForm({ name: permission?.key ?? '', roles: permission?.roles ?? ([] as string[]) });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!permission) {
            const ok = await confirm({
                title: `Create the permission key ${data.name || ''}?`,
                description: data.roles.length ? `It is granted to ${data.roles.join(', ')}.` : 'It is not granted to any role yet.',
                confirmLabel: 'Create key',
            });
            if (!ok) return;
        }
        if (permission) form.put(`/admin/permissions/${permission.id}`, { preserveScroll: true, onSuccess: onDone });
        else form.post('/admin/permissions', { preserveScroll: true, onSuccess: onDone });
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{permission ? 'Edit custom key' : 'New custom key'}</DialogTitle>
                <DialogDescription>Use lowercase dot notation, e.g. inventory.adjust. Ask a developer to wire it to a screen or route.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
                <Label htmlFor="perm-key">Key</Label>
                <Input id="perm-key" value={data.name} onChange={(e) => setData('name', e.target.value.toLowerCase())} className="font-mono" placeholder="module.action" required />
                <InputError message={errors.name} />
            </div>
            <div className="space-y-1.5">
                <Label>Grant to roles</Label>
                <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border p-2.5 sm:grid-cols-2">
                    {roles.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                                checked={data.roles.includes(r.name)}
                                onCheckedChange={(v) => setData('roles', v === true ? [...data.roles, r.name] : data.roles.filter((x) => x !== r.name))}
                            />
                            {r.name}
                        </label>
                    ))}
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone} disabled={processing}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing || !data.name.trim()}>
                    {processing && <Loader2 className="size-4 animate-spin" />} {permission ? 'Save' : 'Create key'}
                </Button>
            </DialogFooter>
        </form>
    );
}

