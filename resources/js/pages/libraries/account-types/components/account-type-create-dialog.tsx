import { router } from '@inertiajs/react';
import * as React from 'react';

import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { AccountTypeFormFields } from './account-type-form-fields';

type AccountTypeCreateDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    errors?: Record<string, string>;
};

export function AccountTypeCreateDialog({
    open,
    onOpenChange,
    errors = {},
}: AccountTypeCreateDialogProps) {
    const [processing, setProcessing] = React.useState(false);
    const confirm = useConfirm();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        const label = [formData.get('code'), formData.get('name')].filter(Boolean).join(' · ');
        const ok = await confirm({ title: 'Create this account type?', description: `${label || 'The new account type'} will be added and available across the app.`, confirmLabel: 'Create' });
        if (!ok) return;
        setProcessing(true);
        router.post('/libraries/account-types', formData, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => {
                onOpenChange(false);
                form.reset();
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create account type</DialogTitle>
                    <DialogDescription>Add a new account type classification.</DialogDescription>
                </DialogHeader>
                <form id="create-account-type-form" onSubmit={handleSubmit}>
                    <AccountTypeFormFields errors={errors} />
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="create-account-type-form" disabled={processing}>
                        {processing ? 'Creating...' : 'Create account type'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
