import InputError from '@/components/input-error';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { CostCenter } from '@/types';

type CostCenterFormFieldsProps = {
    defaultValues?: Partial<CostCenter>;
    errors?: Record<string, string>;
};

export function CostCenterFormFields({
    defaultValues = {},
    errors = {},
}: CostCenterFormFieldsProps) {
    return (
        <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div>
                <Label htmlFor="code">Code *</Label>
                <Input
                    id="code"
                    name="code"
                    defaultValue={defaultValues.code ?? ''}
                    placeholder="e.g. MAIN"
                    className={cn(errors.code && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.code}
                />
                <InputError message={errors.code} />
            </div>
            <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                    id="name"
                    name="name"
                    defaultValue={defaultValues.name ?? ''}
                    placeholder="Cost center name"
                    className={cn(errors.name && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.name}
                />
                <InputError message={errors.name} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
                <Checkbox
                    id="is_active"
                    name="is_active"
                    value="1"
                    defaultChecked={defaultValues.is_active ?? true}
                />
                <Label htmlFor="is_active" className="font-normal">
                    Active
                </Label>
            </div>
        </div>
    );
}
