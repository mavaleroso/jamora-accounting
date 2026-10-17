import { Head, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { PencilIcon } from 'lucide-react';
import * as React from 'react';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import type { AccountOption, BreadcrumbItem, PostingRule } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Optical Sync', href: '/integration/optical' },
    { title: 'Posting Rules', href: '/integration/optical/rules' },
];

type Props = {
    rules: PostingRule[];
    accounts: AccountOption[];
};

export default function OpticalRulesPage({ rules, accounts }: Props) {
    const [editOpen, setEditOpen] = React.useState(false);
    const [selectedRule, setSelectedRule] = React.useState<PostingRule | null>(null);
    const confirm = useConfirm();
    const [debitAccountId, setDebitAccountId] = React.useState('');
    const [creditAccountId, setCreditAccountId] = React.useState('');
    const [isActive, setIsActive] = React.useState(true);
    const [saving, setSaving] = React.useState(false);

    const openEdit = (rule: PostingRule) => {
        setSelectedRule(rule);
        setDebitAccountId(String(rule.debit_account_id));
        setCreditAccountId(String(rule.credit_account_id));
        setIsActive(rule.is_active);
        setEditOpen(true);
    };

    const handleSave = async () => {
        if (!selectedRule) return;
        const ok = await confirm({
            title: `Save the ${selectedRule.name} rule?`,
            description: 'Documents synced from now on post with these accounts. Entries already posted are not changed.',
            confirmLabel: 'Save rule',
        });
        if (!ok) return;

        setSaving(true);
        router.put(
            `/integration/optical/rules/${selectedRule.id}`,
            {
                debit_account_id: Number(debitAccountId),
                credit_account_id: Number(creditAccountId),
                is_active: isActive,
            },
            {
                preserveScroll: true,
                onSuccess: () => setEditOpen(false),
                onFinish: () => setSaving(false),
            },
        );
    };

    const columns = React.useMemo<ColumnDef<PostingRule>[]>(
        () => [
            {
                accessorKey: 'event',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Event" />,
                cell: ({ row }) => <code className="text-xs">{row.original.event}</code>,
            },
            {
                accessorKey: 'name',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
            },
            {
                id: 'debit',
                header: 'Debit Account',
                cell: ({ row }) =>
                    row.original.debit_account
                        ? `${row.original.debit_account.code} — ${row.original.debit_account.name}`
                        : '—',
            },
            {
                id: 'credit',
                header: 'Credit Account',
                cell: ({ row }) =>
                    row.original.credit_account
                        ? `${row.original.credit_account.code} — ${row.original.credit_account.name}`
                        : '—',
            },
            {
                accessorKey: 'is_active',
                header: ({ column }) => <DataTableColumnHeader column={column} title="Active" />,
                cell: ({ row }) => (
                    <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
                        {row.original.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                ),
            },
            {
                id: 'actions',
                header: 'Actions',
                cell: ({ row }) => (
                    <Button size="sm" variant="outline" onClick={() => openEdit(row.original)}>
                        <PencilIcon className="size-4" />
                        Edit
                    </Button>
                ),
            },
        ],
        [],
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Posting Rules" />

            <div className="flex flex-col gap-6 p-4">
                <Heading
                    title="Posting Rules"
                    description="Configure default accounts used when syncing Optical sales and collections."
                />

                <DataTable title="Optical Posting Rules" description="These rules map sync events to chart-of-accounts entries." columns={columns} data={rules} emptyTitle="No posting rules yet" />
            </div>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Posting Rule</DialogTitle>
                        <DialogDescription>
                            {selectedRule?.name} ({selectedRule?.event})
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Debit Account</Label>
                            <Select value={debitAccountId} onValueChange={setDebitAccountId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((account) => (
                                        <SelectItem key={account.id} value={String(account.id)}>
                                            {account.code} — {account.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Credit Account</Label>
                            <Select value={creditAccountId} onValueChange={setCreditAccountId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((account) => (
                                        <SelectItem key={account.id} value={String(account.id)}>
                                            {account.code} — {account.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="is_active"
                                checked={isActive}
                                onCheckedChange={(checked) => setIsActive(checked === true)}
                            />
                            <Label htmlFor="is_active">Active</Label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
