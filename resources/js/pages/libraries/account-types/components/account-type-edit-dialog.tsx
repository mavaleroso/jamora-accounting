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
import type { AccountType } from '@/types';
import { AccountTypeFormFields } from './account-type-form-fields';

type AccountTypeEditDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accountType: AccountType | null;
    errors?: Record<string, string>;
};

export function AccountTypeEditDialog({
    open,
    onOpenChange,
    accountType,
    errors = {},
}: AccountTypeEditDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!accountType) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        formData.append('_method', 'PUT');
        setProcessing(true);
        router.post(`/libraries/account-types/${accountType.id}`, formData, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => onOpenChange(false),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit account type</DialogTitle>
                    <DialogDescription>Update the account type details below.</DialogDescription>
                </DialogHeader>
                {accountType && (
                    <form id="edit-account-type-form" onSubmit={handleSubmit}>
                        <AccountTypeFormFields defaultValues={accountType} errors={errors} />
                    </form>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="edit-account-type-form"
                        disabled={processing || !accountType}
                    >
                        {processing ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
