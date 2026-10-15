import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
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

            <FilterBar url={config.baseUrl} filters={filters} searchPlaceholder="Name, code or TIN" selects={selects} />

            <TableShell>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            {config.types && <TableHead>Type</TableHead>}
                            <TableHead>TIN</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">{config.balanceLabel}</TableHead>
                            <TableHead className="w-10" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {parties.data.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-muted-foreground h-32 text-center">
                                    No {config.noun}s match these filters.
                                </TableCell>
                            </TableRow>
                        ) : (
                            parties.data.map((p) => (
                                <TableRow key={p.id} className={p.is_active ? '' : 'opacity-60'}>
                                    <TableCell>
                                        <div className="font-medium">{p.name}</div>
                                        <div className="text-muted-foreground font-mono text-xs">{p.code}</div>
                                    </TableCell>
                                    {config.types && (
                                        <TableCell>
                                            <Badge variant="outline" className="font-normal">
                                                {typeLabel(p.type)}
                                            </Badge>
                                        </TableCell>
                                    )}
                                    <TableCell className="font-mono text-xs">{p.tin || '—'}</TableCell>
                                    <TableCell className="text-sm">
                                        <div>{p.phone || '—'}</div>
                                        {p.email && <div className="text-muted-foreground text-xs">{p.email}</div>}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={p.is_active ? 'secondary' : 'outline'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {Number(p.open_balance) > 0 ? (
                                            <Link href={config.documentsUrl(p)} className="hover:text-primary font-mono tabular-nums hover:underline">
                                                {formatAmount(p.open_balance)}
                                            </Link>
                                        ) : (
                                            <span className="text-muted-foreground font-mono tabular-nums">0.00</span>
                                        )}
                                        {p.open_invoices > 0 && (
                                            <div className="text-muted-foreground text-xs">
                                                {p.open_invoices} open {config.documentNoun}
                                                {p.open_invoices === 1 ? '' : 's'}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" aria-label={`Actions for ${p.name}`}>
                                                    <MoreHorizontalIcon className="size-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => setEditing(p)}>Edit</DropdownMenuItem>
                                                <DropdownMenuItem asChild>
                                                    <Link href={config.documentsUrl(p)}>View {config.documentNoun}s</Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(p)}>
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableShell>
            <Paginator page={parties} noun={`${config.noun}s`} />

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

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
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
