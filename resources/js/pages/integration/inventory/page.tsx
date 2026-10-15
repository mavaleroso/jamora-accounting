import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import type { BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, Clock, Filter, Layers, Package, Plus, Receipt, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import * as React from 'react';

const postingPreview: Record<string, string> = {
    receipt: 'Dr Inventory · Cr Goods received not billed (cleared when the supplier bill is entered)',
    return: 'Dr Goods received not billed · Cr Inventory',
    sales_issue: 'Dr Cost of goods sold · Cr Inventory',
    edging_loss: 'Dr Cost of goods sold · Cr Inventory — flagged for review',
    adjustment: 'Inventory ± against Cost of goods sold (enter a negative quantity for shrinkage) — flagged for review',
};

const linkLabel: Record<string, string> = { cogs: 'COGS', ap_receipt: 'Receipt / GRNI', inventory_loss: 'Loss → COGS', adjustment: 'Adjustment' };

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Integration', href: '/integration/optical' },
    { title: 'Inventory Integration', href: '/integration/inventory' },
];

type InventoryItemType = {
    id: number;
    sku: string;
    name: string;
    category: string;
    brand: string | null;
    unit_cost: number;
    selling_price: number;
    qty_on_hand: number;
    reorder_level: number;
    status: 'healthy' | 'low_stock' | 'out_of_stock';
    valuation: number;
};

type MovementItem = {
    id: number;
    movement_reference: string;
    movement_type: 'receipt' | 'supplier_receipt' | 'sales_issue' | 'edging_loss' | 'adjustment' | 'return' | 'transfer';
    quantity: number;
    unit_cost: string | number;
    total_cost: string | number;
    accounting_link_type: 'cogs' | 'ap_receipt' | 'inventory_loss' | 'adjustment';
    review_status: 'matched' | 'needs_review' | 'resolved';
    notes: string | null;
    created_at: string;
    inventory_item?: {
        id: number;
        sku: string;
        name: string;
        category: string;
    } | null;
    journal_entry?: {
        id: number;
        entry_no: string;
        status: string;
    } | null;
};

type PaginatedMovements = {
    data: MovementItem[];
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    prev_page_url: string | null;
    next_page_url: string | null;
};

type GlAccount = {
    id: number;
    code: string;
    name: string;
};

type Props = {
    items: InventoryItemType[];
    movements: PaginatedMovements;
    glAccounts: GlAccount[];
    kpis: {
        totalValuation: number;
        lowStockCount: number;
        pendingReviewCount: number;
        matchedCount: number;
    };
    filters: {
        tab: string;
        search: string;
        review_status: string | null;
    };
};

