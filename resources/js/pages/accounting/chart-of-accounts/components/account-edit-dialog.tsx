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
import type { Account, AccountOption, AccountType } from '@/types';
import { AccountFormFields } from './account-form-fields';

type AccountEditDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    account: Account | null;
    accountTypes: AccountType[];
    parentAccounts: AccountOption[];
    errors?: Record<string, string>;
};

export function AccountEditDialog({
    open,
    onOpenChange,
    account,
    accountTypes,
    parentAccounts,
    errors = {},
}: AccountEditDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!account) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        formData.append('_method', 'PUT');
        setProcessing(true);
        router.post(`/accounting/chart-of-accounts/${account.id}`, formData, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => onOpenChange(false),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit account</DialogTitle>
                    <DialogDescription>
                        Update the account details below.
                    </DialogDescription>
                </DialogHeader>
                {account && (
                    <form id="edit-account-form" onSubmit={handleSubmit}>
                        <AccountFormFields
                            mode="edit"
                            defaultValues={account}
                            accountTypes={accountTypes}
                            parentAccounts={parentAccounts}
                            errors={errors}
                        />
                    </form>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="edit-account-form"
                        disabled={processing || !account}
                    >
                        {processing ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
