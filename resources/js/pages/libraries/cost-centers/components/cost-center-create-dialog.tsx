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
import { CostCenterFormFields } from './cost-center-form-fields';

type CostCenterCreateDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    errors?: Record<string, string>;
};

export function CostCenterCreateDialog({
    open,
    onOpenChange,
    errors = {},
}: CostCenterCreateDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const formData = new FormData(form);
        setProcessing(true);
        router.post('/libraries/cost-centers', formData, {
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
                    <DialogTitle>Create cost center</DialogTitle>
                    <DialogDescription>Add a new cost center for tracking expenses.</DialogDescription>
                </DialogHeader>
                <form id="create-cost-center-form" onSubmit={handleSubmit}>
                    <CostCenterFormFields errors={errors} />
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" form="create-cost-center-form" disabled={processing}>
                        {processing ? 'Creating...' : 'Create cost center'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
