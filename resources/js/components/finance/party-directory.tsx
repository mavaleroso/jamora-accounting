import { ListTable, TableCard, TableEmpty } from '@/components/data-table';
import { ConfirmDialog, useConfirm } from '@/components/confirm-dialog';
import { FilterBar, type FilterSelect } from '@/components/finance/filter-bar';
import { formatAmount } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import InputError from '@/components/input-error';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatPhpCurrency } from '@/lib/currency';
import { Link, router, useForm } from '@inertiajs/react';
import { CircleDollarSignIcon, MoreHorizontalIcon, PlusIcon, UserCheckIcon, UsersIcon, WalletIcon } from 'lucide-react';
import { useState } from 'react';

export type Party = {
    id: number;
    code: string;
    name: string;
    type?: string;
    tin: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    is_active: boolean;
    open_balance: string | number | null;
    open_invoices: number;
};

type Config = {
    noun: string; // "customer" / "supplier"
    title: string;
    description: string;
    baseUrl: string;
    documentsUrl: (party: Party) => string;
    documentNoun: string; // "invoice" / "bill"
    balanceLabel: string; // "Receivable" / "Payable"
    types?: { value: string; label: string }[];
};

type Props = {
    config: Config;
    parties: Paginated<Party>;
    filters: Record<string, string | null>;
    summary: { total: number; active: number; withBalance: number; outstanding: number };
};

