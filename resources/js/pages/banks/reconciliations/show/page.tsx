import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { StatusBadge } from '@/components/finance/status-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/finance/tabs';
import InputError from '@/components/input-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import AppLayout from '@/layouts/app-layout';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { Auth } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { CheckCircle2Icon, InfoIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';

type Item = {
    id: number;
    txn_date: string;
    description: string;
    reference: string | null;
    direction: 'in' | 'out';
    amount: string;
    is_cleared: boolean;
    bank_reconciliation_id: number | null;
    source_type: string | null;
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
    bank_account: { id: number; code: string; name: string; bank_name: string };
    reconciled_by?: { name: string } | null;
};
type Props = { reconciliation: Reconciliation; items: Item[]; laterUnclearedCount: number };

export default function ReconciliationWorkspace({ reconciliation: rec, items, laterUnclearedCount }: Props) {
    const { auth, errors } = usePage<{ auth: Auth; errors: Record<string, string> }>().props;
    const editable = rec.status === 'open' && hasPermission(auth, 'banks.reconcile');
    const [tab, setTab] = useState<'all' | 'in' | 'out'>('all');
    const [busy, setBusy] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);
    const [completeOpen, setCompleteOpen] = useState(false);

    const cleared = (i: Item) => i.is_cleared && i.bank_reconciliation_id === rec.id;
    const visible = useMemo(() => items.filter((i) => tab === 'all' || i.direction === tab), [items, tab]);

    const totals = useMemo(() => {
        const sum = (list: Item[]) => list.reduce((s, i) => s + Number(i.amount), 0);
        const deposits = items.filter((i) => i.direction === 'in' && cleared(i));
        const payments = items.filter((i) => i.direction === 'out' && cleared(i));
        return { deposits: sum(deposits), depositCount: deposits.length, payments: sum(payments), paymentCount: payments.length };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items]);

    const difference = Number(rec.difference);
    const balanced = Math.abs(difference) < 0.005;

    const toggle = (ids: number[], value: boolean) => {
        if (!editable || ids.length === 0) return;
        setBusy(true);
        router.post(
            `/banks/reconciliations/${rec.id}/items`,
            { ids, cleared: value },
            { preserveScroll: true, preserveState: true, onFinish: () => setBusy(false) },
        );
    };

    const allVisibleCleared = visible.length > 0 && visible.every(cleared);

    return (
        <AppLayout
            breadcrumbs={[
                { title: 'Reconciliations', href: '/banks/reconciliations' },
                { title: `${rec.bank_account.code} · ${formatDate(rec.statement_date)}`, href: `/banks/reconciliations/${rec.id}` },
            ]}
        >
            <Head title={`Reconcile ${rec.bank_account.name}`} />
            <PageBody>
                <PageHeader
                    title={`Reconcile ${rec.bank_account.name}`}
                    description={
                        <span className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={rec.status} />
                            <span>Statement ending {formatDate(rec.statement_date)}</span>
                            {rec.reconciled_by && <span>· reconciled by {rec.reconciled_by.name}</span>}
                        </span>
                    }
                    actions={
                        editable && (
                            <>
                                <Button variant="outline" onClick={() => setDiscardOpen(true)}>
                                    <Trash2Icon className="size-4" />
                                    Discard
                                </Button>
                                <Button disabled={!balanced || busy} onClick={() => setCompleteOpen(true)}>
                                    <CheckCircle2Icon className="size-4" />
                                    Complete reconciliation
                                </Button>
                            </>
                        )
                    }
                />

                {/* The running equation, always visible while ticking items. */}
                <Card className="py-0">
                    <CardContent className="grid divide-y p-0 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
                        <Figure label="Beginning balance" value={rec.beginning_balance} />
                        <Figure label={`+ Cleared deposits (${totals.depositCount})`} value={totals.deposits} />
                        <Figure label={`− Cleared payments (${totals.paymentCount})`} value={totals.payments} />
                        <Figure label="= Cleared balance" value={rec.cleared_balance} strong />
                        <div className={cn('flex flex-col justify-center gap-1 p-4', balanced ? 'bg-emerald-500/10' : 'bg-red-500/10')}>
                            <span className="text-muted-foreground text-xs">
                                Difference vs statement {formatAmount(rec.statement_ending_balance)}
                            </span>
                            <span
                                className={cn(
                                    'font-mono text-2xl font-semibold tabular-nums',
                                    balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                                )}
                            >
                                {formatAmount(difference)}
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <InputError message={errors.difference} />

                {editable && laterUnclearedCount > 0 && (
                    <Alert>
                        <InfoIcon className="size-4" />
                        <AlertDescription className="text-xs">
                            {laterUnclearedCount} uncleared item{laterUnclearedCount === 1 ? ' is' : 's are'} dated after the statement date and will
                            appear on a later statement.
                        </AlertDescription>
                    </Alert>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                        <TabsList>
                            <TabsTrigger value="all">All ({items.length})</TabsTrigger>
                            <TabsTrigger value="in">Deposits ({items.filter((i) => i.direction === 'in').length})</TabsTrigger>
                            <TabsTrigger value="out">Payments ({items.filter((i) => i.direction === 'out').length})</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    {editable && (
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || visible.length === 0}
                            onClick={() =>
                                toggle(
                                    visible.filter((i) => cleared(i) === allVisibleCleared).map((i) => i.id),
                                    !allVisibleCleared,
                                )
                            }
                        >
                            {allVisibleCleared ? 'Untick all shown' : 'Tick all shown'}
                        </Button>
                    )}
                </div>

                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">Cleared</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Deposit</TableHead>
                                <TableHead className="text-right">Payment</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {visible.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                                        No register items up to the statement date.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                visible.map((i) => {
                                    const isCleared = cleared(i);
                                    return (
                                        <TableRow
                                            key={i.id}
                                            className={cn(editable && 'cursor-pointer', isCleared && 'bg-emerald-500/5')}
                                            onClick={() => toggle([i.id], !isCleared)}
                                        >
                                            <TableCell onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={isCleared}
                                                    disabled={!editable || busy}
                                                    onCheckedChange={(v) => toggle([i.id], v === true)}
                                                    aria-label={`Mark ${i.description} cleared`}
                                                />
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">{formatDate(i.txn_date)}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{i.description}</div>
                                                {i.reference && <div className="text-muted-foreground font-mono text-xs">{i.reference}</div>}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {i.direction === 'in' ? formatAmount(i.amount) : ''}
                                            </TableCell>
                                            <TableCell className="text-right font-mono tabular-nums">
                                                {i.direction === 'out' ? formatAmount(i.amount) : ''}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </TableShell>
            </PageBody>

            <ConfirmDialog
                open={discardOpen}
                onOpenChange={setDiscardOpen}
                title="Discard this reconciliation?"
                description="All ticked items go back to uncleared. You can start the statement again later."
                confirmLabel="Discard"
                variant="destructive"
                onConfirm={() => router.delete(`/banks/reconciliations/${rec.id}`)}
            />
            <ConfirmDialog
                open={completeOpen}
                onOpenChange={setCompleteOpen}
                title="Complete this reconciliation?"
                description={`The ticked items are marked cleared against the statement ending ${formatDate(rec.statement_date)} and the reconciliation is locked.`}
                confirmLabel="Complete reconciliation"
                onConfirm={() => router.post(`/banks/reconciliations/${rec.id}/complete`)}
            />
        </AppLayout>
    );
}

function Figure({ label, value, strong }: { label: string; value: number | string; strong?: boolean }) {
    return (
        <div className="flex flex-col justify-center gap-1 p-4">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className={cn('font-mono tabular-nums', strong ? 'text-xl font-semibold' : 'text-lg')}>{formatAmount(value)}</span>
        </div>
    );
}
