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

/** An optical service fee and the revenue account its sales post to (its own rule, or the general service rule). */
type ServiceRevenueRow = {
    optical_service_id: number;
    name: string;
    billed_by: 'jam_opticus' | 'branch' | null;
    is_active: boolean;
    rule: { id: number; credit_account_id: number; credit_account: AccountOption | null } | null;
};

type Props = {
    rules: PostingRule[];
    accounts: AccountOption[];
    services: ServiceRevenueRow[];
    revenueAccounts: AccountOption[];
};

const GENERAL = 'general';

/**
 * Revenue by service: any optical service can post to its own revenue account (e.g. eye exams apart from
 * certifications), so new revenue lines need no code change. Unmapped services use the service sale rule.
 */
function ServiceRevenue({ services, revenueAccounts, generalAccount }: { services: ServiceRevenueRow[]; revenueAccounts: AccountOption[]; generalAccount: string }) {
    const confirm = useConfirm();
    const [saving, setSaving] = React.useState<number | null>(null);

    const change = async (service: ServiceRevenueRow, value: string) => {
        if (value === GENERAL) {
            if (!service.rule) return;
            const ok = await confirm({
                title: `Post ${service.name} to the general service revenue?`,
                description: `Its sales synced from now on credit ${generalAccount}. Entries already posted are not changed.`,
                confirmLabel: 'Use general account',
            });
            if (!ok) return;
            setSaving(service.optical_service_id);
            router.delete(`/integration/optical/rules/services/${service.rule.id}`, { preserveScroll: true, onFinish: () => setSaving(null) });
            return;
        }

        const account = revenueAccounts.find((a) => String(a.id) === value);
        const ok = await confirm({
            title: `Post ${service.name} to its own revenue account?`,
            description: `Its sales synced from now on credit ${account ? `${account.code} — ${account.name}` : 'the chosen account'}. Entries already posted are not changed.`,
            confirmLabel: 'Save',
        });
        if (!ok) return;
        setSaving(service.optical_service_id);
        router.post(
            '/integration/optical/rules/services',
            { optical_service_id: service.optical_service_id, service_name: service.name, credit_account_id: Number(value) },
            { preserveScroll: true, onFinish: () => setSaving(null) },
        );
    };

    return (
        <section className="rounded-xl border">
            <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">Revenue by service</h2>
                <p className="text-sm text-muted-foreground">
                    Give an optical service its own revenue account. Add the account in the Chart of Accounts first; services left on the general
                    account post to {generalAccount}.
                </p>
            </div>
            {services.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">The optical POS could not be reached, and no service has its own account yet.</p>
            ) : (
                <ul className="divide-y">
                    {services.map((service) => (
                        <li key={service.optical_service_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                    {service.name}
                                    {!service.is_active && <span className="ml-2 text-xs font-normal text-muted-foreground">(removed in the optical POS)</span>}
                                </p>
                                {service.billed_by && (
                                    <p className="text-xs text-muted-foreground">
                                        Billed by {service.billed_by === 'jam_opticus' ? 'JAM Opticus' : 'the branch clinic'}
                                    </p>
                                )}
                            </div>
                            <Select
                                value={service.rule ? String(service.rule.credit_account_id) : GENERAL}
                                onValueChange={(value) => change(service, value)}
                                disabled={saving === service.optical_service_id}
                            >
                                <SelectTrigger className="w-full sm:w-80" aria-label={`Revenue account for ${service.name}`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={GENERAL}>General service revenue ({generalAccount})</SelectItem>
                                    {revenueAccounts.map((account) => (
                                        <SelectItem key={account.id} value={String(account.id)}>
                                            {account.code} — {account.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default function OpticalRulesPage({ rules, accounts, services, revenueAccounts }: Props) {
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
                    description="The accounts this entity's optical sync posts to: deposits, sales, discounts, VAT, related-entity settlements, cost of goods sold and stock events."
                />

                <DataTable title="Optical Posting Rules" description="These rules map sync events to chart-of-accounts entries." columns={columns} data={rules} emptyTitle="No posting rules yet" />

                <ServiceRevenue
                    services={services}
                    revenueAccounts={revenueAccounts}
                    generalAccount={(() => {
                        const credit = rules.find((rule) => rule.event === 'sale_service')?.credit_account;
                        return credit ? `${credit.code} — ${credit.name}` : 'the service sale rule';
                    })()}
                />
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
