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
import type { AccountOption, AccountType } from '@/types';
import { AccountFormFields } from './account-form-fields';

type AccountCreateDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accountTypes: AccountType[];
    parentAccounts: AccountOption[];
    errors?: Record<string, string>;
};

export function AccountCreateDialog({
    open,
    onOpenChange,
    accountTypes,
    parentAccounts,
    errors = {},
}: AccountCreateDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        setProcessing(true);
        router.post('/accounting/chart-of-accounts', formData, {
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
                    <DialogTitle>Create account</DialogTitle>
                    <DialogDescription>
                        Add a new account to the chart of accounts.
                    </DialogDescription>
                </DialogHeader>
                <form id="create-account-form" onSubmit={handleSubmit}>
                    <AccountFormFields
                        mode="create"
                        accountTypes={accountTypes}
                        parentAccounts={parentAccounts}
                        errors={errors}
                    />
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="create-account-form" disabled={processing}>
                        {processing ? 'Creating...' : 'Create account'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
