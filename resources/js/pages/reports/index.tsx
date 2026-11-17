import { Card, CardContent } from '@/components/ui/card';
import { REPORT_SECTIONS, REPORTS_HUB_URL, useNavGroups } from '@/hooks/use-nav-groups';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { ChevronRightIcon } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Reports', href: REPORTS_HUB_URL }];

/** Every report the signed-in user may open, grouped by what it is for. Replaces a long list in the menu. */
export default function ReportsIndex() {
    const { groups } = useNavGroups();
    const reports = groups.find((group) => group.hub?.href === REPORTS_HUB_URL)?.items ?? [];
    const sections = REPORT_SECTIONS.map((title) => ({ title, items: reports.filter((item) => item.section === title) })).filter(
        ({ items }) => items.length > 0,
    );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Reports" />
            <div className="space-y-6 p-4 sm:p-6">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
                    <p className="text-muted-foreground text-sm">Pick a report to run it for the company whose books are open.</p>
                </div>

                {sections.length === 0 ? (
                    <Card>
                        <CardContent className="text-muted-foreground py-10 text-center text-sm">
                            Your account has no reports yet. Please contact an administrator if you need access.
                        </CardContent>
                    </Card>
                ) : (
                    sections.map(({ title, items }) => (
                        <section key={title} aria-label={title} className="space-y-2">
                            <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">{title}</h2>
                            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {items.map((item) => (
                                    <li key={item.title}>
                                        <Link
                                            href={item.href}
                                            prefetch
                                            className="bg-card hover:bg-muted/60 flex h-full items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
                                        >
                                            {item.icon && (
                                                <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                                                    <item.icon className="size-[18px]" />
                                                </span>
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-medium">{item.title}</span>
                                                {item.description && <span className="text-muted-foreground block text-xs">{item.description}</span>}
                                            </span>
                                            <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))
                )}
            </div>
        </AppLayout>
    );
}
