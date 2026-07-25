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
import type { CostCenter } from '@/types';
import { CostCenterFormFields } from './cost-center-form-fields';

type CostCenterEditDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    costCenter: CostCenter | null;
    errors?: Record<string, string>;
};

export function CostCenterEditDialog({
    open,
    onOpenChange,
    costCenter,
    errors = {},
}: CostCenterEditDialogProps) {
    const [processing, setProcessing] = React.useState(false);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!costCenter) return;
        const form = e.currentTarget;
        const formData = new FormData(form);
        formData.append('_method', 'PUT');
        setProcessing(true);
        router.post(`/libraries/cost-centers/${costCenter.id}`, formData, {
            preserveScroll: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => onOpenChange(false),
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit cost center</DialogTitle>
                    <DialogDescription>Update the cost center details below.</DialogDescription>
                </DialogHeader>
                {costCenter && (
                    <form id="edit-cost-center-form" onSubmit={handleSubmit}>
                        <CostCenterFormFields defaultValues={costCenter} errors={errors} />
                    </form>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="edit-cost-center-form"
                        disabled={processing || !costCenter}
                    >
                        {processing ? 'Saving...' : 'Save changes'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
