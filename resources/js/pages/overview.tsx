import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type NavGroup, useNavGroups } from '@/hooks/use-nav-groups';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { AlertTriangleIcon, ArrowRightIcon, Building2Icon, CalendarDaysIcon, CircleCheckIcon, OctagonAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Overview', href: '/overview' }];

type Tone = 'default' | 'warning' | 'danger' | 'success';

type Metric = {
    label: string;
    value: number | string | null;
    format: 'number' | 'currency' | 'text';
    tone: Tone;
    href: string | null;
    hint: string | null;
};

type VisibleModule = {
    group: NavGroup;
    metrics: Metric[];
};

type OverviewProps = SharedData & {
    // Deferred: undefined until the metrics finish loading after the first render.
    modules?: Record<string, Metric[]>;
};

const toneText: Record<Tone, string> = {
    default: 'text-foreground',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-red-600 dark:text-red-400',
    success: 'text-emerald-600 dark:text-emerald-400',
};

const toneSurface: Record<Tone, string> = {
    default: 'border-border bg-muted/30 hover:bg-muted/60',
    warning: 'border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10',
    danger: 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10',
    success: 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10',
};

function formatValue(metric: Metric): string {
    if (metric.value == null) return '—';
    if (metric.format === 'currency') return formatPhpCurrency(metric.value);
    if (metric.format === 'number') return Number(metric.value).toLocaleString();
    return String(metric.value);
}

function isAlert(metric: Metric): boolean {
    if (metric.tone !== 'warning' && metric.tone !== 'danger') return false;
    return metric.format === 'text' || Number(metric.value) > 0;
}

function greetingFor(hour: number): string {
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

/** Greeting and date are computed after mount so server and browser renders always match. */
function useGreeting() {
    const [state, setState] = useState<{ greeting: string; date: string } | null>(null);

    useEffect(() => {
        const now = new Date();
        setState({
            greeting: greetingFor(now.getHours()),
            date: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        });
    }, []);

    return state;
}

function Hero({ moduleCount }: { moduleCount?: number }) {
    const { auth, entity } = usePage<OverviewProps>().props;
    const greeting = useGreeting();
    const firstName = auth?.user?.name?.split(' ')[0];

    return (
        <section className="from-primary/15 via-primary/5 relative overflow-hidden rounded-xl border bg-gradient-to-br to-transparent p-6">
            <div className="bg-primary/10 pointer-events-none absolute -top-16 -right-16 size-56 rounded-full blur-3xl" />
            <p className="text-muted-foreground text-sm font-medium">{greeting?.greeting ?? 'Welcome back'}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {firstName ? `${firstName}, here's your day at a glance` : "Here's your day at a glance"}
            </h1>
            <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-1.5">
                    <CalendarDaysIcon className="size-4" />
                    {greeting?.date ?? <Skeleton className="h-4 w-40" />}
                </span>
                {entity?.current && (
                    <span className="inline-flex items-center gap-1.5">
                        <Building2Icon className="size-4" />
                        {entity.current.name}
                    </span>
                )}
                {moduleCount !== undefined && (
                    <span>
                        {moduleCount} {moduleCount === 1 ? 'module' : 'modules'} available
                    </span>
                )}
            </div>
        </section>
    );
}

function AttentionStrip({ modules }: { modules?: VisibleModule[] }) {
    if (!modules) {
        return (
            <div className="flex flex-wrap gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-48 rounded-full" />
                ))}
            </div>
        );
    }

    const alerts = modules.flatMap(({ group, metrics }) => metrics.filter(isAlert).map((metric) => ({ group, metric })));

    if (alerts.length === 0) {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CircleCheckIcon className="size-4 shrink-0" />
                All clear — nothing needs your attention right now.
            </div>
        );
    }

    return (
        <section aria-labelledby="attention-heading" className="space-y-2">
            <h2 id="attention-heading" className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Needs attention
            </h2>
            <div className="flex flex-wrap gap-2">
                {alerts.map(({ group, metric }) => {
                    const Icon = metric.tone === 'danger' ? OctagonAlertIcon : AlertTriangleIcon;
                    const content = (
                        <>
                            <Icon className="size-4 shrink-0" />
                            <span className="font-semibold tabular-nums">{formatValue(metric)}</span>
                            <span className="text-foreground/80">{metric.label}</span>
                            <span className="text-muted-foreground hidden sm:inline">· {group.title}</span>
                        </>
                    );
                    const className = cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        toneSurface[metric.tone],
                        toneText[metric.tone],
                    );

                    return metric.href ? (
                        <Link key={`${group.title}-${metric.label}`} href={metric.href} prefetch className={className}>
                            {content}
                        </Link>
                    ) : (
                        <span key={`${group.title}-${metric.label}`} className={className}>
                            {content}
                        </span>
                    );
                })}
            </div>
        </section>
    );
}

