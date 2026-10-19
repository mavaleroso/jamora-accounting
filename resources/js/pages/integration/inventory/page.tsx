import { ListTable, TableCard, TableEmpty } from '@/components/data-table';
import { FilterBar } from '@/components/finance/filter-bar';
import { formatAmount, formatDate } from '@/components/finance/format';
import { PageBody, PageHeader } from '@/components/finance/page-header';
import { Paginator, type Paginated } from '@/components/finance/paginator';
import { StatusBadge } from '@/components/finance/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/finance/tabs';
import { StatCard, StatGrid } from '@/components/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { hasAnyPermission } from '@/lib/permissions';
import type { Auth, BreadcrumbItem } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { AlertTriangleIcon, BoxesIcon, ClipboardCheckIcon, InfoIcon, RefreshCwIcon, ScaleIcon, WarehouseIcon } from 'lucide-react';
import { useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Inventory', href: '/integration/inventory' }];

type Movement = {
    id: number;
    occurred_on: string | null;
    movement_reference: string;
    movement_type: string;
    stock_type: string | null;
    product_code: string | null;
    description: string | null;
    counterparty: string | null;
    quantity: number;
    unit_cost: number;
    total_cost: number;
    accounting_link_type: string;
    review_status: 'matched' | 'needs_review' | 'resolved' | 'reversed';
    notes: string | null;
    journal_entry: { id: number; entry_no: string; status: string } | null;
};

type LowStockGroup = {
    stock_type: string;
    brand: string | null;
    code: string | null;
    category: string | null;
    on_hand_count: number;
    on_hand_value?: number;
};

type Stock = {
    on_hand_total: number;
    on_hand_by_type: Record<string, number>;
    value_total: number;
    value_by_type: Record<string, number>;
    low_stock_threshold: number;
    low_stock: LowStockGroup[];
    low_stock_count: number;
    read_at: string | null;
};

type Props = {
    movements: Paginated<Movement>;
    filters: Record<string, string | null>;
    movementTypes: Record<string, string>;
    isStockEntity: boolean;
    stockEntityCode: string;
    stock: Stock | null;
    stockError: string | null;
    kpis: { ledgerValue: number; needsReview: number; matched: number };
};

const linkLabel: Record<string, string> = {
    cogs: 'Cost of goods sold',
    ap_receipt: 'Inventory / GRNI',
    inventory_loss: 'Write-off',
    adjustment: 'Adjustment',
};

const reviewTone: Record<Movement['review_status'], string> = {
    matched: 'bg-emerald-500',
    resolved: 'bg-sky-500',
    needs_review: 'bg-amber-500',
    reversed: 'bg-muted-foreground',
};

export default function InventoryPage({ movements, filters, movementTypes, isStockEntity, stockEntityCode, stock, stockError, kpis }: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canReview = hasAnyPermission(auth, ['integration.optical.sync', 'journals.post', 'journals.create']);
    const [reviewing, setReviewing] = useState<Movement | null>(null);
    const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') ?? 'movements');

    const difference = stock ? Math.round((stock.value_total - kpis.ledgerValue) * 100) / 100 : null;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Inventory" />
            <PageBody>
                <PageHeader
                    title="Inventory"
                    description="Stock is managed in the optical POS. Deliveries, sales, write-offs and returns synced from it post to the books automatically; this screen shows those postings, low-stock alerts and whether stock agrees with the ledger."
                    actions={
                        isStockEntity && (
                            <Button
                                variant="outline"
                                onClick={() => router.get('/integration/inventory', { ...filters, refresh: 1, tab }, { preserveScroll: true })}
                            >
                                <RefreshCwIcon className="size-4" />
                                Refresh stock
                            </Button>
                        )
                    }
                />

                {!isStockEntity && (
                    <Alert>
                        <InfoIcon className="size-4" />
                        <AlertDescription className="text-sm">
                            Optical products are stocked and sold by {stockEntityCode.replaceAll('_', ' ')}; switch to it for stock levels and
                            valuation. This entity's own stock postings, if any, are listed below.
                        </AlertDescription>
                    </Alert>
                )}
                {stockError && (
                    <Alert variant="destructive">
                        <AlertTriangleIcon className="size-4" />
                        <AlertDescription className="text-sm">{stockError}</AlertDescription>
                    </Alert>
                )}

                <StatGrid>
                    <StatCard
                        title="Stock value (optical POS)"
                        value={stock ? formatPhpCurrency(stock.value_total) : '—'}
                        icon={WarehouseIcon}
                        description={stock ? `${stock.on_hand_total.toLocaleString()} items on hand at decoded cost` : 'Not available'}
                    />
                    <StatCard
                        title="Inventory ledger (1200)"
                        value={formatPhpCurrency(kpis.ledgerValue)}
                        icon={ScaleIcon}
                        description="Posted balance"
                    />
                    <StatCard
                        title="Difference"
                        value={difference === null ? '—' : formatPhpCurrency(difference)}
                        icon={ScaleIcon}
                        tone={difference === null ? 'default' : Math.abs(difference) < 0.01 ? 'success' : 'warning'}
                        description={
                            difference === null
                                ? 'Needs the optical stock value'
                                : Math.abs(difference) < 0.01
                                  ? 'Stock agrees with the books'
                                  : 'Stock vs books — see Valuation'
                        }
                    />
                    <StatCard
                        title="Needs review"
                        value={kpis.needsReview.toLocaleString()}
                        icon={ClipboardCheckIcon}
                        tone={kpis.needsReview ? 'warning' : 'success'}
                        description={`${kpis.matched.toLocaleString()} matched to the ledger`}
                    />
                </StatGrid>

                <Tabs value={tab} onValueChange={setTab}>
                    <TabsList>
                        <TabsTrigger value="movements">Stock postings</TabsTrigger>
                        <TabsTrigger value="alerts" disabled={!stock}>
                            Low stock{stock ? ` (${stock.low_stock_count})` : ''}
                        </TabsTrigger>
                        <TabsTrigger value="valuation" disabled={!stock}>
                            Valuation
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="movements">
                        <TableCard>
                            <FilterBar
                                url="/integration/inventory"
                                filters={filters}
                                searchPlaceholder="Reference, item, supplier or customer"
                                selects={[
                                    {
                                        key: 'movement_type',
                                        label: 'Movements',
                                        options: Object.entries(movementTypes).map(([value, label]) => ({ value, label })),
                                    },
                                    {
                                        key: 'review_status',
                                        label: 'Review',
                                        options: [
                                            { value: 'needs_review', label: 'Needs review' },
                                            { value: 'matched', label: 'Matched' },
                                            { value: 'resolved', label: 'Reviewed' },
                                            { value: 'reversed', label: 'Reversed' },
                                        ],
                                    },
                                ]}
                                dateRange={{ from: 'date_from', to: 'date_to' }}
                            />
                            <ListTable
                                rows={movements.data}
                                rowKey={(m) => m.id}
                                sequenceStart={movements.from ?? 1}
                                rowAccent={(m) => reviewTone[m.review_status]}
                                columns={[
                                    { id: 'date', header: 'Date', className: 'whitespace-nowrap', cell: (m) => formatDate(m.occurred_on) },
                                    {
                                        id: 'item',
                                        header: 'Movement',
                                        cell: (m) => (
                                            <>
                                                <div className="max-w-80 truncate font-medium">{m.description || m.movement_reference}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    {movementTypes[m.movement_type] ?? m.movement_type}
                                                    <span className="font-mono"> · {m.movement_reference}</span>
                                                    {m.counterparty && ` · ${m.counterparty}`}
                                                </div>
                                            </>
                                        ),
                                    },
                                    { id: 'qty', header: 'Qty', align: 'right', className: 'font-mono tabular-nums', cell: (m) => m.quantity },
                                    {
                                        id: 'cost',
                                        header: 'Cost',
                                        align: 'right',
                                        className: 'font-mono tabular-nums',
                                        cell: (m) => formatAmount(m.total_cost),
                                    },
                                    {
                                        id: 'ledger',
                                        header: 'Accounting link',
                                        minScreen: 'lg',
                                        className: 'text-sm',
                                        cell: (m) =>
                                            m.journal_entry ? (
                                                <Link
                                                    href={`/accounting/journal-entries/${m.journal_entry.id}`}
                                                    className="text-primary hover:underline"
                                                >
                                                    {linkLabel[m.accounting_link_type] ?? m.accounting_link_type} ·{' '}
                                                    <span className="font-mono">{m.journal_entry.entry_no}</span>
                                                </Link>
                                            ) : (
                                                <span className="text-muted-foreground">Not posted</span>
                                            ),
                                    },
                                    {
                                        id: 'review',
                                        header: 'Review',
                                        cell: (m) => (
                                            <div className="flex flex-col items-start gap-1">
                                                <StatusBadge status={m.review_status === 'resolved' ? 'reviewed' : m.review_status} />
                                                {m.notes && (
                                                    <span className="text-muted-foreground max-w-64 truncate text-xs" title={m.notes}>
                                                        {m.notes}
                                                    </span>
                                                )}
                                            </div>
                                        ),
                                    },
                                ]}
                                actions={(m) =>
                                    canReview && m.review_status === 'needs_review' ? (
                                        <Button size="sm" variant="outline" onClick={() => setReviewing(m)}>
                                            Review
                                        </Button>
                                    ) : null
                                }
                                mobileRow={(m) => (
                                    <div className="space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium">{m.description || m.movement_reference}</span>
                                            <span className="font-mono text-sm tabular-nums">{formatAmount(m.total_cost)}</span>
                                        </div>
                                        <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                                            <StatusBadge status={m.review_status === 'resolved' ? 'reviewed' : m.review_status} />
                                            <span>{formatDate(m.occurred_on)}</span>
                                            <span>· {movementTypes[m.movement_type] ?? m.movement_type}</span>
                                        </div>
                                    </div>
                                )}
                                empty={
                                    <TableEmpty
                                        title="No stock postings yet"
                                        description="Run the optical sync to bring in deliveries, sales and write-offs."
                                    />
                                }
                            />
                            <Paginator page={movements} />
                        </TableCard>
                    </TabsContent>

                    {stock && (
                        <TabsContent value="alerts">
                            <TableCard
                                title="Low stock"
                                description={`Item groups with ${stock.low_stock_threshold} or fewer on hand in the optical POS${stock.read_at ? ` · read ${new Date(stock.read_at).toLocaleString()}` : ''}.`}
                            >
                                <ListTable
                                    rows={stock.low_stock}
                                    rowKey={(g) => `${g.stock_type}-${g.brand}-${g.code}-${g.category}`}
                                    rowAccent={(g) => (g.on_hand_count <= 1 ? 'bg-red-500' : 'bg-amber-500')}
                                    columns={[
                                        { id: 'type', header: 'Type', cell: (g) => <Badge variant="outline">{g.stock_type}</Badge> },
                                        { id: 'brand', header: 'Brand', cell: (g) => g.brand ?? '—' },
                                        { id: 'code', header: 'Code', className: 'font-mono text-xs', cell: (g) => g.code ?? '—' },
                                        { id: 'category', header: 'Category', minScreen: 'md', cell: (g) => g.category ?? '—' },
                                        {
                                            id: 'on_hand',
                                            header: 'On hand',
                                            align: 'right',
                                            className: 'font-mono tabular-nums',
                                            cell: (g) => g.on_hand_count,
                                        },
                                        {
                                            id: 'value',
                                            header: 'Value',
                                            align: 'right',
                                            minScreen: 'md',
                                            className: 'font-mono tabular-nums',
                                            cell: (g) => formatAmount(g.on_hand_value ?? 0),
                                        },
                                    ]}
                                    empty={<TableEmpty title="No low-stock items" description="Every item group is above the reorder level." />}
                                />
                            </TableCard>
                        </TabsContent>
                    )}

                    {stock && (
                        <TabsContent value="valuation">
                            <TableCard
                                title="Stock vs books"
                                description="Optical POS stock on hand at decoded unit cost, compared with the Inventory ledger account."
                            >
                                <div className="grid gap-4 p-4 md:grid-cols-2">
                                    <div className="space-y-2 text-sm">
                                        {Object.entries(stock.value_by_type).map(([type, value]) => (
                                            <div key={type} className="flex justify-between border-b pb-2">
                                                <span className="capitalize">
                                                    {type}{' '}
                                                    <span className="text-muted-foreground">
                                                        ({(stock.on_hand_by_type[type] ?? 0).toLocaleString()})
                                                    </span>
                                                </span>
                                                <span className="font-mono tabular-nums">{formatAmount(value)}</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between font-medium">
                                            <span>Optical stock value</span>
                                            <span className="font-mono tabular-nums">{formatAmount(stock.value_total)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Inventory ledger (1200)</span>
                                            <span className="font-mono tabular-nums">{formatAmount(kpis.ledgerValue)}</span>
                                        </div>
                                        <div className="flex justify-between font-semibold">
                                            <span>Difference</span>
                                            <span className="font-mono tabular-nums">{formatAmount(difference ?? 0)}</span>
                                        </div>
                                    </div>
                                    <div className="text-muted-foreground space-y-2 text-sm">
                                        <p className="flex items-start gap-2">
                                            <BoxesIcon className="mt-0.5 size-4 shrink-0" />A difference usually means the opening inventory has not
                                            been entered yet, an item has no decodable cost (see Needs review), or stock was adjusted in the optical
                                            POS without a delivery, sale or write-off.
                                        </p>
                                        <p>
                                            Book the agreed opening inventory or an adjustment as a non-cash journal against Opening Balance Equity
                                            (3900) or Inventory Losses (5010).
                                        </p>
                                    </div>
                                </div>
                            </TableCard>
                        </TabsContent>
                    )}
                </Tabs>
            </PageBody>

            {reviewing && <ReviewDialog movement={reviewing} onClose={() => setReviewing(null)} />}
        </AppLayout>
    );
}

function ReviewDialog({ movement, onClose }: { movement: Movement; onClose: () => void }) {
    const form = useForm({ resolution: '' });

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        form.post(`/integration/inventory/movements/${movement.id}/review`, { preserveScroll: true, onSuccess: onClose });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>Mark as reviewed</DialogTitle>
                        <DialogDescription>
                            {movement.description || movement.movement_reference} — {movement.notes}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-1.5">
                        <Label>Resolution</Label>
                        <Textarea
                            value={form.data.resolution}
                            onChange={(e) => form.setData('resolution', e.target.value)}
                            placeholder="e.g. Supplier credit memo CM-102 entered as a bill credit"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            Mark reviewed
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
