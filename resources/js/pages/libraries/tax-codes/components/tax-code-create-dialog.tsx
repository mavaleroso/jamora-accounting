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
import type { AccountOption } from '@/types';
import { TaxCodeFormFields } from './tax-code-form-fields';

type TaxCodeCreateDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: AccountOption[];
    errors?: Record<string, string>;
};

export function TaxCodeCreateDialog({
    open,
    onOpenChange,
    accounts,
    errors = {},
}: TaxCodeCreateDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        setProcessing(true);
        router.post('/libraries/tax-codes', formData, {
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
                    <DialogTitle>Create tax code</DialogTitle>
                    <DialogDescription>Add a new tax code for VAT and other taxes.</DialogDescription>
                </DialogHeader>
                <form id="create-tax-code-form" onSubmit={handleSubmit}>
                    <TaxCodeFormFields accounts={accounts} errors={errors} />
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="create-tax-code-form" disabled={processing}>
                        {processing ? 'Creating...' : 'Create tax code'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
