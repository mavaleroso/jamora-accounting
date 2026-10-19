import { ListTable, TableCard, TableEmpty } from '@/components/data-table';
import { formatAmount, formatDate, todayIso } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import { StatusBadge } from '@/components/finance/status-badge';
import InputError from '@/components/input-error';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import { hasPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { ArrowRightIcon, PlayIcon } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Reconciliations', href: '/banks/reconciliations' }];

type AccountBoard = {
    id: number;
    code: string;
    name: string;
    bank_name: string;
    last_reconciled_date: string | null;
    last_reconciled_balance: number | null;
    open_reconciliation_id: number | null;
    uncleared_count: number;
};
type Reconciliation = {
    id: number;
    statement_date: string;
    beginning_balance: string;
    statement_ending_balance: string;
    cleared_balance: string;
    difference: string;
    status: string;
    reconciled_at: string | null;
    bank_account?: { id: number; code: string; name: string } | null;
    reconciled_by?: { id: number; name: string } | null;
};
type Props = { reconciliations: Paginated<Reconciliation>; accounts: AccountBoard[]; filters: { bank_account_id: number | null } };

export default function ReconciliationsPage({ reconciliations, accounts, filters }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canReconcile = hasPermission(auth, 'banks.reconcile');
    const [starting, setStarting] = useState<AccountBoard | null>(null);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bank Reconciliations" />
            <PageBody>
                <PageHeader
                    title="Bank Reconciliations"
                    description="Match each account to its bank statement: enter the ending balance, tick the cleared items, and complete when the difference is zero."
                />

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {accounts.map((a) => (
                        <Card key={a.id} className={`gap-3 ${filters.bank_account_id === a.id ? 'ring-primary ring-2' : ''}`}>
                            <CardHeader className="flex flex-row items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <CardTitle className="truncate text-base">{a.name}</CardTitle>
                                    <p className="text-muted-foreground font-mono text-xs">
                                        {a.code} · {a.bank_name}
                                    </p>
                                </div>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-3 text-sm">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <div className="text-muted-foreground text-xs">Reconciled through</div>
                                        <div className="font-medium">
                                            {a.last_reconciled_date ? (
                                                formatDate(a.last_reconciled_date)
                                            ) : (
                                                <span className="text-amber-600 dark:text-amber-400">Never</span>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground text-xs">Statement balance</div>
                                        <div className="font-mono tabular-nums">
                                            {a.last_reconciled_balance != null ? formatAmount(a.last_reconciled_balance) : '—'}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-muted-foreground text-xs">
                                    {a.uncleared_count} uncleared item{a.uncleared_count === 1 ? '' : 's'} on the register
                                </div>
                                {a.open_reconciliation_id ? (
                                    <Button size="sm" asChild>
                                        <Link href={`/banks/reconciliations/${a.open_reconciliation_id}`}>
                                            Continue reconciliation
                                            <ArrowRightIcon className="size-4" />
                                        </Link>
                                    </Button>
                                ) : (
                                    canReconcile && (
                                        <Button size="sm" variant="outline" onClick={() => setStarting(a)}>
                                            <PlayIcon className="size-4" />
                                            Start new statement
                                        </Button>
                                    )
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>

                <TableCard
                    title="History"
                    description="Completed and in-progress reconciliations, newest first."
                    actions={
                        filters.bank_account_id && (
                            <Button variant="ghost" size="sm" onClick={() => router.get('/banks/reconciliations')}>
                                Show all accounts
                            </Button>
                        )
                    }
                >
                    <ListTable
                        rows={reconciliations.data}
                        rowKey={(r) => r.id}
                        sequenceStart={reconciliations.from ?? 1}
                        onRowClick={(r) => router.visit(`/banks/reconciliations/${r.id}`)}
                        rowAccent={(r) => (Math.abs(Number(r.difference)) >= 0.005 ? 'bg-red-500' : 'bg-emerald-500')}
                        columns={[
                            { id: 'account', header: 'Account', className: 'font-medium', cell: (r) => (r.bank_account ? `${r.bank_account.code} · ${r.bank_account.name}` : '—') },
                            { id: 'date', header: 'Statement date', className: 'whitespace-nowrap', cell: (r) => formatDate(r.statement_date) },
                            { id: 'beginning', header: 'Beginning', align: 'right', minScreen: 'xl', className: 'font-mono tabular-nums', cell: (r) => formatAmount(r.beginning_balance) },
                            { id: 'ending', header: 'Statement ending', align: 'right', minScreen: 'lg', className: 'font-mono tabular-nums', cell: (r) => formatAmount(r.statement_ending_balance) },
                            { id: 'cleared', header: 'Cleared balance', align: 'right', minScreen: 'lg', className: 'font-mono tabular-nums', cell: (r) => formatAmount(r.cleared_balance) },
                            {
                                id: 'difference',
                                header: 'Difference',
                                align: 'right',
                                cell: (r) => (
                                    <span className={`font-mono tabular-nums ${Math.abs(Number(r.difference)) >= 0.005 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                        {formatAmount(r.difference)}
                                    </span>
                                ),
                            },
                            { id: 'status', header: 'Status', cell: (r) => <StatusBadge status={r.status} /> },
                            { id: 'by', header: 'Reconciled by', minScreen: 'xl', className: 'text-sm text-muted-foreground', cell: (r) => r.reconciled_by?.name ?? '—' },
                        ]}
                        mobileRow={(r) => (
                            <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium">{r.bank_account ? r.bank_account.name : '—'}</span>
                                    <StatusBadge status={r.status} />
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {formatDate(r.statement_date)} · difference {formatAmount(r.difference)}
                                </div>
                            </div>
                        )}
                        empty={<TableEmpty title="No reconciliations yet" description="Start one from a bank account card above." />}
                    />
                    <Paginator page={reconciliations} />
                </TableCard>
            </PageBody>

            {starting && <StartDialog account={starting} onClose={() => setStarting(null)} />}
        </AppLayout>
    );
}

function StartDialog({ account, onClose }: { account: AccountBoard; onClose: () => void }) {
    const form = useForm({ bank_account_id: account.id, statement_date: todayIso(), statement_ending_balance: '' });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <form
                    className="grid gap-4"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await confirm({
                            title: `Start a reconciliation for ${account.name}?`,
                            description: `A statement dated ${data.statement_date} with an ending balance of ${formatAmount(Number(data.statement_ending_balance) || 0, { currency: true })} is opened for ticking. You can discard it later.`,
                            confirmLabel: 'Start reconciliation',
                        });
                        if (!ok) return;
                        form.post('/banks/reconciliations');
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>New statement · {account.name}</DialogTitle>
                        <DialogDescription>
                            Beginning balance carries over from the last reconciled statement (
                            {account.last_reconciled_balance != null ? formatAmount(account.last_reconciled_balance) : '0.00'}).
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label>Statement ending date *</Label>
                        <Input type="date" value={data.statement_date} onChange={(e) => setData('statement_date', e.target.value)} />
                        <InputError message={errors.statement_date} />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>Statement ending balance *</Label>
                        <Input
                            type="number"
                            step="0.01"
                            value={data.statement_ending_balance}
                            onChange={(e) => setData('statement_ending_balance', e.target.value)}
                            className="text-right font-mono"
                            placeholder="0.00"
                        />
                        <InputError message={errors.statement_ending_balance || errors.bank_account_id} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            Start reconciling
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
