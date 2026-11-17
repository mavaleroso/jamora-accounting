import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { type NavGroup, useNavGroups } from '@/hooks/use-nav-groups';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import { AlertTriangleIcon, Building2Icon, CalendarDaysIcon, ChevronRightIcon, CircleCheckIcon, OctagonAlertIcon } from 'lucide-react';
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
    default: 'border-border bg-card hover:bg-muted/60',
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

/** Something to act on: a warning or danger figure that is not zero. */
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

function Hero({ waiting }: { waiting?: number }) {
    const { auth, entity } = usePage<OverviewProps>().props;
    const greeting = useGreeting();
    const firstName = auth?.user?.name?.split(' ')[0];

    let headline = 'Here is what needs you today';
    if (waiting === 0) headline = 'You are all caught up';
    else if (waiting !== undefined) headline = `${waiting} ${waiting === 1 ? 'thing needs' : 'things need'} you today`;

    return (
        <section className="flex flex-col gap-1">
            <p className="text-muted-foreground text-sm font-medium">
                {greeting?.greeting ?? 'Welcome back'}
                {firstName && `, ${firstName}`}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{headline}</h1>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
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
            </div>
        </section>
    );
}

type Alert = { group: NavGroup; metric: Metric };

/** The work queue: one row per thing waiting on the user, most urgent first, each opening the page that clears it. */
function Inbox({ alerts }: { alerts?: Alert[] }) {
    if (!alerts) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-[60px] rounded-lg" />
                ))}
            </div>
        );
    }

    if (alerts.length === 0) {
        return (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                <CircleCheckIcon className="size-4 shrink-0" />
                All clear — nothing needs your attention right now.
            </div>
        );
    }

    return (
        <section aria-labelledby="inbox-heading" className="space-y-2">
            <h2 id="inbox-heading" className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Needs attention
            </h2>
            <ul className="space-y-2">
                {alerts.map(({ group, metric }) => {
                    const Icon = metric.tone === 'danger' ? OctagonAlertIcon : AlertTriangleIcon;
                    const className = cn('flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors', toneSurface[metric.tone]);
                    const content = (
                        <>
                            <Icon className={cn('size-5 shrink-0', toneText[metric.tone])} />
                            <span className={cn('min-w-8 text-lg font-semibold tabular-nums', toneText[metric.tone])}>{formatValue(metric)}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{metric.label}</span>
                                <span className="text-muted-foreground block truncate text-xs">{metric.hint ?? group.title}</span>
                            </span>
                            {metric.href && <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />}
                        </>
                    );

                    return (
                        <li key={`${group.title}-${metric.label}`}>
                            {metric.href ? (
                                <Link href={metric.href} prefetch className={className}>
                                    {content}
                                </Link>
                            ) : (
                                <div className={className}>{content}</div>
                            )}
                        </li>
                    );
                })}
            </ul>
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

/** The figures behind each part of the menu, for a read of the business once the queue is clear. */
function Glance({ modules }: { modules?: VisibleModule[] }) {
    if (!modules) {
        return (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-[68px] rounded-lg" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {modules.map(({ group, metrics }) => (
                <section key={group.title} aria-label={group.title} className="space-y-2">
                    <h2 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
                        <group.icon className="size-3.5" />
                        {group.title}
                    </h2>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                        {metrics.map((metric) => (
                            <MetricTile key={metric.label} metric={metric} />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

const hrefOf = (href: NavGroup['items'][number]['href']) => (typeof href === 'string' ? href : href.url);
const pathOf = (href: string) => href.split('?')[0];

/**
 * Pair each permitted menu group with its metrics, keeping only metrics that link to a page the user can open,
 * and dropping groups left with nothing to show. The server already gates metrics by permission; this keeps the
 * page consistent with the menu too.
 */
function visibleModules(groups: NavGroup[], modules: Record<string, Metric[]>): VisibleModule[] {
    const allowed = new Set(groups.flatMap((group) => group.items.map((item) => hrefOf(item.href))));

    return groups
        .map((group) => ({
            group,
            metrics: (modules[group.title] ?? []).filter((metric) => !metric.href || allowed.has(pathOf(metric.href))),
        }))
        .filter(({ metrics }) => metrics.length > 0);
}

/** Overdue and failed items (danger) before things that are merely waiting (warning). */
function alertsOf(modules: VisibleModule[]): Alert[] {
    return modules
        .flatMap(({ group, metrics }) => metrics.filter(isAlert).map((metric) => ({ group, metric })))
        .sort((a, b) => Number(b.metric.tone === 'danger') - Number(a.metric.tone === 'danger'));
}

export default function Overview() {
    const { modules } = usePage<OverviewProps>().props;
    const { groups } = useNavGroups();
    // undefined while the deferred metrics are loading.
    const visible = modules ? visibleModules(groups, modules) : undefined;
    const alerts = visible ? alertsOf(visible) : undefined;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Overview" />
            <div className="space-y-6 p-4 sm:p-6">
                <Hero waiting={alerts?.length} />

                {visible?.length === 0 ? (
                    <Card>
                        <CardContent className="text-muted-foreground py-10 text-center text-sm">
                            There's nothing to show here for your account yet. Please contact an administrator if you need access to a module.
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        <Inbox alerts={alerts} />
                        <Glance
                            modules={visible
                                ?.map(({ group, metrics }) => ({ group, metrics: metrics.filter((m) => !isAlert(m)) }))
                                .filter(({ metrics }) => metrics.length > 0)}
                        />
                    </>
                )}
            </div>
        </AppLayout>
    );
}
