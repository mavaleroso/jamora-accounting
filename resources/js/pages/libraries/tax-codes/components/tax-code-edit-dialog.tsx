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
import type { AccountOption, TaxCode } from '@/types';
import { TaxCodeFormFields } from './tax-code-form-fields';

type TaxCodeEditDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    taxCode: TaxCode | null;
    accounts: AccountOption[];
    errors?: Record<string, string>;
};

export function TaxCodeEditDialog({
    open,
    onOpenChange,
    taxCode,
    accounts,
    errors = {},
}: TaxCodeEditDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!taxCode) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        formData.append('_method', 'PUT');
        setProcessing(true);
        router.post(`/libraries/tax-codes/${taxCode.id}`, formData, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => onOpenChange(false),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit tax code</DialogTitle>
                    <DialogDescription>Update the tax code details below.</DialogDescription>
                </DialogHeader>
                {taxCode && (
                    <form id="edit-tax-code-form" onSubmit={handleSubmit}>
                        <TaxCodeFormFields
                            defaultValues={taxCode}
                            accounts={accounts}
                            errors={errors}
                        />
                    </form>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="edit-tax-code-form" disabled={processing || !taxCode}>
                        {processing ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
