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
import { UserFormFields } from './user-form-fields';

type CreateUserDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    errors?: Record<string, string>;
    roles: { name: string; permissions: string[] }[];
    permissions: string[];
};

export function CreateUserDialog({
    open,
    onOpenChange,
    roles,
    permissions,
    errors = {},
}: CreateUserDialogProps) {
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
        const form = e.currentTarget;
        const formData = new FormData(form);
        if (!formData.get('password')) {
            formData.delete('password');
        }
        setProcessing(true);
        router.post('/admin/users', formData, {
            preserveScroll: true,
            forceFormData: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => {
                onOpenChange(false);
                form.reset();
                setAvatarPreviewUrl(null);
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create user</DialogTitle>
                    <DialogDescription>
                        Add a new user to the system. Fill in the details below.
                    </DialogDescription>
                </DialogHeader>
                <form
                    id="create-user-form"
                    onSubmit={handleSubmit}
                    encType="multipart/form-data"
                >
                    <UserFormFields
                        mode="create"
                        roles={roles}
                        permissions={permissions}
                        errors={errors}
                        avatarPreviewUrl={avatarPreviewUrl}
                        onAvatarChange={handleAvatarChange}
                    />
                </form>
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
                        form="create-user-form"
                        disabled={processing}
                    >
                        {processing ? 'Creating...' : 'Create user'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
