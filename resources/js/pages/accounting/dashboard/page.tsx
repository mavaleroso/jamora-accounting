import Heading from '@/components/heading';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import type { BreadcrumbItem, SyncRun } from '@/types';
import { Head, Link } from '@inertiajs/react';
import {
    AlertTriangleIcon,
    ArrowRightIcon,
    BanknoteIcon,
    Boxes,
    CalendarCheck,
    Coins,
    FileTextIcon,
    RefreshCwIcon,
    ShieldCheck,
    TrendingDownIcon,
    TrendingUpIcon,
    WalletIcon,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Dashboard', href: '/accounting/dashboard' }];

type TrendPoint = {
    month: string;
    revenue: number;
    expense: number;
};

type ExpenseMixItem = {
    name: string;
    amount: number;
};

type DashboardJournalEntry = {
    id: number;
    entry_no: string;
    entry_date: string;
    status: string;
    total_debit: number;
    total_credit: number;
    journal?: { code: string; name: string } | null;
};

type DashboardData = {
    unpostedEntriesCount: number;
    syncExceptionCount: number;
    cashPosition: number;
    arBalance?: number;
    apBalance?: number;
    depositsLiability?: number;
    revenueMTD: number;
    revenueYTD: number;
    expenseMTD: number;
    revenueTrend: TrendPoint[];
    expenseMix: ExpenseMixItem[];
    recentJournalEntries: DashboardJournalEntry[];
    lastSyncRun: SyncRun | null;
    lowStock?: { count: number; items: { stock_type: string; brand: string | null; code: string | null; on_hand_count: number }[] } | null;
    currentPeriod: {
        id: number;
        period_no: number;
        start_date: string;
        end_date: string;
    } | null;
};

type Props = DashboardData;

const trendChartConfig = {
    revenue: { label: 'Revenue', color: 'hsl(var(--primary))' },
    expense: { label: 'Expenses', color: 'hsl(0 72% 51%)' },
};

const expenseChartConfig = {
    amount: { label: 'Amount', color: 'hsl(var(--primary))' },
};

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        dateStyle: 'medium',
    });
}

