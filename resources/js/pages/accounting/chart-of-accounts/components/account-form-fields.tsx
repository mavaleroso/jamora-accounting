import InputError from '@/components/input-error';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Account, AccountOption, AccountType } from '@/types';

type AccountFormFieldsProps = {
    mode: 'create' | 'edit';
    defaultValues?: Partial<Account>;
    accountTypes: AccountType[];
    parentAccounts: AccountOption[];
    errors?: Record<string, string>;
};

export function AccountFormFields({
    mode,
    defaultValues = {},
    accountTypes,
    parentAccounts,
    errors = {},
}: AccountFormFieldsProps) {
    const excludeParentId = mode === 'edit' ? defaultValues.id : undefined;
    const parentOptions = parentAccounts.filter((a) => a.id !== excludeParentId);

    return (
        <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div>
                <Label htmlFor="code">Code *</Label>
                <Input
                    id="code"
                    name="code"
                    defaultValue={defaultValues.code ?? ''}
                    placeholder="e.g. 1000"
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
                    placeholder="Account name"
                    className={cn(errors.name && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.name}
                />
                <InputError message={errors.name} />
            </div>
            <div>
                <Label htmlFor="account_type_id">Account Type *</Label>
                <select
                    id="account_type_id"
                    name="account_type_id"
                    defaultValue={defaultValues.account_type_id ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.account_type_id && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.account_type_id}
                >
                    <option value="">Select type</option>
                    {accountTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                            {type.name}
                        </option>
                    ))}
                </select>
                <InputError message={errors.account_type_id} />
            </div>
            <div>
                <Label htmlFor="parent_id">Parent Account</Label>
                <select
                    id="parent_id"
                    name="parent_id"
                    defaultValue={defaultValues.parent_id ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.parent_id && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.parent_id}
                >
                    <option value="">None</option>
                    {parentOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                        </option>
                    ))}
                </select>
                <InputError message={errors.parent_id} />
            </div>
            <div>
                <Label htmlFor="cash_flow_section">Cash Flow Section</Label>
                <select
                    id="cash_flow_section"
                    name="cash_flow_section"
                    defaultValue={defaultValues.cash_flow_section ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.cash_flow_section && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.cash_flow_section}
                >
                    <option value="">None</option>
                    <option value="operating">Operating</option>
                    <option value="investing">Investing</option>
                    <option value="financing">Financing</option>
                </select>
                <InputError message={errors.cash_flow_section} />
            </div>
            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex items-center gap-2">
                    <Checkbox
                        id="is_postable"
                        name="is_postable"
                        value="1"
                        defaultChecked={defaultValues.is_postable ?? true}
                    />
                    <Label htmlFor="is_postable" className="font-normal">
                        Postable
                    </Label>
                </div>
                <div className="flex items-center gap-2">
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
            <div className="sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                    id="description"
                    name="description"
                    defaultValue={defaultValues.description ?? ''}
                    placeholder="Optional description"
                    className={cn(errors.description && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.description}
                />
                <InputError message={errors.description} />
            </div>
        </div>
    );
}