/** Customer and supplier master files share one layout: directory, balances and a create/edit form. */
export function PartyDirectory({ config, parties, filters, summary }: Props) {
    const [editing, setEditing] = useState<Party | 'new' | null>(null);
    const [deleting, setDeleting] = useState<Party | null>(null);

    const selects: FilterSelect[] = [
        ...(config.types ? [{ key: 'type', label: 'Types', options: config.types }] : []),
        {
            key: 'status',
            label: 'Statuses',
            options: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
            ],
        },
    ];
    const typeLabel = (t?: string) => config.types?.find((x) => x.value === t)?.label ?? t;

    return (
        <PageBody>
            <PageHeader
                title={config.title}
                description={config.description}
                actions={
                    <Button onClick={() => setEditing('new')}>
                        <PlusIcon className="size-4" />
                        Add {config.noun}
                    </Button>
                }
            />

            <StatGrid>
                <StatCard title={`${config.noun}s`} value={summary.total.toLocaleString()} icon={UsersIcon} />
                <StatCard title="Active" value={summary.active.toLocaleString()} icon={UserCheckIcon} tone="success" />
                <StatCard
                    title={`With open ${config.documentNoun}s`}
                    value={summary.withBalance.toLocaleString()}
                    icon={CircleDollarSignIcon}
                    tone="info"
                />
                <StatCard
                    title={`Total ${config.balanceLabel.toLowerCase()}`}
                    value={formatPhpCurrency(summary.outstanding)}
                    icon={WalletIcon}
                    tone="warning"
                />
            </StatGrid>

            <TableCard>
                <FilterBar url={config.baseUrl} filters={filters} searchPlaceholder="Name, code or TIN" selects={selects} />
                <ListTable
                    rows={parties.data}
                    rowKey={(p) => p.id}
                    sequenceStart={parties.from ?? 1}
                    onRowClick={(p) => setEditing(p)}
                    rowClassName={(p) => (p.is_active ? undefined : 'opacity-60')}
                    actions={(p) => (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${p.name}`}>
                                    <MoreHorizontalIcon className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuItem onClick={() => setEditing(p)}>Edit</DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                    <Link href={config.documentsUrl(p)}>View {config.documentNoun}s</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(p)}>
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                    columns={[
                        {
                            id: 'name',
                            header: 'Name',
                            cell: (p) => (
                                <>
                                    <div className="font-medium">{p.name}</div>
                                    <div className="font-mono text-xs text-muted-foreground">{p.code}</div>
                                </>
                            ),
                        },
                        ...(config.types
                            ? [
                                  {
                                      id: 'type',
                                      header: 'Type',
                                      cell: (p: Party) => (
                                          <Badge variant="outline" className="font-normal">
                                              {typeLabel(p.type)}
                                          </Badge>
                                      ),
                                  },
                              ]
                            : []),
                        { id: 'tin', header: 'TIN', minScreen: 'lg', className: 'font-mono text-xs', cell: (p) => p.tin || '—' },
                        {
                            id: 'contact',
                            header: 'Contact',
                            minScreen: 'lg',
                            className: 'text-sm',
                            cell: (p) => (
                                <>
                                    <div>{p.phone || '—'}</div>
                                    {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                                </>
                            ),
                        },
                        { id: 'status', header: 'Status', cell: (p) => <Badge variant={p.is_active ? 'secondary' : 'outline'}>{p.is_active ? 'Active' : 'Inactive'}</Badge> },
                        {
                            id: 'balance',
                            header: config.balanceLabel,
                            align: 'right',
                            cell: (p) => (
                                <>
                                    {Number(p.open_balance) > 0 ? (
                                        <Link href={config.documentsUrl(p)} onClick={(e) => e.stopPropagation()} className="font-mono tabular-nums hover:text-primary hover:underline">
                                            {formatAmount(p.open_balance)}
                                        </Link>
                                    ) : (
                                        <span className="font-mono text-muted-foreground tabular-nums">0.00</span>
                                    )}
                                    {p.open_invoices > 0 && (
                                        <div className="text-xs text-muted-foreground">
                                            {p.open_invoices} open {config.documentNoun}
                                            {p.open_invoices === 1 ? '' : 's'}
                                        </div>
                                    )}
                                </>
                            ),
                        },
                    ]}
                    mobileRow={(p) => (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">{p.name}</span>
                                <span className="font-mono text-sm tabular-nums">{formatAmount(p.open_balance ?? 0)}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                <span className="font-mono">{p.code}</span>
                                <Badge variant={p.is_active ? 'secondary' : 'outline'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                            </div>
                        </div>
                    )}
                    empty={
                        <TableEmpty
                            icon={UsersIcon}
                            title={`No ${config.noun}s match these filters`}
                            description="Try a different search or status."
                            action={
                                <Button size="sm" onClick={() => setEditing('new')}>
                                    <PlusIcon className="size-4" /> Add {config.noun}
                                </Button>
                            }
                        />
                    }
                />
                <Paginator page={parties} />
            </TableCard>

            {editing && <PartyDialog config={config} party={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
            <ConfirmDialog
                open={!!deleting}
                onOpenChange={(o) => !o && setDeleting(null)}
                title={`Delete ${deleting?.name}?`}
                description={`${config.noun[0].toUpperCase()}${config.noun.slice(1)}s with ${config.documentNoun}s cannot be deleted — mark them inactive instead.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={() =>
                    deleting && router.delete(`${config.baseUrl}/${deleting.id}`, { preserveScroll: true, onFinish: () => setDeleting(null) })
                }
            />
        </PageBody>
    );
}

function PartyDialog({ config, party, onClose }: { config: Config; party: Party | null; onClose: () => void }) {
    const form = useForm({
        code: party?.code ?? '',
        name: party?.name ?? '',
        type: party?.type ?? config.types?.[0]?.value ?? '',
        tin: party?.tin ?? '',
        email: party?.email ?? '',
        phone: party?.phone ?? '',
        address: party?.address ?? '',
        is_active: party?.is_active ?? true,
    });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!party) {
            const ok = await confirm({
                title: `Add this ${config.noun.toLowerCase()}?`,
                description: `${data.name || `The new ${config.noun.toLowerCase()}`} will be added to the directory.`,
                confirmLabel: `Add ${config.noun.toLowerCase()}`,
            });
            if (!ok) return;
        }
        const options = { preserveScroll: true, onSuccess: onClose };
        if (party) form.put(`${config.baseUrl}/${party.id}`, options);
        else form.post(config.baseUrl, options);
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>{party ? `Edit ${party.name}` : `Add ${config.noun}`}</DialogTitle>
                        <DialogDescription>The TIN appears on BIR-supporting reports.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <div className="grid gap-1.5">
                            <Label>Code *</Label>
                            <Input value={data.code} onChange={(e) => setData('code', e.target.value)} className="font-mono" />
                            <InputError message={errors.code} />
                        </div>
                        <div className="grid gap-1.5 sm:col-span-2">
                            <Label>Name *</Label>
                            <Input value={data.name} onChange={(e) => setData('name', e.target.value)} />
                            <InputError message={errors.name} />
                        </div>
                        {config.types && (
                            <div className="grid gap-1.5">
                                <Label>Type *</Label>
                                <Select value={data.type} onValueChange={(v) => setData('type', v)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {config.types.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>
                                                {t.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <div className={`grid gap-1.5 ${config.types ? 'sm:col-span-2' : 'sm:col-span-3'}`}>
                            <Label>TIN</Label>
                            <Input
                                value={data.tin}
                                onChange={(e) => setData('tin', e.target.value)}
                                className="font-mono"
                                placeholder="000-000-000-00000"
                            />
                            <InputError message={errors.tin} />
                        </div>
                        <div className="grid gap-1.5 sm:col-span-2">
                            <Label>Email</Label>
                            <Input type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} />
                            <InputError message={errors.email} />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>Phone</Label>
                            <Input value={data.phone} onChange={(e) => setData('phone', e.target.value)} />
                        </div>
                        <div className="grid gap-1.5 sm:col-span-3">
                            <Label>Address</Label>
                            <Textarea rows={2} value={data.address} onChange={(e) => setData('address', e.target.value)} />
                        </div>
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
                            {party ? 'Save changes' : `Add ${config.noun}`}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
