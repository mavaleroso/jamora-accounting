import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { AlertTriangle, Building2, CalendarCheck, ClipboardList, History, LayoutGrid, Lock, Pencil, ReceiptText, RefreshCw } from 'lucide-react';
import * as React from 'react';
import {
    EMPLOYMENT_STATUSES,
    EMPLOYMENT_TYPES,
    formatPay,
    fullName,
    labelOf,
    payEquivalents,
    statusBadgeClass,
    tenure,
    typeBadgeClass,
    type Employee,
    type LeaveTypeOption,
    type Policy,
} from '../lib';
import { EmployeeAvatar } from './employee-avatar';
import { ActivityTab, AttendanceTab, PayrollTab, RequestsTab } from './profile/history-tabs';
import { OverviewTab } from './profile/overview-tab';
import { useEmployeeOverview, type EmployeeOverview } from './profile/types';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: Employee | null;
    policy: Policy;
    leaveTypes: LeaveTypeOption[];
    onEdit: (employee: Employee) => void;
};

type TabId = 'overview' | 'payroll' | 'requests' | 'attendance' | 'activity';

const TABS: { id: TabId; label: string; icon: typeof LayoutGrid; permission?: keyof EmployeeOverview['can'] }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'payroll', label: 'Payroll', icon: ReceiptText, permission: 'payroll' },
    { id: 'requests', label: 'Requests', icon: ClipboardList, permission: 'requests' },
    { id: 'attendance', label: 'Time & attendance', icon: CalendarCheck, permission: 'attendance' },
    { id: 'activity', label: 'Activity log', icon: History, permission: 'activity' },
];

/** A headline figure in the profile header. */
function Stat({ label, value, hint, loading }: { label: string; value: React.ReactNode; hint?: React.ReactNode; loading?: boolean }) {
    return (
        <div className="min-w-0 px-4 py-3">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</p>
            {loading ? (
                <Skeleton className="mt-1 h-5 w-24" />
            ) : (
                <p className="mt-0.5 truncate font-mono text-base font-semibold tabular-nums">{value}</p>
            )}
            {hint && !loading && <p className="text-muted-foreground truncate text-[11px]">{hint}</p>}
        </div>
    );
}

