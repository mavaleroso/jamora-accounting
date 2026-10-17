import { Head, router } from '@inertiajs/react';
import { CalendarCheck, Clock, Eye, Hourglass, ListChecks, MapPin, NotebookPen, Plus, ShieldCheck, Users } from 'lucide-react';
import * as React from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import {
    DailyCloseDialog,
    GeofenceDialog,
    ManualEntryDialog,
    RejectDayDialog,
    RequestDialog,
    ReviewDialog,
    type ManualEntryTarget,
    type RequestTarget,
} from './components/dialogs';
import { AccomplishmentReport } from './components/accomplishments';
import { MyClock } from './components/my-clock';
import { RequestsPanel } from './components/requests-panel';
import { Timesheets } from './components/timesheets';
import { TodayBoard } from './components/today-board';
import {
    ATTENDANCE_URL,
    type Accomplishments,
    type Approval,
    type AttendanceRequestRow,
    type Board,
    type BranchLocation,
    type DtrRow,
    type FilterChange,
    type Filters,
    type MyDay,
    type Paginated,
    type PayPeriodOption,
    type Person,
    type Perspective,
    type SummaryRow,
} from './lib';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management' },
    { title: 'Time & Attendance', href: ATTENDANCE_URL },
];

type View = 'clock' | 'today' | 'timesheets' | 'requests' | 'accomplishments';

type Props = {
    perspective: Perspective;
    view: View;
    filters: Filters;
    entries: Paginated<DtrRow>;
    approval: Approval;
    summary: SummaryRow[];
    periods: PayPeriodOption[];
    attendanceRequests: Paginated<AttendanceRequestRow>;
    requestCounts: Record<'pending' | 'approved' | 'rejected' | 'cancelled', number>;
    employees: Person[];
    board: Board | null;
    myDay: MyDay | null;
    accomplishments: Accomplishments | null;
    branchLocation: BranchLocation;
    today: string;
};

