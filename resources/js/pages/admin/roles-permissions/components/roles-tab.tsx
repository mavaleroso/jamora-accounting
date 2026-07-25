import { router, usePage } from '@inertiajs/react';
import { PlusIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { toast } from '@/lib/toast';

export type RoleItem = {
    id: number;
    name: string;
    permissions: string[];
    usersCount: number;
    createdAt: string | null;
    updatedAt: string | null;
};

type RolesTabProps = {
    roles: RoleItem[];
    permissionOptions: string[];
};

function formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString();
}

function toGroupLabel(group: string): string {
    return group
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function RolesTab({ roles, permissionOptions }: RolesTabProps) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [deleteTarget, setDeleteTarget] = React.useState<RoleItem | null>(null);
    const [processing, setProcessing] = React.useState(false);
    const [name, setName] = React.useState('');
    const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([]);
    const [editingRole, setEditingRole] = React.useState<RoleItem | null>(null);

    const groupedPermissions = React.useMemo(() => {
        const groups: Record<string, string[]> = {};
        permissionOptions.forEach((permission) => {
            const [rawGroup] = permission.split('.');
            const group = rawGroup ?? 'general';
            if (!groups[group]) groups[group] = [];
            groups[group].push(permission);
        });
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [permissionOptions]);

    const resetForm = React.useCallback(() => {
        setName('');
        setSelectedPermissions([]);
        setEditingRole(null);
    }, []);

    const openCreateDialog = () => {
        resetForm();
        setCreateOpen(true);
    };

    const openEditDialog = (role: RoleItem) => {
        setEditingRole(role);
        setName(role.name);
        setSelectedPermissions(role.permissions);
        setEditOpen(true);
    };

    const togglePermission = (permission: string) => {
        setSelectedPermissions((prev) =>
            prev.includes(permission)
                ? prev.filter((item) => item !== permission)
                : [...prev, permission],
        );
    };

    const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setProcessing(true);

        router.post(
            '/admin/roles',
            {
                name: name.trim(),
                permissions: selectedPermissions,
            },
            {
                preserveScroll: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => {
                    toast.success('Role created successfully.');
                    setCreateOpen(false);
                    resetForm();
                },
                onError: () => toast.error('Failed to create role.'),
            },
        );
    };

    const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingRole) return;
        setProcessing(true);

        router.put(
            `/admin/roles/${editingRole.id}`,
            {
                name: name.trim(),
                permissions: selectedPermissions,
            },
            {
                preserveScroll: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => {
                    toast.success('Role updated successfully.');
                    setEditOpen(false);
                    resetForm();
                },
                onError: () => toast.error('Failed to update role.'),
            },
        );
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        setProcessing(true);

        router.delete(`/admin/roles/${deleteTarget.id}`, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => {
                toast.success('Role deleted successfully.');
                setDeleteTarget(null);
            },
            onError: () => toast.error('Failed to delete role.'),
        });
    };

    const permissionFieldError = errors.permissions || errors['permissions.0'];

    return (
        <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" onClick={openCreateDialog} className="shrink-0">
                    <PlusIcon className="size-4" />
                    Create role
                </Button>
            </div>

            <div className="overflow-hidden rounded-lg border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Role</TableHead>
                            <TableHead>Permissions</TableHead>
                            <TableHead>Assigned users</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead className="w-[130px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {roles.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No roles found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            roles.map((role) => (
                                <TableRow key={role.id}>
                                    <TableCell className="font-medium">{role.name}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1.5">
                                            {role.permissions.length === 0 ? (
                                                <span className="text-sm text-muted-foreground">No permissions</span>
                                            ) : (
                                                role.permissions.map((permission) => (
                                                    <Badge key={permission} variant="secondary" className="font-normal">
                                                        {permission}
                                                    </Badge>
                                                ))
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{role.usersCount}</TableCell>
                                    <TableCell>{formatDate(role.updatedAt ?? role.createdAt)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                onClick={() => openEditDialog(role)}
                                                aria-label={`Edit ${role.name}`}
                                            >
                                                <PencilIcon className="size-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setDeleteTarget(role)}
                                                disabled={role.name === 'Admin'}
                                                aria-label={`Delete ${role.name}`}
                                            >
                                                <Trash2Icon className="size-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Create role</DialogTitle>
                        <DialogDescription>
                            Define a role and choose the permissions that belong to it.
                        </DialogDescription>
                    </DialogHeader>
                    <form id="create-role-form" onSubmit={handleCreate} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="create-role-name">Role name</Label>
                            <Input
                                id="create-role-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. Cashier"
                            />
                            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Permissions</Label>
                            <div className="space-y-4 rounded-md border p-3">
                                {groupedPermissions.map(([group, items]) => (
                                    <div key={group} className="space-y-2">
                                        <p className="text-sm font-medium">{toGroupLabel(group)}</p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {items.map((permission) => (
                                                <label key={permission} className="flex items-start gap-2 text-sm">
                                                    <Checkbox
                                                        checked={selectedPermissions.includes(permission)}
                                                        onCheckedChange={() => togglePermission(permission)}
                                                    />
                                                    <span>{permission}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {permissionFieldError && (
                                <p className="text-sm text-destructive">{permissionFieldError}</p>
                            )}
                        </div>
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" form="create-role-form" disabled={processing}>
                            {processing ? 'Saving...' : 'Create role'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={editOpen}
                onOpenChange={(open) => {
                    setEditOpen(open);
                    if (!open) resetForm();
                }}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit role</DialogTitle>
                        <DialogDescription>
                            Update role details and the permissions included in this role.
                        </DialogDescription>
                    </DialogHeader>
                    <form id="edit-role-form" onSubmit={handleUpdate} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-role-name">Role name</Label>
                            <Input
                                id="edit-role-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. Cashier"
                            />
                            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Permissions</Label>
                            <div className="space-y-4 rounded-md border p-3">
                                {groupedPermissions.map(([group, items]) => (
                                    <div key={group} className="space-y-2">
                                        <p className="text-sm font-medium">{toGroupLabel(group)}</p>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {items.map((permission) => (
                                                <label key={permission} className="flex items-start gap-2 text-sm">
                                                    <Checkbox
                                                        checked={selectedPermissions.includes(permission)}
                                                        onCheckedChange={() => togglePermission(permission)}
                                                    />
                                                    <span>{permission}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {permissionFieldError && (
                                <p className="text-sm text-destructive">{permissionFieldError}</p>
                            )}
                        </div>
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" form="edit-role-form" disabled={processing || !editingRole}>
                            {processing ? 'Saving...' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete role?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget
                                ? `This will permanently delete "${deleteTarget.name}".`
                                : 'This will permanently delete this role.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={processing}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {processing ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
