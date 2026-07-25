import InputError from '@/components/input-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AccountType } from '@/types';

type AccountTypeFormFieldsProps = {
    defaultValues?: Partial<AccountType>;
    errors?: Record<string, string>;
};

export function AccountTypeFormFields({
    defaultValues = {},
    errors = {},
}: AccountTypeFormFieldsProps) {
    return (
        <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                    id="name"
                    name="name"
                    defaultValue={defaultValues.name ?? ''}
                    placeholder="e.g. Current Assets"
                    className={cn(errors.name && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.name}
                />
                <InputError message={errors.name} />
            </div>
            <div>
                <Label htmlFor="classification">Classification *</Label>
                <select
                    id="classification"
                    name="classification"
                    defaultValue={defaultValues.classification ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.classification && 'border-red-600 dark:border-red-400',
                    )}
                >
                    <option value="">Select classification</option>
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="equity">Equity</option>
                    <option value="revenue">Revenue</option>
                    <option value="expense">Expense</option>
                </select>
                <InputError message={errors.classification} />
            </div>
            <div>
                <Label htmlFor="normal_balance">Normal Balance *</Label>
                <select
                    id="normal_balance"
                    name="normal_balance"
                    defaultValue={defaultValues.normal_balance ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.normal_balance && 'border-red-600 dark:border-red-400',
                    )}
                >
                    <option value="">Select balance</option>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                </select>
                <InputError message={errors.normal_balance} />
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="statement">Statement *</Label>
                <select
                    id="statement"
                    name="statement"
                    defaultValue={defaultValues.statement ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.statement && 'border-red-600 dark:border-red-400',
                    )}
                >
                    <option value="">Select statement</option>
                    <option value="BS">Balance Sheet (BS)</option>
                    <option value="IS">Income Statement (IS)</option>
                </select>
                <InputError message={errors.statement} />
            </div>
        </div>
    );
}
