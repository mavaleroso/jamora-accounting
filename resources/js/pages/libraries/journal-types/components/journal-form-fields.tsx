import InputError from '@/components/input-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AccountOption, Journal } from '@/types';

type JournalFormFieldsProps = {
    mode: 'create' | 'edit';
    defaultValues?: Partial<Journal>;
    accounts: AccountOption[];
    errors?: Record<string, string>;
};

const JOURNAL_TYPES = [
    { value: 'general', label: 'General' },
    { value: 'sales', label: 'Sales' },
    { value: 'cash_receipts', label: 'Cash Receipts' },
    { value: 'cash_disbursements', label: 'Cash Disbursements' },
    { value: 'purchases', label: 'Purchases' },
];

export function JournalFormFields({
    mode,
    defaultValues = {},
    accounts,
    errors = {},
}: JournalFormFieldsProps) {
    return (
        <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div>
                <Label htmlFor="code">Code *</Label>
                <Input
                    id="code"
                    name="code"
                    defaultValue={defaultValues.code ?? ''}
                    placeholder="e.g. GJ"
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
                    placeholder="Journal name"
                    className={cn(errors.name && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.name}
                />
                <InputError message={errors.name} />
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
                    {JOURNAL_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                            {type.label}
                        </option>
                    ))}
                </select>
                <InputError message={errors.type} />
            </div>
            <div>
                <Label htmlFor="sequence_prefix">Sequence Prefix *</Label>
                <Input
                    id="sequence_prefix"
                    name="sequence_prefix"
                    defaultValue={defaultValues.sequence_prefix ?? ''}
                    placeholder="e.g. GJ"
                    className={cn(errors.sequence_prefix && 'border-red-600 dark:border-red-400')}
                    aria-invalid={!!errors.sequence_prefix}
                />
                <InputError message={errors.sequence_prefix} />
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="default_account_id">Default Account</Label>
                <select
                    id="default_account_id"
                    name="default_account_id"
                    defaultValue={defaultValues.default_account_id ?? ''}
                    className={cn(
                        'border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                        errors.default_account_id && 'border-red-600 dark:border-red-400',
                    )}
                >
                    <option value="">None</option>
                    {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                            {account.code} — {account.name}
                        </option>
                    ))}
                </select>
                <InputError message={errors.default_account_id} />
            </div>
            {mode === 'create' ? (
                <div>
                    <Label htmlFor="next_sequence">Next Sequence</Label>
                    <Input
                        id="next_sequence"
                        name="next_sequence"
                        type="number"
                        min={1}
                        defaultValue={defaultValues.next_sequence ?? 1}
                        className={cn(errors.next_sequence && 'border-red-600 dark:border-red-400')}
                        aria-invalid={!!errors.next_sequence}
                    />
                    <InputError message={errors.next_sequence} />
                </div>
            ) : (
                <div>
                    <Label htmlFor="next_sequence_display">Next Sequence</Label>
                    <Input
                        id="next_sequence_display"
                        value={defaultValues.next_sequence ?? 1}
                        readOnly
                        disabled
                        className="bg-muted"
                    />
                </div>
            )}
        </div>
    );
}
