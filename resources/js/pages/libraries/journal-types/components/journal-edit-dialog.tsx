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
import type { AccountOption, Journal } from '@/types';
import { JournalFormFields } from './journal-form-fields';

type JournalEditDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    journal: Journal | null;
    accounts: AccountOption[];
    errors?: Record<string, string>;
};

export function JournalEditDialog({
    open,
    onOpenChange,
    journal,
    accounts,
    errors = {},
}: JournalEditDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!journal) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        formData.append('_method', 'PUT');
        setProcessing(true);
        router.post(`/libraries/journal-types/${journal.id}`, formData, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => onOpenChange(false),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit journal type</DialogTitle>
                    <DialogDescription>Update the journal type details below.</DialogDescription>
                </DialogHeader>
                {journal && (
                    <form id="edit-journal-form" onSubmit={handleSubmit}>
                        <JournalFormFields
                            mode="edit"
                            defaultValues={journal}
                            accounts={accounts}
                            errors={errors}
                        />
                    </form>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="edit-journal-form" disabled={processing || !journal}>
                        {processing ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