export default function InventoryIntegrationPage({ items, movements, glAccounts, kpis, filters }: Props) {
    const [activeTab, setActiveTab] = React.useState<'movements' | 'valuation'>('movements');
    const [search, setSearch] = React.useState(filters.search || '');
    const [reviewFilter, setReviewFilter] = React.useState(filters.review_status || 'all');

    // Dialogs
    const [isCreateOpen, setIsCreateOpen] = React.useState(false);
    const [isReviewOpen, setIsReviewOpen] = React.useState(false);
    const [selectedMovement, setSelectedMovement] = React.useState<MovementItem | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Form data
    const [formData, setFormData] = React.useState({
        inventory_item_id: items[0]?.id ? String(items[0].id) : '',
        movement_type: 'receipt',
        quantity: '1',
        unit_cost: items[0]?.unit_cost ? String(items[0].unit_cost) : '',
        movement_reference: '',
        notes: '',
    });

    const handleFilterChange = (params: Record<string, string>) => {
        router.get(
            '/integration/inventory',
            {
                tab: activeTab,
                search: search || undefined,
                review_status: reviewFilter === 'all' ? undefined : reviewFilter,
                ...params,
            },
            { preserveState: true, preserveScroll: true },
        );
    };

    const handleCreateMovement = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.inventory_item_id || !formData.quantity || !formData.unit_cost) {
            toast.error('Please fill in all required fields.');
            return;
        }

        setIsSubmitting(true);
        router.post('/integration/inventory/movements', formData, {
            onSuccess: () => {
                toast.success('Inventory movement recorded and linked.');
                setIsCreateOpen(false);
                setFormData({
                    inventory_item_id: items[0]?.id ? String(items[0].id) : '',
                    movement_type: 'receipt',
                    quantity: '1',
                    unit_cost: items[0]?.unit_cost ? String(items[0].unit_cost) : '',
                    movement_reference: '',
                    notes: '',
                });
            },
            onError: (err) => {
                const message = Object.values(err)[0] as string;
                toast.error(message || 'Failed to record stock movement.');
            },
            onFinish: () => setIsSubmitting(false),
        });
    };

    const handleApproveReview = (movementId: number) => {
        setIsSubmitting(true);
        router.post(
            `/integration/inventory/movements/${movementId}/review`,
            { action: 'resolve' },
            {
                onSuccess: () => {
                    toast.success('Movement reviewed & resolved.');
                    setIsReviewOpen(false);
                },
                onError: () => toast.error('Failed to review movement.'),
                onFinish: () => setIsSubmitting(false),
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Inventory Integration & Accounting" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <Heading
                            title="Inventory Integration"
                            description="Stock from the optical inventory system, linked to the books: receipts, issues and losses post to inventory and cost of goods sold automatically."
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button onClick={() => setIsCreateOpen(true)} className="gap-2 shadow-sm">
                            <Plus className="h-4 w-4" />
                            Record Stock Movement
                        </Button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Stock Valuation</CardTitle>
                            <div className="bg-primary/10 text-primary rounded-full p-2">
                                <Layers className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-primary text-2xl font-bold tracking-tight">{formatPhpCurrency(kpis.totalValuation)}</div>
                            <p className="text-muted-foreground mt-1 text-xs">{items.length} optical items in active inventory</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Low / Out of Stock</CardTitle>
                            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">{kpis.lowStockCount} items</div>
                            <p className="text-muted-foreground mt-1 text-xs">Stock on hand &le; reorder threshold</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                                Needs Accounting Review
                            </CardTitle>
                            <div className="rounded-full bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
                                <ShieldAlert className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                                {kpis.pendingReviewCount} movements
                            </div>
                            <p className="text-muted-foreground mt-1 text-xs">Edging loss, damage, or discrepancy flags</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                                Matched & GL Linked
                            </CardTitle>
                            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                                {kpis.matchedCount} verified
                            </div>
                            <p className="text-muted-foreground mt-1 text-xs">Synced with COGS / AP journal entries</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Tab Switcher */}
                <div className="border-border flex border-b">
                    <button
                        onClick={() => setActiveTab('movements')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                            activeTab === 'movements'
                                ? 'border-primary text-primary font-semibold'
                                : 'text-muted-foreground hover:text-foreground border-transparent'
                        }`}
                    >
                        <Receipt className="h-4 w-4" />
                        Stock Movements & GL Links
                        {kpis.pendingReviewCount > 0 && (
                            <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                                {kpis.pendingReviewCount}
                            </Badge>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('valuation')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                            activeTab === 'valuation'
                                ? 'border-primary text-primary font-semibold'
                                : 'text-muted-foreground hover:text-foreground border-transparent'
                        }`}
                    >
                        <Package className="h-4 w-4" />
                        Stock Valuation & Reorder Alerts
                        {kpis.lowStockCount > 0 && (
                            <Badge
                                variant="outline"
                                className="ml-1 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
                            >
                                {kpis.lowStockCount}
                            </Badge>
                        )}
                    </button>
                </div>

                {/* TAB 1: MOVEMENTS */}
                {activeTab === 'movements' && (
                    <div className="flex flex-col gap-4">
                        <Card className="border-border/80 shadow-xs">
                            <CardContent className="pt-4 pb-4">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                                    <div className="relative">
                                        <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                                        <Input
                                            placeholder="Search movement ref or SKU..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleFilterChange({ search })}
                                            className="pl-9"
                                        />
                                    </div>

                                    <Select
                                        value={reviewFilter}
                                        onValueChange={(val) => {
                                            setReviewFilter(val);
                                            handleFilterChange({ review_status: val === 'all' ? '' : val });
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Review Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Review Statuses</SelectItem>
                                            <SelectItem value="matched">Matched & Linked</SelectItem>
                                            <SelectItem value="needs_review">Needs Review (Exceptions)</SelectItem>
                                            <SelectItem value="resolved">Resolved Discrepancy</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <div className="flex gap-2">
                                        <Button variant="secondary" onClick={() => handleFilterChange({ search })} className="gap-1.5">
                                            <Filter className="h-4 w-4" />
                                            Filter
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            onClick={() => {
                                                setSearch('');
                                                setReviewFilter('all');
                                                router.get('/integration/inventory', {}, { preserveState: true });
                                            }}
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/80 shadow-xs">
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                                <TableHead>Reference</TableHead>
                                                <TableHead>Item & Category</TableHead>
                                                <TableHead>Movement Type</TableHead>
                                                <TableHead className="text-right">Qty</TableHead>
                                                <TableHead className="text-right">Cost (PHP)</TableHead>
                                                <TableHead>Accounting Link</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Journal Entry</TableHead>
                                                <TableHead className="text-right">Actions</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {movements.data.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={9} className="text-muted-foreground h-32 text-center">
                                                        No stock movements found.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                movements.data.map((m) => {
                                                    const isNeedsReview = m.review_status === 'needs_review';
                                                    return (
                                                        <TableRow key={m.id} className="hover:bg-muted/30">
                                                            <TableCell className="font-mono text-xs font-semibold">{m.movement_reference}</TableCell>
                                                            <TableCell>
                                                                <div className="text-xs font-medium">{m.inventory_item?.name || 'Unknown Item'}</div>
                                                                <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
                                                                    <span className="font-mono">{m.inventory_item?.sku}</span>
                                                                    <span>&bull;</span>
                                                                    <span>{m.inventory_item?.category}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={
                                                                        m.movement_type === 'receipt'
                                                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                                            : m.movement_type === 'edging_loss'
                                                                              ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                                                              : 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                                                                    }
                                                                >
                                                                    {m.movement_type.toUpperCase().replace('_', ' ')}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono text-xs font-semibold">
                                                                {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono text-xs">
                                                                {formatPhpCurrency(m.total_cost)}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="secondary" className="font-mono text-[11px] uppercase">
                                                                    {linkLabel[m.accounting_link_type] ?? m.accounting_link_type}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {isNeedsReview ? (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="gap-1 border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                                                                    >
                                                                        <AlertTriangle className="h-3 w-3" />
                                                                        Needs Review
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                                                    >
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        {m.review_status}
                                                                    </Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                {m.journal_entry ? (
                                                                    <Link
                                                                        href={`/accounting/journal-entries?search=${m.journal_entry.entry_no}`}
                                                                        className="text-primary inline-flex items-center gap-1 font-mono text-xs hover:underline"
                                                                    >
                                                                        <Receipt className="h-3 w-3" />
                                                                        {m.journal_entry.entry_no}
                                                                    </Link>
                                                                ) : (
                                                                    <span className="text-muted-foreground text-xs">—</span>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {isNeedsReview && (
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="h-7 border-rose-500/30 text-xs text-rose-600 hover:bg-rose-50"
                                                                        onClick={() => {
                                                                            setSelectedMovement(m);
                                                                            setIsReviewOpen(true);
                                                                        }}
                                                                    >
                                                                        Review
                                                                    </Button>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* TAB 2: VALUATION & ALERTS */}
                {activeTab === 'valuation' && (
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="text-base font-semibold">Stock Valuation & Reorder Dashboard</CardTitle>
                                <CardDescription>Live quantities on hand, unit cost, selling price, and stock depletion alerts.</CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                                            <TableHead>SKU</TableHead>
                                            <TableHead>Item Name & Brand</TableHead>
                                            <TableHead>Category</TableHead>
                                            <TableHead className="text-right">Unit Cost</TableHead>
                                            <TableHead className="text-right">Retail Price</TableHead>
                                            <TableHead className="text-center">On Hand vs Reorder</TableHead>
                                            <TableHead className="text-right">Valuation</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {items.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-muted-foreground h-32 text-center">
                                                    No inventory items found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            items.map((item) => {
                                                const isOut = item.status === 'out_of_stock';
                                                const isLow = item.status === 'low_stock';
                                                return (
                                                    <TableRow key={item.id} className="hover:bg-muted/30">
                                                        <TableCell className="font-mono text-xs font-semibold">{item.sku}</TableCell>
                                                        <TableCell>
                                                            <div className="text-xs font-medium">{item.name}</div>
                                                            {item.brand && (
                                                                <div className="text-muted-foreground text-[11px]">Brand: {item.brand}</div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="text-xs">
                                                                {item.category}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs">
                                                            {formatPhpCurrency(item.unit_cost)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs">
                                                            {formatPhpCurrency(item.selling_price)}
                                                        </TableCell>
                                                        <TableCell className="text-center">
                                                            <div className="inline-flex items-center gap-1 font-mono text-xs font-semibold">
                                                                <span
                                                                    className={isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-foreground'}
                                                                >
                                                                    {item.qty_on_hand}
                                                                </span>
                                                                <span className="text-muted-foreground">/</span>
                                                                <span className="text-muted-foreground">{item.reorder_level}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-primary text-right font-mono text-xs font-semibold">
                                                            {formatPhpCurrency(item.valuation)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {isOut ? (
                                                                <Badge variant="destructive" className="gap-1 text-xs">
                                                                    <AlertTriangle className="h-3 w-3" />
                                                                    Out of Stock
                                                                </Badge>
                                                            ) : isLow ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="gap-1 border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-400"
                                                                >
                                                                    <Clock className="h-3 w-3" />
                                                                    Low Stock
                                                                </Badge>
                                                            ) : (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400"
                                                                >
                                                                    <CheckCircle2 className="h-3 w-3" />
                                                                    Healthy
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Modal: Record Stock Movement */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-[520px]">
                    <form onSubmit={handleCreateMovement}>
                        <DialogHeader>
                            <DialogTitle>Record Stock Movement</DialogTitle>
                            <DialogDescription>Add a stock movement and define its automatic GL accounting link.</DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="inventory_item_id">Optical Item *</Label>
                                <Select
                                    value={formData.inventory_item_id}
                                    onValueChange={(val) => {
                                        const selected = items.find((i) => String(i.id) === val);
                                        setFormData({
                                            ...formData,
                                            inventory_item_id: val,
                                            unit_cost: selected ? String(selected.unit_cost) : formData.unit_cost,
                                        });
                                    }}
                                >
                                    <SelectTrigger id="inventory_item_id">
                                        <SelectValue placeholder="Select item" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {items.map((i) => (
                                            <SelectItem key={i.id} value={String(i.id)}>
                                                {i.sku} - {i.name} ({i.category})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="movement_type">Movement Type *</Label>
                                    <Select value={formData.movement_type} onValueChange={(val) => setFormData({ ...formData, movement_type: val })}>
                                        <SelectTrigger id="movement_type">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="receipt">Supplier Receipt / Delivery (+)</SelectItem>
                                            <SelectItem value="sales_issue">Sales Issue / Dispensed (-)</SelectItem>
                                            <SelectItem value="edging_loss">Edging Loss / Breakage (-)</SelectItem>
                                            <SelectItem value="adjustment">Stock Count Adjustment</SelectItem>
                                            <SelectItem value="return">Return to Supplier (-)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Posts to the ledger as</Label>
                                    <div className="bg-muted/40 rounded-md border px-3 py-2 text-xs leading-relaxed">
                                        {postingPreview[formData.movement_type] ?? '—'}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="quantity">Quantity *</Label>
                                    <Input
                                        id="quantity"
                                        type="number"
                                        step="1"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="unit_cost">Unit Cost (PHP) *</Label>
                                    <Input
                                        id="unit_cost"
                                        type="number"
                                        step="0.01"
                                        value={formData.unit_cost}
                                        onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="movement_reference">Reference No.</Label>
                                <Input
                                    id="movement_reference"
                                    placeholder="e.g. PO-9912, DR-8821, LAB-004"
                                    value={formData.movement_reference}
                                    onChange={(e) => setFormData({ ...formData, movement_reference: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes / Reason</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Enter details on lens breakage, lab technician remarks, or delivery receipt notes..."
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Recording...' : 'Record & Link'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal: Review Exception (Edging Loss / Discrepancy) */}
            <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
                <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-600">
                            <AlertTriangle className="h-5 w-5" />
                            Review Stock Exception
                        </DialogTitle>
                        <DialogDescription>
                            Review movement reference {selectedMovement?.movement_reference} for {selectedMovement?.inventory_item?.name}.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedMovement && (
                        <div className="space-y-3 py-2 text-sm">
                            <div className="flex justify-between border-b pb-1.5">
                                <span className="text-muted-foreground">Type:</span>
                                <span className="font-semibold">{selectedMovement.movement_type.toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between border-b pb-1.5">
                                <span className="text-muted-foreground">Quantity:</span>
                                <span className="font-mono font-semibold">{selectedMovement.quantity}</span>
                            </div>
                            <div className="flex justify-between border-b pb-1.5">
                                <span className="text-muted-foreground">Total Valuation:</span>
                                <span className="font-mono font-semibold text-rose-600">{formatPhpCurrency(selectedMovement.total_cost)}</span>
                            </div>
                            <div className="flex justify-between border-b pb-1.5">
                                <span className="text-muted-foreground">Notes:</span>
                                <span>{selectedMovement.notes || 'No remarks provided.'}</span>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsReviewOpen(false)} disabled={isSubmitting}>
                            Dismiss
                        </Button>
                        <Button onClick={() => selectedMovement && handleApproveReview(selectedMovement.id)} disabled={isSubmitting}>
                            {isSubmitting ? 'Approving...' : 'Approve & Link to GL'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
