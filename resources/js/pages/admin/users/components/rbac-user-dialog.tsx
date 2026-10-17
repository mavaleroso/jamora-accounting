import { router } from '@inertiajs/react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { AccessCatalog, UserRow } from '../lib';
import { extrasOnly, rolePermissions, USERS_URL } from '../lib';
import { AccessFields } from './access-fields';
import { RoleBadge, UserAvatar } from './shared';

type Props = AccessCatalog & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: UserRow | null;
};

export function RbacUserDialog({ open, onOpenChange, user, roles, permissions, modules }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(94vh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,72rem)]">
                {user && (
                    <>
                        <DialogHeader className="border-b px-6 py-4 text-left">
                            <DialogTitle>Manage access</DialogTitle>
                            <DialogDescription asChild>
                                <div className="flex items-center gap-2.5 pt-1">
                                    <UserAvatar user={user} className="size-8" />
                                    <span className="min-w-0 text-sm">
                                        <span className="block font-medium text-foreground">{user.name}</span>
                                        <span className="flex items-center gap-1.5 text-xs">
                                            Currently <RoleBadge role={user.roles?.[0]} />
                                        </span>
                                    </span>
                                </div>
                            </DialogDescription>
                        </DialogHeader>
                        {open && <AccessForm key={user.id} user={user} roles={roles} permissions={permissions} modules={modules} onDone={() => onOpenChange(false)} />}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

function AccessForm({ user, roles, permissions, modules, onDone }: AccessCatalog & { user: UserRow; onDone: () => void }) {
    const initialRole = user.roles?.[0] ?? '';
    const initialExtras = React.useMemo(() => extrasOnly(user.permissions, rolePermissions(roles, initialRole)), [user, roles, initialRole]);
    const [role, setRole] = React.useState(initialRole);
    const [extras, setExtras] = React.useState(initialExtras);
    const [errors, setErrors] = React.useState<Record<string, string>>({});
    const [processing, setProcessing] = React.useState(false);

    const dirty = role !== initialRole || extras.length !== initialExtras.length || extras.some((p) => !initialExtras.includes(p));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setProcessing(true);
        router.patch(
            `${USERS_URL}/${user.id}/rbac`,
            { role, permissions: extras, permissions_present: true },
            {
                preserveScroll: true,
                preserveState: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => onDone(),
                onError: (errs) => {
                    setErrors(errs);
                    toast.error(errs.role ?? 'Could not update access.');
                },
            },
        );
    };

    return (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 lg:overflow-hidden lg:p-6">
                <AccessFields roles={roles} permissions={permissions} modules={modules} role={role} onRoleChange={setRole} extras={extras} onExtrasChange={setExtras} errors={errors} layout="split" />
            </div>
            <DialogFooter className="items-center border-t bg-muted/30 px-5 py-3 sm:justify-between">
                <span className="text-xs text-muted-foreground">{dirty ? 'Unsaved changes' : 'No changes yet'}</span>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={onDone}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={processing || !role || !dirty}>
                        {processing ? 'Saving…' : 'Save access'}
                    </Button>
                </div>
            </DialogFooter>
        </form>
    );
}