function MetricTile({ metric }: { metric: Metric }) {
    const body = (
        <>
            <span className="text-muted-foreground truncate text-xs">{metric.label}</span>
            <span className={cn('truncate text-lg font-semibold tabular-nums', toneText[metric.tone])}>{formatValue(metric)}</span>
            {metric.hint && <span className="text-muted-foreground truncate text-[11px]">{metric.hint}</span>}
        </>
    );
    const className = cn('flex min-w-0 flex-col gap-0.5 rounded-lg border px-3 py-2.5 transition-colors', toneSurface[metric.tone]);

    return metric.href ? (
        <Link href={metric.href} prefetch className={className}>
            {body}
        </Link>
    ) : (
        <div className={className}>{body}</div>
    );
}

function ModuleCard({ group, metrics }: VisibleModule) {
    const Icon = group.icon;
    const primary = group.items[0];

    return (
        <Card className="gap-4 py-5 transition-shadow hover:shadow-md">
            <CardHeader className="flex flex-row items-center gap-3 px-5">
                <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">{group.title}</CardTitle>
                    <p className="text-muted-foreground text-xs">
                        {group.items.length} {group.items.length === 1 ? 'page' : 'pages'}
                    </p>
                </div>
                {primary && (
                    <Link
                        href={primary.href}
                        prefetch
                        aria-label={`Open ${group.title}`}
                        className="text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md p-1.5 transition-colors"
                    >
                        <ArrowRightIcon className="size-4" />
                    </Link>
                )}
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-4 px-5">
                <div className="grid grid-cols-2 gap-2">
                    {metrics.map((metric) => (
                        <MetricTile key={metric.label} metric={metric} />
                    ))}
                </div>

                <div className="mt-auto flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                        <Link key={item.title} href={item.href} prefetch>
                            <Badge
                                variant="outline"
                                className="hover:bg-accent hover:text-accent-foreground gap-1 py-1 font-normal transition-colors"
                            >
                                {item.icon && <item.icon className="size-3" />}
                                {item.title}
                            </Badge>
                        </Link>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function ModuleCardSkeleton() {
    return (
        <Card className="gap-4 py-5">
            <CardHeader className="flex flex-row items-center gap-3 px-5">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 px-5">
                <Skeleton className="h-[68px] rounded-lg" />
                <Skeleton className="h-[68px] rounded-lg" />
            </CardContent>
        </Card>
    );
}

const hrefOf = (href: NavGroup['items'][number]['href']) => (typeof href === 'string' ? href : href.url);

/**
 * Pair each permitted sidebar group with its metrics, keeping only metrics that link to a page the user can
 * open, and dropping groups left with nothing to show. The server already gates metrics by permission; this
 * keeps the page consistent with the sidebar too.
 */
function visibleModules(groups: NavGroup[], modules: Record<string, Metric[]>): VisibleModule[] {
    return groups
        .map((group) => {
            const allowed = new Set(group.items.map((item) => hrefOf(item.href)));
            const metrics = (modules[group.title] ?? []).filter((metric) => !metric.href || allowed.has(metric.href));

            return { group, metrics };
        })
        .filter(({ metrics }) => metrics.length > 0);
}

export default function Overview() {
    const { modules } = usePage<OverviewProps>().props;
    const { groups } = useNavGroups();
    // undefined while the deferred metrics are loading.
    const visible = modules ? visibleModules(groups, modules) : undefined;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Overview" />
            <div className="space-y-6 p-4">
                <Hero moduleCount={visible?.length} />

                {visible?.length === 0 ? (
                    <Card>
                        <CardContent className="text-muted-foreground py-10 text-center text-sm">
                            There's nothing to show here for your account yet. Please contact an administrator if you need access to a module.
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <AttentionStrip modules={visible} />

                        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                            {visible
                                ? visible.map(({ group, metrics }) => <ModuleCard key={group.title} group={group} metrics={metrics} />)
                                : Array.from({ length: Math.min(Math.max(groups.length, 1), 6) }).map((_, i) => <ModuleCardSkeleton key={i} />)}
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
