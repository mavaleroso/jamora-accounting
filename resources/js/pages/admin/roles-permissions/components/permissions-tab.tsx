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

export type PermissionItem = {
    id: number;
    name: string;
    roles: string[];
    rolesCount: number;
    usersCount: number;
    createdAt: string | null;
    updatedAt: string | null;
};

type PermissionsTabProps = {
    permissions: PermissionItem[];
    roleOptions: string[];
};

function formatDate(value: string | null | undefined): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString();
}

export function PermissionsTab({ permissions, roleOptions }: PermissionsTabProps) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [processing, setProcessing] = React.useState(false);
    const [name, setName] = React.useState('');
    const [selectedRoles, setSelectedRoles] = React.useState<string[]>([]);
    const [editingPermission, setEditingPermission] = React.useState<PermissionItem | null>(null);
    const [deleteTarget, setDeleteTarget] = React.useState<PermissionItem | null>(null);

    const resetForm = React.useCallback(() => {
        setName('');
        setSelectedRoles([]);
        setEditingPermission(null);
    }, []);

    const openCreateDialog = () => {
        resetForm();
        setCreateOpen(true);
    };

    const openEditDialog = (permission: PermissionItem) => {
        setEditingPermission(permission);
        setName(permission.name);
        setSelectedRoles(permission.roles);
        setEditOpen(true);
    };

    const toggleRole = (roleName: string) => {
        setSelectedRoles((prev) =>
            prev.includes(roleName)
                ? prev.filter((item) => item !== roleName)
                : [...prev, roleName],
        );
    };

    const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setProcessing(true);

        router.post(
            '/admin/permissions',
            {
                name: name.trim(),
                roles: selectedRoles,
            },
            {
                preserveScroll: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => {
                    toast.success('Permission created successfully.');
                    setCreateOpen(false);
                    resetForm();
                },
                onError: () => toast.error('Failed to create permission.'),
            },
        );
    };

    const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingPermission) return;
        setProcessing(true);

        router.put(
            `/admin/permissions/${editingPermission.id}`,
            {
                name: name.trim(),
                roles: selectedRoles,
            },
            {
                preserveScroll: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => {
                    toast.success('Permission updated successfully.');
                    setEditOpen(false);
                    resetForm();
                },
                onError: () => toast.error('Failed to update permission.'),
            },
        );
    };

    const handleDelete = () => {
        if (!deleteTarget) return;
        setProcessing(true);

        router.delete(`/admin/permissions/${deleteTarget.id}`, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => {
                toast.success('Permission deleted successfully.');
                setDeleteTarget(null);
            },
            onError: () => toast.error('Failed to delete permission.'),
        });
    };

    return (
        <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" onClick={openCreateDialog} className="shrink-0">
                    <PlusIcon className="size-4" />
                    Create permission
                </Button>
            </div>

            <div className="overflow-hidden rounded-lg border bg-background">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Permission</TableHead>
                            <TableHead>Roles</TableHead>
                            <TableHead>Role assignments</TableHead>
                            <TableHead>User assignments</TableHead>
                            <TableHead>Updated</TableHead>
                            <TableHead className="w-[130px] text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {permissions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    No permissions found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            permissions.map((permission) => (
                                <TableRow key={permission.id}>
                                    <TableCell className="font-medium">{permission.name}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1.5">
                                            {permission.roles.length === 0 ? (
                                                <span className="text-sm text-muted-foreground">Unassigned</span>
                                            ) : (
                                                permission.roles.map((roleName) => (
                                                    <Badge key={roleName} variant="secondary" className="font-normal">
                                                        {roleName}
                                                    </Badge>
                                                ))
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{permission.rolesCount}</TableCell>
                                    <TableCell>{permission.usersCount}</TableCell>
                                    <TableCell>{formatDate(permission.updatedAt ?? permission.createdAt)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                onClick={() => openEditDialog(permission)}
                                                aria-label={`Edit ${permission.name}`}
                                            >
                                                <PencilIcon className="size-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setDeleteTarget(permission)}
                                                aria-label={`Delete ${permission.name}`}
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
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Create permission</DialogTitle>
                        <DialogDescription>
                            Add a new permission key and assign it to roles.
                        </DialogDescription>
                    </DialogHeader>
                    <form id="create-permission-form" onSubmit={handleCreate} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="create-permission-name">Permission name</Label>
                            <Input
                                id="create-permission-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. inventory.audit.view"
                            />
                            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Assign to roles</Label>
                            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                                {roleOptions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No roles available.</p>
                                ) : (
                                    roleOptions.map((roleName) => (
                                        <label key={roleName} className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={selectedRoles.includes(roleName)}
                                                onCheckedChange={() => toggleRole(roleName)}
                                            />
                                            <span>{roleName}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            {errors.roles && <p className="text-sm text-destructive">{errors.roles}</p>}
                            {errors['roles.0'] && <p className="text-sm text-destructive">{errors['roles.0']}</p>}
                        </div>
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" form="create-permission-form" disabled={processing}>
                            {processing ? 'Saving...' : 'Create permission'}
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
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Edit permission</DialogTitle>
                        <DialogDescription>
                            Rename this permission key and update assigned roles.
                        </DialogDescription>
                    </DialogHeader>
                    <form id="edit-permission-form" onSubmit={handleUpdate} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-permission-name">Permission name</Label>
                            <Input
                                id="edit-permission-name"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="e.g. inventory.audit.view"
                            />
                            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Assign to roles</Label>
                            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                                {roleOptions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No roles available.</p>
                                ) : (
                                    roleOptions.map((roleName) => (
                                        <label key={roleName} className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={selectedRoles.includes(roleName)}
                                                onCheckedChange={() => toggleRole(roleName)}
                                            />
                                            <span>{roleName}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            {errors.roles && <p className="text-sm text-destructive">{errors.roles}</p>}
                            {errors['roles.0'] && <p className="text-sm text-destructive">{errors['roles.0']}</p>}
                        </div>
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" form="edit-permission-form" disabled={processing || !editingPermission}>
                            {processing ? 'Saving...' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete permission?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteTarget
                                ? `This will permanently delete "${deleteTarget.name}".`
                                : 'This will permanently delete this permission.'}
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