export function EmployeeProfileDialog({ open, onOpenChange, employee: e, policy, leaveTypes, onEdit }: Props) {
    const [tab, setTab] = React.useState<TabId>('overview');
    const { data, loading, error, reload } = useEmployeeOverview(e?.id ?? null, open);

    // Each employee opens on the overview.
    React.useEffect(() => {
        if (open) setTab('overview');
    }, [open, e?.id]);

    if (!e) return null;

    const service = tenure(e.hire_date, e.separation_date);
    const equivalents = payEquivalents(e.pay_type, Number(e.basic_pay), policy);
    const vl = data?.leave.find((b) => b.code === 'VL');
    const sl = data?.leave.find((b) => b.code === 'SL');
    const pending = data?.requests?.counts.pending ?? 0;
    const allowed = (t: (typeof TABS)[number]) => !t.permission || !data || data.can[t.permission];

    const counts: Partial<Record<TabId, number>> = {
        payroll: data?.payroll?.payslips.length,
        requests: pending || undefined,
        activity: data?.activity?.items.length,
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[94vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl md:h-[min(92vh,920px)]">
                {/* Header */}
                <DialogHeader className="border-b px-6 pt-6 pb-4">
                    <div className="flex flex-col gap-4 pr-6 sm:flex-row sm:items-start">
                        <EmployeeAvatar employee={e} className="size-16 text-lg" />
                        <div className="min-w-0 flex-1 text-left">
                            <DialogTitle className="text-xl">{fullName(e)}</DialogTitle>
                            <DialogDescription className="mt-0.5">{e.position || 'No position assigned'}</DialogDescription>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="font-mono">
                                    {e.employee_code}
                                </Badge>
                                {e.entity && (
                                    <Badge variant="outline">
                                        <Building2 className="size-3" />
                                        {e.entity.name}
                                    </Badge>
                                )}
                                <Badge variant="outline" className={statusBadgeClass(e.employment_status)}>
                                    {labelOf(EMPLOYMENT_STATUSES, e.employment_status)}
                                </Badge>
                                <Badge variant="outline" className={typeBadgeClass(e.employment_type)}>
                                    {labelOf(EMPLOYMENT_TYPES, e.employment_type)}
                                </Badge>
                                {!e.is_active && e.employment_status !== 'separated' && (
                                    <Badge variant="outline" className="text-muted-foreground">
                                        Excluded from payroll
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <Button onClick={() => onEdit(e)} className="shrink-0">
                            <Pencil className="size-4" />
                            Edit
                        </Button>
                    </div>
                </DialogHeader>

                {/* Headline figures */}
                <div className="bg-muted/30 grid grid-cols-2 divide-x divide-y border-b sm:grid-cols-4 sm:divide-y-0">
                    <Stat
                        label="Service"
                        value={service || '—'}
                        hint={
                            e.hire_date
                                ? `Since ${new Date(`${e.hire_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                : undefined
                        }
                    />
                    <Stat label="Basic rate" value={formatPay(e)} hint={`${formatPhpCurrency(equivalents.monthly)} a month`} />
                    <Stat
                        label={data?.payroll ? `Net pay · ${data.payroll.year}` : 'Net pay'}
                        loading={loading && !data}
                        value={data?.payroll ? formatPhpCurrency(data.payroll.ytd.net) : '—'}
                        hint={
                            data?.payroll
                                ? `${data.payroll.ytd.payslips} released payslip${data.payroll.ytd.payslips === 1 ? '' : 's'}`
                                : data
                                  ? 'No payroll access'
                                  : undefined
                        }
                    />
                    <Stat
                        label="Leave available"
                        loading={loading && !data}
                        value={vl || sl ? [vl && `VL ${vl.available ?? 0}`, sl && `SL ${sl.available ?? 0}`].filter(Boolean).join(' · ') : '—'}
                        hint={pending ? `${pending} request${pending === 1 ? '' : 's'} pending` : 'Days this year'}
                    />
                </div>

                {/* Tabs */}
                <div className="border-b px-4">
                    <div role="tablist" aria-label="Employee profile" className="-mb-px flex gap-1 overflow-x-auto">
                        {TABS.filter(allowed).map((t) => {
                            const Icon = t.icon;
                            const active = t.id === tab;
                            const count = counts[t.id];
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setTab(t.id)}
                                    className={cn(
                                        'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                                        active ? 'border-primary text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
                                    )}
                                >
                                    <Icon className="size-4" />
                                    {t.label}
                                    {count ? (
                                        <span
                                            className={cn(
                                                'rounded-full px-1.5 text-[10px] leading-4 font-semibold tabular-nums',
                                                t.id === 'requests' ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {count}
                                        </span>
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {error && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            <span className="flex items-center gap-2">
                                <AlertTriangle className="size-4" /> {error}
                            </span>
                            <Button size="sm" variant="outline" onClick={reload}>
                                <RefreshCw className="size-3.5" /> Try again
                            </Button>
                        </div>
                    )}

                    {tab === 'overview' && <OverviewTab employee={e} policy={policy} leaveTypes={leaveTypes} data={data} loading={loading} />}

                    {tab !== 'overview' && loading && !data && (
                        <div className="space-y-3">
                            <Skeleton className="h-16 w-full" />
                            <Skeleton className="h-64 w-full" />
                        </div>
                    )}

                    {tab !== 'overview' && data && (
                        <>
                            {tab === 'payroll' && (data.payroll ? <PayrollTab payroll={data.payroll} /> : <NoAccess what="payroll" />)}
                            {tab === 'requests' && (data.requests ? <RequestsTab requests={data.requests} /> : <NoAccess what="requests" />)}
                            {tab === 'attendance' &&
                                (data.attendance ? <AttendanceTab attendance={data.attendance} /> : <NoAccess what="time records" />)}
                            {tab === 'activity' && (data.activity ? <ActivityTab activity={data.activity} /> : <NoAccess what="the activity log" />)}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function NoAccess({ what }: { what: string }) {
    return (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            <Lock className="size-6 opacity-60" />
            Your role does not include access to {what}.
        </div>
    );
}
