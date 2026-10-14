import { Head, router } from '@inertiajs/react';
import { Eye, Inbox, ListChecks, Plus, ShieldCheck, UserRound, Wallet, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { CancelDialog, DecisionDialog } from './components/decision-dialogs';
import { FileRequestDialog } from './components/file-request-dialog';
import { KindTile } from './components/kind-tile';
import { BalancesPanel, OutPanel } from './components/panels';
import { RequestFeed } from './components/request-feed';
import { TeamBalances } from './components/team-balances';
import {
    fileableKinds,
    leaveTypesFor,
    KIND_ORDER,
    KINDS,
    REQUESTS_URL,
    type Badges,
    type FeedPage,
    type Filters,
    type Kind,
    type LeaveEligibility,
    type LeaveTypeOption,
    type Perspective,
    type Person,
    type RequestItem,
    type SelfProfile,
    type Status,
    type TeamBalanceRow,
    type TeamOverview,
    type View,
} from './lib';

type Props = {
    perspective: Perspective;
    views: View[];
    view: View;
    filters: Filters;
    feed: FeedPage | null;
    statusCounts: Record<Status, number> | null;
    badges: Badges;
    self: SelfProfile | null;
    team: TeamOverview | null;
    teamBalances: TeamBalanceRow[] | null;
    employees: (Person & LeaveEligibility)[];
    leaveTypes: LeaveTypeOption[];
    today: string;
};

export default function EmployeeRequestsPage(props: Props) {
    const { perspective, views, view, filters, feed, statusCounts, badges, self, team, teamBalances, employees, leaveTypes, today } = props;
    const { canReview, canViewTeam, hasSelf, canApproveLeave, canApproveAttendance } = perspective;

    const [fileKind, setFileKind] = React.useState<Kind | null | undefined>(undefined); // undefined = closed, null = pick a type
    const [decision, setDecision] = React.useState<{ item: RequestItem; decision: 'approved' | 'declined' } | null>(null);
    const [cancelItem, setCancelItem] = React.useState<RequestItem | null>(null);

    // Kinds the viewer can file: for themselves, or on behalf of staff if they approve that kind.
    // Leave is hidden from employees whose record enables no leave type.
    const fileable = fileableKinds(perspective).filter((k) =>
        KINDS[k].source === 'leave'
            ? canApproveLeave || (hasSelf && leaveTypesFor(self, leaveTypes).length > 0)
            : hasSelf || canApproveAttendance,
    );
    const approvable = KIND_ORDER.filter((k) => (KINDS[k].source === 'leave' ? canApproveLeave : canApproveAttendance));
    const year = filters.year;

    // Deep link from elsewhere (e.g. the portal): ?file=leave opens the form.
    React.useEffect(() => {
        const wanted = new URLSearchParams(window.location.search).get('file');
        if (wanted && (fileable as string[]).includes(wanted)) setFileKind(wanted as Kind);
        else if (wanted === 'any' && fileable.length) setFileKind(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const navigate = React.useCallback(
        (changes: Partial<Filters> & { view?: View }) => {
            const viewChanged = changes.view && changes.view !== view;
            const next = viewChanged ? { view: changes.view, year } : { view, ...filters, ...changes };
            const params = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== '' && v !== null && v !== undefined && !(k === 'status' && v === 'all')));
            router.get(REQUESTS_URL, params, { preserveState: true, preserveScroll: true, replace: true });
        },
        [view, filters, year],
    );

    const tabs: Record<View, { label: string; icon: LucideIcon; badge?: number }> = {
        inbox: { label: 'Approvals', icon: Inbox, badge: badges.inbox },
        mine: { label: 'My requests', icon: UserRound, badge: canReview ? undefined : badges.mine },
        all: { label: 'All requests', icon: ListChecks },
        balances: { label: 'Leave balances', icon: Wallet },
    };

    const role = canReview
        ? {
              label: canApproveLeave && canApproveAttendance ? 'Approver' : canApproveLeave ? 'Leave approver' : 'Timekeeper',
              icon: ShieldCheck,
              description: 'Decide what your team files, see who is out, and keep leave credits in check.',
          }
        : canViewTeam
          ? { label: 'Read-only', icon: Eye, description: 'Every request filed in this branch and the team’s leave credits. Decisions are made by HR.' }
          : { label: 'My requests', icon: UserRound, description: 'File leave, overtime and other requests, and follow each one until it is decided.' };

    const sharedFeed = (extra: Partial<React.ComponentProps<typeof RequestFeed>> = {}) =>
        feed && (
            <RequestFeed
                view={view}
                feed={feed}
                filters={filters}
                perspective={perspective}
                selfId={self?.id ?? null}
                statusCounts={statusCounts}
                kinds={view === 'mine' ? fileableKinds(perspective) : KIND_ORDER}
                employees={employees}
                onFilter={navigate}
                onDecide={(item, d) => setDecision({ item, decision: d })}
                onCancel={setCancelItem}
                {...extra}
            />
        );

    const outToday = team?.out.filter((i) => i.date_from <= today && i.date_to >= today).length ?? 0;

    return (
        <AppLayout breadcrumbs={breadcrumbs(hasSelf && !canViewTeam)}>
            <Head title={hasSelf && !canViewTeam ? 'My Requests' : 'Employee Requests'} />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                        <Heading title={hasSelf && !canViewTeam ? 'My Requests' : 'Employee Requests'} description={role.description} />
                        <Badge variant="outline" className="gap-1">
                            <role.icon className="size-3" /> {role.label}
                        </Badge>
                    </div>
                    {fileable.length > 0 && (
                        <Button onClick={() => setFileKind(null)}>
                            <Plus className="size-4" /> {hasSelf ? 'New request' : 'File on behalf'}
                        </Button>
                    )}
                </div>

                {views.length > 1 && (
                    <div className="border-b">
                        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Request views">
                            {views.map((id) => {
                                const t = tabs[id];
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => navigate({ view: id })}
                                        aria-current={view === id ? 'page' : undefined}
                                        className={cn(
                                            'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                                            view === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <t.icon className="size-4" />
                                        {t.label}
                                        {!!t.badge && <span className="rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums">{t.badge}</span>}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                )}

                {/* Employee: file, track, see credits */}
                {view === 'mine' && (
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="min-w-0 space-y-5">
                            {fileable.length > 0 && (
                                <section className="space-y-2">
                                    <h2 className="text-sm font-semibold">File a request</h2>
                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {fileable.map((k) => (
                                            <KindTile key={k} kind={k} compact onClick={() => setFileKind(k)} />
                                        ))}
                                    </div>
                                </section>
                            )}
                            <section className="space-y-2">
                                <h2 className="text-sm font-semibold">History</h2>
                                {sharedFeed({ emptyHint: 'Requests you file show up here with their approval status.' })}
                            </section>
                        </div>
                        <aside className="space-y-4">
                            {self && <BalancesPanel balances={self.balances} year={year} onFile={perspective.canFileLeave ? () => setFileKind('leave') : undefined} />}
                            {self && <OutPanel title="Your upcoming time off" items={self.upcoming} today={today} showEmployee={false} empty="Nothing approved yet for the coming weeks." />}
                        </aside>
                    </div>
                )}

                {/* Approver: queue first, context on the side */}
                {view === 'inbox' && team && (
                    <>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <Stat label="Waiting on you" value={badges.inbox} tone={badges.inbox > 0 ? 'amber' : undefined} />
                            <Stat
                                label="Oldest waiting"
                                value={team.stats.oldestPendingDays === null ? '—' : team.stats.oldestPendingDays === 0 ? 'Today' : `${team.stats.oldestPendingDays}d`}
                                tone={(team.stats.oldestPendingDays ?? 0) >= 3 ? 'rose' : undefined}
                                hint={(team.stats.oldestPendingDays ?? 0) >= 3 ? 'Over 3 days — staff are waiting' : undefined}
                            />
                            <Stat label="Out today" value={outToday} hint="On leave or official business" />
                            <Stat label="Decided this month" value={team.stats.decidedThisMonth} hint={`${team.stats.leaveDaysThisMonth} leave days approved`} />
                        </div>
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                            <div className="min-w-0">{sharedFeed({ kinds: approvable, kindCounts: badges.inboxByKind })}</div>
                            <aside className="space-y-4">
                                <OutPanel title="Who’s out · next 2 weeks" items={team.out} today={today} showEmployee empty="Everyone is in for the next two weeks." />
                            </aside>
                        </div>
                    </>
                )}

                {view === 'all' && (
                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="min-w-0">{sharedFeed()}</div>
                        {team && (
                            <aside className="space-y-4">
                                <OutPanel title="Who’s out · next 2 weeks" items={team.out} today={today} showEmployee empty="Everyone is in for the next two weeks." />
                            </aside>
                        )}
                    </div>
                )}

                {view === 'balances' && teamBalances && <TeamBalances rows={teamBalances} leaveTypes={leaveTypes} year={year} today={today} onYear={(y) => navigate({ year: y })} />}
            </div>

            <FileRequestDialog
                open={fileKind !== undefined}
                onOpenChange={(o) => !o && setFileKind(undefined)}
                kind={fileKind ?? null}
                kinds={fileable}
                leaveTypes={leaveTypes}
                self={self}
                balances={self?.balances ?? []}
                onBehalf={{ leave: canApproveLeave, attendance: canApproveAttendance }}
                employees={employees}
                today={today}
            />
            <DecisionDialog open={decision !== null} onOpenChange={(o) => !o && setDecision(null)} item={decision?.item ?? null} decision={decision?.decision ?? 'approved'} />
            <CancelDialog open={cancelItem !== null} onOpenChange={(o) => !o && setCancelItem(null)} item={cancelItem} />
        </AppLayout>
    );
}

function breadcrumbs(employeeOnly: boolean): BreadcrumbItem[] {
    return [
        { title: 'Employee Management', href: '/employee-management' },
        { title: employeeOnly ? 'My Requests' : 'Employee Requests', href: REQUESTS_URL },
    ];
}

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'amber' | 'rose' }) {
    return (
        <div className="rounded-xl border bg-card p-3.5 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
            <p
                className={cn(
                    'mt-1 text-2xl font-semibold tabular-nums',
                    tone === 'amber' && 'text-amber-600 dark:text-amber-400',
                    tone === 'rose' && 'text-rose-600 dark:text-rose-400',
                )}
            >
                {value}
            </p>
            {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
    );
}
