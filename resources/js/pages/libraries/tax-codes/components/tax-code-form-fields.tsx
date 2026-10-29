import InputError from '@/components/input-error';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AccountOption, TaxCode } from '@/types';

type TaxCodeFormFieldsProps = {
    defaultValues?: Partial<TaxCode>;
    accounts: AccountOption[];
    errors?: Record<string, string>;
};

const TAX_TYPES = [
    { value: 'input_vat', label: 'Input VAT' },
    { value: 'output_vat', label: 'Output VAT' },
    // Withheld from supplier bills; the code is the BIR ATC (e.g. WC158), the account is the EWT payable.
    { value: 'ewt', label: 'Expanded withholding tax (EWT)' },
];

export function TaxCodeFormFields({
    defaultValues = {},
    accounts,
    errors = {},
}: TaxCodeFormFieldsProps) {
    const ratePercent =
        defaultValues.rate !== undefined && defaultValues.rate !== null
            ? (Number(defaultValues.rate) * 100).toString()
            : '12';

    return (
        <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div>
                <Label htmlFor="code">Code *</Label>
                <Input
                    id="code"
                    name="code"
                    defaultValue={defaultValues.code ?? ''}
                    placeholder="e.g. OVAT"
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
                    placeholder="Tax code name"
                    className={cn(errors.name && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.name}
                />
                <InputError message={errors.name} />
            </div>
            <div>
                <Label htmlFor="rate_percent">Rate (%) *</Label>
                <Input
                    id="rate_percent"
                    name="rate_percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    defaultValue={ratePercent}
                    className={cn(errors.rate && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.rate}
                />
                <InputError message={errors.rate} />
            </div>
            <div>
                <Label htmlFor="type">Type *</Label>
                <select
                    id="type"
                    name="type"
                    defaultValue={defaultValues.type ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.type && 'border-red-600 dark:border-red-400',
                    )}
                >
                    <option value="">Select type</option>
                    {TAX_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                            {type.label}
                        </option>
                    ))}
                </select>
                <InputError message={errors.type} />
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="account_id">Linked Account</Label>
                <select
                    id="account_id"
                    name="account_id"
                    defaultValue={defaultValues.account_id ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.account_id && 'border-red-600 dark:border-red-400',
                    )}
                >
                    <option value="">None</option>
                    {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                        </option>
                    ))}
                </select>
                <InputError message={errors.account_id} />
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
