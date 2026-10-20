import { formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import InputError from '@/components/input-error';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/confirm-dialog';
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
import { cn } from '@/lib/utils';
import { ArrowDownLeftIcon, ArrowUpRightIcon, BookOpenIcon, Building2Icon, LandmarkIcon, PencilIcon, PlusIcon, ScaleIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Bank Accounts', href: '/banks/accounts' }];

/** A company (entity) the user can open. */
type Company = { id: number; code: string; name: string };

/** A company using an account: its own ledger account for it and its share of the register balance. */
type Share = Company & { is_holder: boolean; ledger: { id: number; code: string; name: string } | null; balance: number };

type Account = {
    id: number;
    /** The company holding the account. */
    entity_id: number;
    company: Company | null;
    /** Every company using the account, the holder first. Each posts to its own ledger account for it. */
    companies: Share[];
    is_shared: boolean;
    code: string;
    name: string;
    bank_name: string;
    account_number: string | null;
    is_active: boolean;
    gl_account_id: number | null;
    gl_account: { id: number; code: string; name: string } | null;
    book_balance: number;
    inflows_mtd: number;
    outflows_mtd: number;
    uncleared_count: number;
    last_reconciled_date: string | null;
};
/** A Cash in Bank ledger account of one company. */
type LedgerOption = { id: number; entity_id: number; code: string; name: string };

type Props = {
    /** The accounts held or shared by the companies the user can open. */
    bankAccounts: Account[];
    glAccounts: LedgerOption[];
    companies: Company[];
    /** Where a new account goes unless another company is picked. */
    currentCompanyId: number | null;
};

const ALL = 'all';

export default function BankAccountsPage({ bankAccounts, glAccounts, companies, currentCompanyId }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canManage = hasPermission(auth, 'banks.manage');
    const [editing, setEditing] = useState<Account | null | 'new'>(null);
    const [company, setCompany] = useState<string>(ALL);

    const uses = (a: Account, id: string) => a.companies.some((c) => String(c.id) === id);
    const shown = company === ALL ? bankAccounts : bankAccounts.filter((a) => uses(a, company));
    const companyLabel = company === ALL ? null : companies.find((c) => String(c.id) === company)?.name;
    // A company's view counts only its own share of a shared account.
    const total = shown.reduce((s, a) => s + (company === ALL ? a.book_balance : (a.companies.find((c) => String(c.id) === company)?.balance ?? 0)), 0);
    const sharedCount = bankAccounts.filter((a) => a.is_shared).length;
    const inflows = shown.reduce((s, a) => s + a.inflows_mtd, 0);
    const outflows = shown.reduce((s, a) => s + a.outflows_mtd, 0);
    const uncleared = shown.reduce((s, a) => s + a.uncleared_count, 0);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bank Accounts" />
            <PageBody>
                <PageHeader
                    title="Bank Accounts"
                    description={`Each account is held by one company and may be shared with another${sharedCount ? ` (${sharedCount} shared)` : ''}. Every company using an account records its own receipts and payments through it, in its own Cash in Bank ledger account, and each register line is tagged with its company.`}
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
                        description={`${shown.length} account${shown.length === 1 ? '' : 's'}${companyLabel ? ` · ${companyLabel}'s share` : ''}`}
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

                {companies.length > 1 && (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by company">
                        {[{ id: ALL, name: 'All companies' }, ...companies.map((c) => ({ id: String(c.id), name: c.name }))].map((c) => {
                            const count = c.id === ALL ? bankAccounts.length : bankAccounts.filter((a) => uses(a, c.id)).length;
                            const active = company === c.id;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setCompany(c.id)}
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                                    )}
                                >
                                    {c.name}
                                    <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-muted-foreground')}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {shown.length === 0 ? (
                    <Card>
                        <CardContent className="text-muted-foreground py-12 text-center text-sm">
                            {companyLabel ? `${companyLabel} has no bank accounts yet.` : 'No bank accounts yet.'}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                        {shown.map((a) => (
                            <Card key={a.id} className={a.is_active ? 'gap-4' : 'gap-4 opacity-60'}>
                                <CardHeader className="flex flex-row items-start justify-between gap-3">
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {a.company && (
                                                <Badge variant="secondary" className="gap-1">
                                                    <Building2Icon className="size-3" />
                                                    {a.company.name}
                                                </Badge>
                                            )}
                                            {a.is_shared ? (
                                                <Badge variant="outline" className="gap-1 border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-300">
                                                    <UsersIcon className="size-3" />
                                                    Shared with {a.companies.filter((c) => !c.is_holder).map((c) => c.name).join(', ')}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline">Dedicated</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="truncate text-base">{a.name}</CardTitle>
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
                                    {a.is_shared ? (
                                        // Each company's share of the balance, recorded in its own ledger account.
                                        <ul className="divide-y rounded-md border text-xs">
                                            {a.companies.map((c) => (
                                                <li key={c.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                                                    <div className="min-w-0">
                                                        <div className="truncate font-medium">{c.name}</div>
                                                        <div className="text-muted-foreground flex items-center gap-1">
                                                            <BookOpenIcon className="size-3" />
                                                            {c.ledger ? <span className="font-mono">{c.ledger.code}</span> : 'No ledger account'}
                                                        </div>
                                                    </div>
                                                    <span className="font-mono tabular-nums">{formatAmount(c.balance)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                                            <BookOpenIcon className="size-3.5" />
                                            {a.gl_account ? (
                                                <span>
                                                    Ledger <span className="font-mono">{a.gl_account.code}</span> · {a.gl_account.name}
                                                </span>
                                            ) : (
                                                'No ledger account linked'
                                            )}
                                        </div>
                                    )}
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
                    glAccounts={glAccounts}
                    companies={companies}
                    defaultCompanyId={company !== ALL ? Number(company) : currentCompanyId}
                    onClose={() => setEditing(null)}
                />
            )}
        </AppLayout>
    );
}

function AccountDialog({
    account,
    glAccounts,
    companies,
    defaultCompanyId,
    onClose,
}: {
    account: Account | null;
    glAccounts: LedgerOption[];
    companies: Company[];
    defaultCompanyId: number | null;
    onClose: () => void;
}) {
    const form = useForm({
        // The holder is picked when the account is added and fixed after: its ledger is in that company's books.
        entity_id: String(account?.entity_id ?? defaultCompanyId ?? ''),
        // Other companies using the account, each through its own ledger account.
        shared_with: (account?.companies ?? []).filter((c) => !c.is_holder).map((c) => String(c.id)),
        code: account?.code ?? '',
        name: account?.name ?? '',
        bank_name: account?.bank_name ?? '',
        account_number: account?.account_number ?? '',
        gl_account_id: account?.gl_account_id ? String(account.gl_account_id) : '',
        is_active: account?.is_active ?? true,
    });
    const { data, setData, errors, processing } = form;
    const owner = companies.find((c) => String(c.id) === data.entity_id)?.name ?? account?.company?.name ?? 'the company';
    const ledgers = glAccounts.filter((g) => String(g.entity_id) === data.entity_id);
    const others = companies.filter((c) => String(c.id) !== data.entity_id);
    const sharers = others.filter((c) => data.shared_with.includes(String(c.id))).map((c) => c.name);
    const toggleShare = (id: string, on: boolean) =>
        setData('shared_with', on ? [...data.shared_with, id] : data.shared_with.filter((s) => s !== id));

    const confirm = useConfirm();
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!account) {
            const ok = await confirm({
                title: 'Add this bank account?',
                description: sharers.length
                    ? `${data.name || 'The new account'}${data.bank_name ? ` (${data.bank_name})` : ''} is held by ${owner} and shared with ${sharers.join(', ')}. Each records its own receipts and payments through it, in its own Cash in Bank ledger account.`
                    : `${data.name || 'The new account'}${data.bank_name ? ` (${data.bank_name})` : ''} is added to ${owner} with its own Cash in Bank ledger account, for ${owner}'s receipts, payments and reconciliations only.`,
                confirmLabel: 'Add bank account',
            });
            if (!ok) return;
        }
        form.transform((d) => ({
            ...d,
            gl_account_id: d.gl_account_id || null,
            shared_with: d.shared_with.filter((s) => s !== d.entity_id).map(Number),
        }));
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
                        <DialogDescription>
                            Held by {owner}
                            {sharers.length ? ` and shared with ${sharers.join(', ')}` : ''}. Each company using it posts to its own ledger account.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5 sm:col-span-2">
                            <Label>Account holder *</Label>
                            <Select
                                value={data.entity_id}
                                disabled={!!account}
                                onValueChange={(v) => setData((d) => ({ ...d, entity_id: v, gl_account_id: '', shared_with: d.shared_with.filter((s) => s !== v) }))}
                            >
                                <SelectTrigger aria-label="Account holder">
                                    <SelectValue placeholder="Choose a company" />
                                </SelectTrigger>
                                <SelectContent>
                                    {companies.map((c) => (
                                        <SelectItem key={c.id} value={String(c.id)}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors.entity_id ? (
                                <InputError message={errors.entity_id} />
                            ) : (
                                account && <p className="text-muted-foreground text-[11px]">Can’t be changed: the account posts to this company’s books.</p>
                            )}
                        </div>
                        {others.length > 0 && (
                            <fieldset className="grid gap-1.5 sm:col-span-2">
                                <legend className="mb-1.5 text-sm font-medium">Shared with</legend>
                                <div className="flex flex-wrap gap-x-5 gap-y-2">
                                    {others.map((c) => (
                                        <label key={c.id} className="flex items-center gap-2 text-sm">
                                            <Checkbox
                                                checked={data.shared_with.includes(String(c.id))}
                                                onCheckedChange={(on) => toggleShare(String(c.id), on === true)}
                                            />
                                            {c.name}
                                        </label>
                                    ))}
                                </div>
                                {errors.shared_with ? (
                                    <InputError message={errors.shared_with} />
                                ) : (
                                    <p className="text-muted-foreground text-[11px]">
                                        Leave all unticked for a dedicated account. A company that has used the account stays shared.
                                    </p>
                                )}
                            </fieldset>
                        )}
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
                            <Label>Ledger account</Label>
                            <Select value={data.gl_account_id} onValueChange={(v) => setData('gl_account_id', v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Create its own (101x)" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ledgers.map((g) => (
                                        <SelectItem key={g.id} value={String(g.id)}>
                                            {g.code} · {g.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <InputError message={errors.gl_account_id} />
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
