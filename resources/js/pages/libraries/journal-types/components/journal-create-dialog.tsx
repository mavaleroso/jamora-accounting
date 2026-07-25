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
import { JournalFormFields } from './journal-form-fields';

type JournalCreateDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    accounts: AccountOption[];
    errors?: Record<string, string>;
};

export function JournalCreateDialog({
    open,
    onOpenChange,
    accounts,
    errors = {},
}: JournalCreateDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        setProcessing(true);
        router.post('/libraries/journal-types', formData, {
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
                    <DialogTitle>Create journal type</DialogTitle>
                    <DialogDescription>Add a new journal type for posting entries.</DialogDescription>
                </DialogHeader>
                <form id="create-journal-form" onSubmit={handleSubmit}>
                    <JournalFormFields mode="create" accounts={accounts} errors={errors} />
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="create-journal-form" disabled={processing}>
                        {processing ? 'Creating...' : 'Create journal type'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
