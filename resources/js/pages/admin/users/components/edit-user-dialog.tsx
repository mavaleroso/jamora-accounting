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
import type { User } from '@/types';
import { UserFormFields } from './user-form-fields';

type EditUserDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    errors?: Record<string, string>;
    roles: { name: string; permissions: string[] }[];
    permissions: string[];
};

export function EditUserDialog({
    open,
    onOpenChange,
    user,
    roles,
    permissions,
    errors = {},
}: EditUserDialogProps) {
    const [processing, setProcessing] = React.useState(false);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = React.useState<string | null>(null);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarPreviewUrl(URL.createObjectURL(file));
        } else {
            setAvatarPreviewUrl(null);
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        if (!formData.get('password')) {
            formData.delete('password');
        }
        formData.append('_method', 'PUT');
        setProcessing(true);
        router.post(`/admin/users/${user.id}`, formData, {
            preserveScroll: true,
            forceFormData: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => {
                onOpenChange(false);
                setAvatarPreviewUrl(null);
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit user</DialogTitle>
                    <DialogDescription>
                        Update the user details below.
                    </DialogDescription>
                </DialogHeader>
                {user && (
                    <form
                        id="edit-user-form"
                        onSubmit={handleSubmit}
                        encType="multipart/form-data"
                    >
                        <UserFormFields
                            mode="edit"
                            defaultValues={user}
                            roles={roles}
                            permissions={permissions}
                            errors={errors}
                            avatarPreviewUrl={avatarPreviewUrl}
                            onAvatarChange={handleAvatarChange}
                        />
                    </form>
                )}
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="edit-user-form"
                        disabled={processing || !user}
                    >
                        {processing ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
