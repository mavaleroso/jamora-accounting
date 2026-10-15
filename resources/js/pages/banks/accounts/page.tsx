import { formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import InputError from '@/components/input-error';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { hasPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { ArrowDownLeftIcon, ArrowUpRightIcon, LandmarkIcon, PencilIcon, PlusIcon, ScaleIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Bank Accounts', href: '/banks/accounts' }];

type Entity = { id: number; code: string; name: string };
type Account = {
    id: number;
    code: string;
    name: string;
    bank_name: string;
    account_number: string | null;
    is_shared: boolean;
    is_active: boolean;
    gl_account_id: number | null;
    gl_account: { id: number; code: string; name: string } | null;
    entities: Entity[];
    book_balance: number;
    entity_balance: number;
    inflows_mtd: number;
    outflows_mtd: number;
    uncleared_count: number;
    last_reconciled_date: string | null;
};
type Props = {
    bankAccounts: Account[];
    entities: Entity[];
    glAccounts: { id: number; code: string; name: string }[];
    currentEntityId: number | null;
};

export default function BankAccountsPage({ bankAccounts, entities, glAccounts, currentEntityId }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canManage = hasPermission(auth, 'banks.manage');
    const [editing, setEditing] = useState<Account | null | 'new'>(null);

    const total = bankAccounts.reduce((s, a) => s + a.book_balance, 0);
    const inflows = bankAccounts.reduce((s, a) => s + a.inflows_mtd, 0);
    const outflows = bankAccounts.reduce((s, a) => s + a.outflows_mtd, 0);
    const uncleared = bankAccounts.reduce((s, a) => s + a.uncleared_count, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bank Accounts" />
            <PageBody>
                <PageHeader
                    title="Bank Accounts"
                    description="Cash position per account. Shared accounts show the whole balance and this entity's share of it."
                    actions={
                        canManage && (
                            <Button onClick={() => setEditing('new')}>
                                <PlusIcon className="size-4" />
                                Add account
                            </Button>
                        )
                    }
                />

                <StatGrid>
                    <StatCard
                        title="Total book balance"
                        value={formatPhpCurrency(total)}
                        icon={LandmarkIcon}
                        description={`${bankAccounts.length} account${bankAccounts.length === 1 ? '' : 's'}`}
                    />
                    <StatCard title="Receipts this month" value={formatPhpCurrency(inflows)} icon={ArrowDownLeftIcon} tone="success" />
                    <StatCard title="Disbursements this month" value={formatPhpCurrency(outflows)} icon={ArrowUpRightIcon} tone="warning" />
                    <StatCard
                        title="Uncleared items"
                        value={uncleared.toLocaleString()}
                        icon={ScaleIcon}
                        tone={uncleared ? 'info' : 'success'}
                        href="/banks/reconciliations"
                        description="Awaiting reconciliation"
                    />
                </StatGrid>

                {bankAccounts.length === 0 ? (
                    <Card>
                        <CardContent className="text-muted-foreground py-12 text-center text-sm">
                            No bank accounts are assigned to this entity yet.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                        {bankAccounts.map((a) => (
                            <Card key={a.id} className={a.is_active ? 'gap-4' : 'gap-4 opacity-60'}>
                                <CardHeader className="flex flex-row items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="truncate text-base">{a.name}</CardTitle>
                                            <Badge variant={a.is_shared ? 'default' : 'secondary'} className="shrink-0">
                                                {a.is_shared ? 'Shared' : 'Dedicated'}
                                            </Badge>
                                            {!a.is_active && <Badge variant="outline">Inactive</Badge>}
                                        </div>
                                        <p className="text-muted-foreground font-mono text-xs">
                                            {a.code} · {a.bank_name} {a.account_number ? `· ****${a.account_number.slice(-4)}` : ''}
                                        </p>
                                    </div>
                                    {canManage && (
                                        <Button variant="ghost" size="icon" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`}>
                                            <PencilIcon className="size-4" />
                                        </Button>
                                    )}
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    <div>
                                        <div className="text-muted-foreground text-xs">Book balance</div>
                                        <div className="font-mono text-2xl font-semibold tabular-nums">{formatPhpCurrency(a.book_balance)}</div>
                                        {a.is_shared && (
                                            <div className="text-muted-foreground text-xs">
                                                This entity's share:{' '}
                                                <span className="text-foreground font-mono">{formatAmount(a.entity_balance)}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <div className="text-muted-foreground text-xs">In (MTD)</div>
                                            <div className="font-mono text-emerald-600 tabular-nums dark:text-emerald-400">
                                                +{formatAmount(a.inflows_mtd)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Out (MTD)</div>
                                            <div className="font-mono tabular-nums">−{formatAmount(a.outflows_mtd)}</div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Last reconciled</div>
                                            <div>
                                                {a.last_reconciled_date ? (
                                                    formatDate(a.last_reconciled_date)
                                                ) : (
                                                    <span className="text-amber-600 dark:text-amber-400">Never</span>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground text-xs">Uncleared</div>
                                            <div>{a.uncleared_count}</div>
                                        </div>
                                    </div>
                                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                                        <UsersIcon className="size-3.5" />
                                        {a.entities.map((e) => e.name).join(', ') || 'No entities'}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" asChild className="flex-1">
                                            <Link href={`/banks/accounts/${a.id}`}>View register</Link>
                                        </Button>
                                        <Button variant="outline" size="sm" asChild className="flex-1">
                                            <Link href={`/banks/reconciliations?bank_account_id=${a.id}`}>Reconcile</Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </PageBody>

            {editing && (
                <AccountDialog
                    account={editing === 'new' ? null : editing}
                    entities={entities}
                    glAccounts={glAccounts}
                    currentEntityId={currentEntityId}
                    onClose={() => setEditing(null)}
                />
            )}
        </AppLayout>
    );
}

function AccountDialog({
    account,
    entities,
    glAccounts,
    currentEntityId,
    onClose,
}: {
    account: Account | null;
    entities: Entity[];
    glAccounts: { id: number; code: string; name: string }[];
    currentEntityId: number | null;
    onClose: () => void;
}) {
    const form = useForm({
        code: account?.code ?? '',
        name: account?.name ?? '',
        bank_name: account?.bank_name ?? '',
        account_number: account?.account_number ?? '',
        gl_account_id: account?.gl_account_id ? String(account.gl_account_id) : '',
        is_active: account?.is_active ?? true,
        entity_ids: account ? account.entities.map((e) => e.id) : currentEntityId ? [currentEntityId] : [],
    });
    const { data, setData, errors, processing } = form;
    const toggleEntity = (id: number, on: boolean) => setData('entity_ids', on ? [...data.entity_ids, id] : data.entity_ids.filter((x) => x !== id));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({ ...d, gl_account_id: d.gl_account_id || null }));
        const options = { preserveScroll: true, onSuccess: onClose };
        if (account) form.put(`/banks/accounts/${account.id}`, options);
        else form.post('/banks/accounts', options);
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>{account ? `Edit ${account.name}` : 'Add bank account'}</DialogTitle>
                        <DialogDescription>Accounts used by more than one entity are treated as shared.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label>Code *</Label>
                            <Input value={data.code} onChange={(e) => setData('code', e.target.value)} className="font-mono" placeholder="BDO-OPS" />
                            <InputError message={errors.code} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Bank *</Label>
                            <Input value={data.bank_name} onChange={(e) => setData('bank_name', e.target.value)} placeholder="BDO Unibank" />
                            <InputError message={errors.bank_name} />
                        </div>
                        <div className="grid gap-1.5 sm:col-span-2">
                            <Label>Account name *</Label>
                            <Input value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="Operating — Current" />
                            <InputError message={errors.name} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Account number</Label>
                            <Input value={data.account_number} onChange={(e) => setData('account_number', e.target.value)} className="font-mono" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>GL account</Label>
                            <Select value={data.gl_account_id} onValueChange={(v) => setData('gl_account_id', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="1010 · Cash in Bank" />
                                </SelectTrigger>
                                <SelectContent>
                                    {glAccounts.map((g) => (
                                        <SelectItem key={g.id} value={String(g.id)}>
                                            {g.code} · {g.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-2">
                        <Label>Used by *</Label>
                        <div className="grid gap-2 rounded-lg border p-3">
                            {entities.map((e) => (
                                <label key={e.id} className="flex items-center gap-2 text-sm">
                                    <Checkbox checked={data.entity_ids.includes(e.id)} onCheckedChange={(v) => toggleEntity(e.id, v === true)} />
                                    {e.name}
                                </label>
                            ))}
                        </div>
                        <p className="text-muted-foreground text-xs">
                            {data.entity_ids.length > 1 ? 'Shared account — every disbursement must be tagged to an entity.' : 'Dedicated account.'}
                        </p>
                        <InputError message={errors.entity_ids} />
                    </div>
                    <label className="flex items-center justify-between text-sm">
                        Active
                        <Switch checked={data.is_active} onCheckedChange={(v) => setData('is_active', v)} />
                    </label>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {account ? 'Save changes' : 'Add account'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