export default function AttendancePage(props: Props) {
    const {
        perspective,
        view,
        filters,
        entries,
        approval,
        summary,
        periods,
        attendanceRequests,
        requestCounts,
        employees,
        board,
        myDay,
        accomplishments,
        branchLocation,
        today,
    } = props;
    const { canManage, canViewTeam, hasSelf } = perspective;

    const [manualTarget, setManualTarget] = React.useState<ManualEntryTarget>(null);
    const [requestTarget, setRequestTarget] = React.useState<RequestTarget>(null);
    const [rejectEntry, setRejectEntry] = React.useState<DtrRow | null>(null);
    const [review, setReview] = React.useState<{ request: AttendanceRequestRow; decision: 'approved' | 'rejected' } | null>(null);
    const [closeOpen, setCloseOpen] = React.useState(false);
    const [geoOpen, setGeoOpen] = React.useState(false);

    const navigate = React.useCallback(
        (changes: FilterChange & { view?: View }) => {
            const next = { view, ...filters, ...changes };
            const params = Object.fromEntries(
                Object.entries(next).filter(([, v]) => v !== '' && v !== null && v !== undefined),
            );
            router.get(ATTENDANCE_URL, params, { preserveState: true, preserveScroll: true, replace: true });
        },
        [view, filters],
    );

    const tabs: { id: View; label: string; icon: typeof Clock; badge?: number; show: boolean }[] = [
        { id: 'clock', label: 'My day', icon: Clock, show: hasSelf },
        { id: 'today', label: 'Today', icon: Users, show: canViewTeam },
        { id: 'timesheets', label: canViewTeam ? 'Timesheets' : 'My timesheet', icon: ListChecks, badge: canManage ? approval.open : undefined, show: true },
        { id: 'requests', label: 'Overtime', icon: Hourglass, badge: requestCounts.pending, show: true },
        { id: 'accomplishments', label: 'Accomplishments', icon: NotebookPen, show: hasSelf },
    ];
    // Timekeepers start from the team; employees from their own clock.
    const orderedTabs = canManage ? [...tabs.filter((t) => t.id !== 'clock'), ...tabs.filter((t) => t.id === 'clock')] : tabs;

    const role = canManage
        ? { label: 'Timekeeper', icon: ShieldCheck, description: 'Track today’s attendance, approve each day for payroll and decide overtime.' }
        : canViewTeam
          ? { label: 'Read-only', icon: Eye, description: 'Attendance overview for your branch. Changes are made by HR / payroll.' }
          : { label: 'My attendance', icon: Clock, description: 'Clock in and out, check your hours, and request fixes when something is off.' };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Time & Attendance" />

            <div className="flex flex-1 flex-col gap-5 p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Heading title="Time & Attendance" description={role.description} />
                        </div>
                        <Badge variant="outline" className="gap-1">
                            <role.icon className="size-3" /> {role.label}
                        </Badge>
                    </div>
                    {canManage && (
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => setGeoOpen(true)}>
                                <MapPin className="size-4" /> Geofence
                            </Button>
                            <Button variant="outline" onClick={() => setCloseOpen(true)}>
                                <CalendarCheck className="size-4" /> Close a day
                            </Button>
                            <Button onClick={() => setManualTarget({})}>
                                <Plus className="size-4" /> Add time record
                            </Button>
                        </div>
                    )}
                </div>

                {/* View tabs */}
                <div className="border-b">
                    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Attendance views">
                        {orderedTabs
                            .filter((t) => t.show)
                            .map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => navigate({ view: t.id })}
                                    aria-current={view === t.id ? 'page' : undefined}
                                    className={cn(
                                        'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                                        view === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    <t.icon className="size-4" />
                                    {t.label}
                                    {!!t.badge && (
                                        <span className="rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums">{t.badge}</span>
                                    )}
                                </button>
                            ))}
                    </nav>
                </div>

                {view === 'clock' && myDay && (
                    <MyClock
                        myDay={myDay}
                        branch={branchLocation}
                        today={today}
                        onRequestCorrection={() => setRequestTarget({ entry: myDay.today, date: today, employeeId: myDay.employee.id })}
                        onOpenRequests={() => navigate({ view: 'requests' })}
                    />
                )}

                {view === 'today' && board && (
                    <TodayBoard
                        board={board}
                        canManage={canManage}
                        onEdit={(row) => setManualTarget({ employeeId: row.employee.id, date: today, entry: row.dtr ? { ...row.dtr, employee_id: row.employee.id, work_date: today, employee: row.employee } : null })}
                        onViewTimesheet={(id) => navigate({ view: 'timesheets', employee_id: id })}
                    />
                )}

                {view === 'timesheets' && (
                    <Timesheets
                        entries={entries}
                        approval={approval}
                        summary={summary}
                        periods={periods}
                        filters={filters}
                        employees={employees}
                        perspective={perspective}
                        today={today}
                        onFilter={navigate}
                        onEdit={(entry) => setManualTarget({ entry, employeeId: entry.employee_id, date: entry.work_date })}
                        onReject={setRejectEntry}
                        onRequest={(entry, type) => setRequestTarget({ entry, type, employeeId: entry.employee_id })}
                    />
                )}

                {view === 'accomplishments' && accomplishments && (
                    <AccomplishmentReport data={accomplishments} periods={periods} filters={filters} today={today} onFilter={navigate} />
                )}

                {view === 'requests' && (
                    <RequestsPanel
                        requests={attendanceRequests}
                        counts={requestCounts}
                        filters={filters}
                        perspective={perspective}
                        onFilter={navigate}
                        onReview={(request, decision) => setReview({ request, decision })}
                        onNew={() => router.visit('/employee-management/requests?file=overtime')}
                    />
                )}
            </div>

            <ManualEntryDialog open={manualTarget !== null} onOpenChange={(o) => !o && setManualTarget(null)} target={manualTarget} employees={employees} today={today} />
            <RequestDialog
                open={requestTarget !== null}
                onOpenChange={(o) => !o && setRequestTarget(null)}
                target={requestTarget}
                employees={employees}
                today={today}
                canPickEmployee={canManage}
            />
            <RejectDayDialog open={rejectEntry !== null} onOpenChange={(o) => !o && setRejectEntry(null)} entry={rejectEntry} />
            <ReviewDialog open={review !== null} onOpenChange={(o) => !o && setReview(null)} request={review?.request ?? null} decision={review?.decision ?? 'approved'} />
            {canManage && (
                <>
                    <DailyCloseDialog open={closeOpen} onOpenChange={setCloseOpen} today={today} />
                    <GeofenceDialog open={geoOpen} onOpenChange={setGeoOpen} branch={branchLocation} />
                </>
            )}
        </AppLayout>
    );
}
