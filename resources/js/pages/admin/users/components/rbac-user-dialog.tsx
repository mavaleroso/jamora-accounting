import { router } from '@inertiajs/react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { User } from '@/types';
import { toast } from '@/lib/toast';

type RbacUserDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    roles: { name: string; permissions: string[] }[];
    permissions: string[];
};

export function RbacUserDialog({
    open,
    onOpenChange,
    user,
    roles,
    permissions,
}: RbacUserDialogProps) {
    const [processing, setProcessing] = React.useState(false);
    const [selectedRole, setSelectedRole] = React.useState('');
    const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>([]);

    React.useEffect(() => {
        if (!user) return;
        setSelectedRole(user.roles?.[0] ?? '');
        setSelectedPermissions(user.permissions ?? []);
    }, [user]);

    const handleRoleChange = (roleName: string) => {
        setSelectedRole(roleName);
        const role = roles.find((r) => r.name === roleName);
        if (role) {
            setSelectedPermissions(role.permissions);
        }
    };

    const togglePermission = (permission: string) => {
        setSelectedPermissions((prev) =>
            prev.includes(permission)
                ? prev.filter((p) => p !== permission)
                : [...prev, permission],
        );
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user) return;
        setProcessing(true);
        router.patch(
            `/admin/users/${user.id}/rbac`,
            {
                role: selectedRole,
                permissions: selectedPermissions,
                permissions_present: true,
            },
            {
                preserveScroll: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => {
                    toast.success('User roles and permissions updated.');
                    onOpenChange(false);
                },
                onError: () => toast.error('Failed to update roles and permissions.'),
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Update roles & permissions</DialogTitle>
                    <DialogDescription>
                        {user ? `Update access for ${user.name}.` : 'Select a user.'}
                    </DialogDescription>
                </DialogHeader>
                {user && (
                    <form id="rbac-user-form" onSubmit={handleSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Role</label>
                                <Select value={selectedRole} onValueChange={handleRoleChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roles.map((role) => (
                                            <SelectItem key={role.name} value={role.name}>
                                                {role.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Permissions</label>
                                <p className="text-xs text-muted-foreground">
                                    Changing the role will reset permissions to that role’s defaults.
                                </p>
                                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-input bg-background p-3">
                                    {permissions.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            No permissions available.
                                        </p>
                                    ) : (
                                        permissions.map((permission) => (
                                            <label key={permission} className="flex items-center gap-2 text-sm">
                                                <Checkbox
                                                    checked={selectedPermissions.includes(permission)}
                                                    onCheckedChange={() => togglePermission(permission)}
                                                />
                                                <span>{permission}</span>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </form>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="rbac-user-form" disabled={processing || !user}>
                        {processing ? 'Saving...' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