export default function AccountingDashboardPage({
    unpostedEntriesCount,
    syncExceptionCount,
    cashPosition,
    arBalance = 0,
    apBalance = 0,
    depositsLiability = 0,
    revenueMTD,
    revenueYTD,
    expenseMTD,
    revenueTrend,
    expenseMix,
    recentJournalEntries,
    lastSyncRun,
    lowStock = null,
    currentPeriod,
}: Props) {
    const entries = Array.isArray(recentJournalEntries)
        ? recentJournalEntries
        : ((recentJournalEntries as { data?: DashboardJournalEntry[] })?.data ?? []);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />

            <div className="space-y-6 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <Heading title="Accounting Dashboard" description="Overview of cash, revenue, expenses, and journal activity." />
                    {currentPeriod ? (
                        <Badge variant="secondary" className="text-sm">
                            Open period P{currentPeriod.period_no}: {currentPeriod.start_date} – {currentPeriod.end_date}
                        </Badge>
                    ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        title="Cash Position"
                        value={formatPhpCurrency(cashPosition)}
                        description="Cash on hand, clearing and bank accounts"
                        icon={WalletIcon}
                        href="/accounting/cash-bank-records"
                    />
                    <StatCard
                        title="Accounts Receivable"
                        value={formatPhpCurrency(arBalance)}
                        description="Partner balances"
                        icon={TrendingUpIcon}
                        href="/reports/ar-aging"
                    />
                    <StatCard
                        title="Accounts Payable"
                        value={formatPhpCurrency(apBalance)}
                        description="Open bill balances"
                        icon={TrendingDownIcon}
                        href="/reports/ap-aging"
                        tone="warning"
                    />
                    <StatCard
                        title="Customer Deposits"
                        value={formatPhpCurrency(depositsLiability)}
                        description="Open deposit liability"
                        icon={WalletIcon}
                        href="/billing/deposits"
                    />
                </div>

                {/* 5 Modules Launchpad */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Link
                        href="/accounting/cash-bank-records"
                        className="bg-card flex items-center gap-3 rounded-lg border p-3 shadow-sm transition-colors hover:border-amber-400/60"
                    >
                        <div className="rounded-md bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400">
                            <Coins className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="text-foreground text-xs font-semibold">Cash & Bank Records</div>
                            <div className="text-muted-foreground text-[11px]">Inflows, outflows & reconciliation</div>
                        </div>
                    </Link>

                    <Link
                        href="/integration/inventory"
                        className="bg-card flex items-center gap-3 rounded-lg border p-3 shadow-sm transition-colors hover:border-amber-400/60"
                    >
                        <div className="rounded-md bg-blue-500/10 p-2.5 text-blue-600 dark:text-blue-400">
                            <Boxes className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="text-foreground text-xs font-semibold">Inventory & Movements</div>
                            <div className="text-muted-foreground text-[11px]">COGS/AP auto-posting & reorders</div>
                        </div>
                    </Link>

                    <Link
                        href="/employee-management/roster"
                        className="bg-card flex items-center gap-3 rounded-lg border p-3 shadow-sm transition-colors hover:border-amber-400/60"
                    >
                        <div className="rounded-md bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
                            <CalendarCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="text-foreground text-xs font-semibold">Shift & Attendance</div>
                            <div className="text-muted-foreground text-[11px]">Weekly rosters & time records</div>
                        </div>
                    </Link>

                    <Link
                        href="/employee-management/compliance"
                        className="bg-card flex items-center gap-3 rounded-lg border p-3 shadow-sm transition-colors hover:border-amber-400/60"
                    >
                        <div className="rounded-md bg-purple-500/10 p-2.5 text-purple-600 dark:text-purple-400">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="text-foreground text-xs font-semibold">Compliance Mgmt</div>
                            <div className="text-muted-foreground text-[11px]">BIR, SSS, PhilHealth & LGU filings</div>
                        </div>
                    </Link>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <StatCard
                        title="Revenue MTD"
                        value={formatPhpCurrency(revenueMTD)}
                        description={`YTD ${formatPhpCurrency(revenueYTD)}`}
                        icon={TrendingUpIcon}
                        tone="default"
                    />
                    <StatCard
                        title="Expenses MTD"
                        value={formatPhpCurrency(expenseMTD)}
                        description="Posted expense accounts"
                        icon={TrendingDownIcon}
                        tone="warning"
                    />
                    <StatCard
                        title="Unposted Entries"
                        value={unpostedEntriesCount.toLocaleString()}
                        description="Draft and pending"
                        icon={FileTextIcon}
                        href="/accounting/journal-entries"
                    />
                    <StatCard
                        title="Sync Exceptions"
                        value={syncExceptionCount.toLocaleString()}
                        description="Failed sync documents"
                        icon={AlertTriangleIcon}
                        href="/integration/optical/exceptions"
                        tone="danger"
                    />
                    {lowStock && (
                        <StatCard
                            title="Low Stock"
                            value={lowStock.count.toLocaleString()}
                            description={
                                lowStock.items.length
                                    ? `Lowest: ${lowStock.items
                                          .slice(0, 2)
                                          .map((i) => `${i.brand ?? i.code ?? i.stock_type} (${i.on_hand_count})`)
                                          .join(', ')}`
                                    : 'Item groups at or below reorder level'
                            }
                            icon={Boxes}
                            href="/integration/inventory?tab=alerts"
                            tone={lowStock.count ? 'warning' : 'success'}
                        />
                    )}
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="border-border/60 shadow-sm lg:col-span-2">
                        <CardHeader>
                            <CardTitle className="text-base">Revenue vs Expenses</CardTitle>
                            <CardDescription>Last 6 months of posted activity</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={trendChartConfig} className="h-[280px] w-full">
                                <AreaChart data={revenueTrend} margin={{ left: 8, right: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        tickFormatter={(value) =>
                                            Number(value).toLocaleString('en-PH', {
                                                notation: 'compact',
                                                maximumFractionDigits: 1,
                                            })
                                        }
                                    />
                                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatPhpCurrency(Number(value))} />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="var(--color-revenue)"
                                        fill="var(--color-revenue)"
                                        fillOpacity={0.2}
                                        strokeWidth={2}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="expense"
                                        stroke="var(--color-expense)"
                                        fill="var(--color-expense)"
                                        fillOpacity={0.15}
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base">Expense Mix</CardTitle>
                            <CardDescription>Top expense accounts this month</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {expenseMix.length > 0 ? (
                                <ChartContainer config={expenseChartConfig} className="h-[280px] w-full">
                                    <BarChart data={expenseMix} layout="vertical" margin={{ left: 8, right: 8 }}>
                                        <CartesianGrid horizontal={false} />
                                        <XAxis type="number" hide />
                                        <YAxis
                                            type="category"
                                            dataKey="name"
                                            width={100}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value) => (value.length > 14 ? `${value.slice(0, 14)}…` : value)}
                                        />
                                        <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatPhpCurrency(Number(value))} />} />
                                        <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
                                    </BarChart>
                                </ChartContainer>
                            ) : (
                                <p className="text-muted-foreground py-16 text-center text-sm">No expense activity this month.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="border-border/60 shadow-sm lg:col-span-2">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base">Recent Journal Entries</CardTitle>
                                <CardDescription>Latest 5 entries across all statuses</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/accounting/journal-entries">
                                    View all
                                    <ArrowRightIcon className="ml-2 size-4" />
                                </Link>
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Entry No.</TableHead>
                                        <TableHead>Journal</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.length > 0 ? (
                                        entries.map((entry) => (
                                            <TableRow key={entry.id}>
                                                <TableCell>{formatDate(entry.entry_date)}</TableCell>
                                                <TableCell className="font-mono text-sm">{entry.entry_no}</TableCell>
                                                <TableCell className="text-muted-foreground">{entry.journal?.code ?? '—'}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="capitalize">
                                                        {entry.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-mono tabular-nums">
                                                    {formatPhpCurrency(entry.total_debit)}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-muted-foreground h-20 text-center">
                                                No journal entries yet.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card className="border-border/60 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-base">Last Optical Sync</CardTitle>
                                <CardDescription>Most recent sync run</CardDescription>
                            </div>
                            <BanknoteIcon className="text-primary size-5" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {lastSyncRun ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground text-sm">Status</span>
                                        <Badge
                                            variant={
                                                lastSyncRun.status === 'completed'
                                                    ? 'default'
                                                    : lastSyncRun.status === 'failed'
                                                      ? 'destructive'
                                                      : 'secondary'
                                            }
                                        >
                                            {lastSyncRun.status}
                                        </Badge>
                                    </div>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Started</span>
                                            <span>{formatDate(lastSyncRun.started_at)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Processed</span>
                                            <span>{lastSyncRun.processed}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Created</span>
                                            <span>{lastSyncRun.created_entries}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Failed</span>
                                            <span className={lastSyncRun.failed > 0 ? 'text-destructive' : ''}>{lastSyncRun.failed}</span>
                                        </div>
                                    </div>
                                    {lastSyncRun.message ? (
                                        <p className="bg-muted/50 text-muted-foreground rounded-md p-3 text-xs">{lastSyncRun.message}</p>
                                    ) : null}
                                    <Button variant="outline" size="sm" className="w-full" asChild>
                                        <Link href="/integration/optical">
                                            <RefreshCwIcon className="mr-2 size-4" />
                                            Open Optical Sync
                                        </Link>
                                    </Button>
                                </>
                            ) : (
                                <p className="text-muted-foreground py-8 text-center text-sm">No sync runs recorded yet.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
