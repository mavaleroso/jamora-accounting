import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Check, FilePenLine, MoreHorizontal, Plus, Timer, X } from 'lucide-react';
import {
    ATTENDANCE_URL,
    firstError,
    fmtDate,
    fmtHours,
    fmtTime,
    fullName,
    REQUEST_STATUS,
    TONE,
    weekday,
    type AttendanceRequestRow,
    type FilterChange,
    type Filters,
    type Paginated,
    type Perspective,
} from '../lib';
import { Segmented } from './timesheets';

type Props = {
    requests: Paginated<AttendanceRequestRow>;
    counts: Record<'pending' | 'approved' | 'rejected' | 'cancelled', number>;
    filters: Filters;
    perspective: Perspective;
    onFilter: (changes: FilterChange) => void;
    onReview: (request: AttendanceRequestRow, decision: 'approved' | 'rejected') => void;
    onNew: () => void;
};

const TABS = [
    { id: 'pending', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all', label: 'All' },
] as const;

const TYPE_LABEL: Record<AttendanceRequestRow['request_type'], string> = {
    correction: 'Correction',
    overtime: 'Overtime',
    official_business: 'Official business',
    undertime: 'Undertime',
    schedule_change: 'Change of schedule',
};

const PUNCHES = [
    ['time_in', 'In'],
    ['break_out', 'Break out'],
    ['break_in', 'Break in'],
    ['time_out', 'Out'],
] as const;

const timeAgo = (iso: string) => {
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
};

/** What the request asks for, in the shape that suits its type. */
function RequestedChange({ r }: { r: AttendanceRequestRow }) {
    if (r.request_type === 'official_business') {
        return (
            <div className="text-sm whitespace-nowrap">
                <span className="font-semibold">
                    {r.requested_time_in ? `${fmtTime(r.requested_time_in)} – ${fmtTime(r.requested_time_out)}` : 'Whole day'}
                </span>
                {r.destination && <p className="text-muted-foreground text-xs">{r.destination}</p>}
            </div>
        );
    }
    if (r.request_type === 'undertime') {
        return (
            <div className="text-sm whitespace-nowrap">
                Leave at <span className="font-semibold">{fmtTime(r.requested_time_out)}</span>
            </div>
        );
    }
    if (r.request_type === 'schedule_change') {
        return (
            <div className="text-sm font-semibold whitespace-nowrap">
                {r.requested_rest_day ? 'Rest day instead of work' : `New shift ${fmtTime(r.requested_time_in)} – ${fmtTime(r.requested_time_out)}`}
            </div>
        );
    }
    if (r.request_type === 'overtime') {
        return (
            <div className="font-mono text-xs whitespace-nowrap tabular-nums">
                {r.dtr_entry?.time_out ? (
                    <>
                        <div className="font-semibold">
                            {fmtHours(r.status === 'approved' ? r.dtr_entry.ot_hours_approved : r.dtr_entry.ot_hours)}
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                            {r.status === 'approved' ? 'paid' : 'rendered'} · out {fmtTime(r.dtr_entry.time_out)}
                        </div>
                    </>
                ) : (
                    <div className="text-muted-foreground font-sans" title="Counted from the time clock once the day is worked">
                        Not yet worked
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap gap-1.5">
            {PUNCHES.filter(([k]) => r[`requested_${k}`]).map(([k, label]) => (
                <span
                    key={k}
                    className="bg-muted/40 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs whitespace-nowrap"
                >
                    <span className="text-muted-foreground font-sans">{label}</span>
                    <span className={cn(r.dtr_entry?.[k] ? 'line-through opacity-60' : 'text-rose-600 dark:text-rose-400')}>
                        {r.dtr_entry?.[k] ? fmtTime(r.dtr_entry[k]) : 'none'}
                    </span>
                    <ArrowRight className="text-muted-foreground size-3" />
                    <span className="font-semibold">{fmtTime(r[`requested_${k}`])}</span>
                </span>
            ))}
        </div>
    );
}

const COLUMN_LABELS: Record<string, string> = {
    date: 'Date',
    employee: 'Employee',
    type: 'Type',
    requested: 'Requested',
    reason: 'Reason',
    status: 'Status',
};

export function RequestsPanel({ requests, counts, filters, perspective, onFilter, onReview, onNew }: Props) {
    const { canManage, canViewTeam } = perspective;
    const total = counts.pending + counts.approved + counts.rejected + counts.cancelled;

    // The Type column only earns its place when the list mixes overtime with other requests.
    const mixedTypes = requests.data.some((r) => r.request_type !== 'overtime');

    const confirm = useConfirm();
    const cancel = async (r: AttendanceRequestRow) => {
        const ok = await confirm({ title: 'Cancel this request?', description: 'The request is withdrawn and will not be reviewed. You can file a new one if needed.', confirmLabel: 'Cancel request', variant: 'destructive' });
        if (ok) router.post(`${ATTENDANCE_URL}/requests/${r.id}/cancel`, {}, { preserveScroll: true, onError: (e) => toast.error(firstError(e)) });
    };

    const columns: ColumnDef<AttendanceRequestRow>[] = [
        {
            id: 'actions',
            cell: ({ row: { original: r } }) =>
                r.status === 'pending' && !canViewTeam ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
                                <MoreHorizontal className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            <DropdownMenuItem variant="destructive" onClick={() => cancel(r)}>
                                <X className="size-4" /> Cancel request
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : null,
        },
        {
            id: 'date',
            header: 'Date',
            cell: ({ row: { original: r } }) => (
                <div className="whitespace-nowrap">
                    <div className="text-sm font-medium">{fmtDate(r.work_date)}</div>
                    <div className="text-muted-foreground text-[11px]">
                        {weekday(r.work_date)} · filed {timeAgo(r.created_at)}
                        {r.filer && canViewTeam && ` by ${r.filer.firstname}`}
                    </div>
                </div>
            ),
            enableHiding: false,
        },
        ...(canViewTeam
            ? [
                  {
                      id: 'employee',
                      header: 'Employee',
                      cell: ({ row: { original: r } }) => (
                          <div className="flex min-w-[180px] items-center gap-2.5">
                              <PersonAvatar
                                  src={r.employee?.avatar_url}
                                  seed={r.employee?.employee_code ?? String(r.employee_id)}
                                  className="size-8"
                              />
                              <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{fullName(r.employee)}</div>
                                  <div className="text-muted-foreground truncate text-[11px]">{r.employee?.position}</div>
                              </div>
                          </div>
                      ),
                  } satisfies ColumnDef<AttendanceRequestRow>,
              ]
            : []),
        ...(mixedTypes
            ? [
                  {
                      id: 'type',
                      header: 'Type',
                      cell: ({ row: { original: r } }) => {
                          const isOt = r.request_type === 'overtime';
                          return (
                              <Badge variant="outline" className={cn('gap-1 whitespace-nowrap', isOt ? TONE.violet : TONE.sky)}>
                                  {isOt ? <Timer className="size-3" /> : <FilePenLine className="size-3" />}
                                  {TYPE_LABEL[r.request_type]}
                              </Badge>
                          );
                      },
                  } satisfies ColumnDef<AttendanceRequestRow>,
              ]
            : []),
        {
            id: 'requested',
            header: () => <div className={cn(!mixedTypes && 'text-right')}>{mixedTypes ? 'Requested' : 'Hours'}</div>,
            cell: ({ row: { original: r } }) => (
                <div className={cn(!mixedTypes && 'text-right')}>
                    <RequestedChange r={r} />
                </div>
            ),
        },
        {
            id: 'reason',
            header: 'Reason',
            cell: ({ row: { original: r } }) => (
                <div className="max-w-[320px] min-w-[200px] whitespace-normal">
                    <p className="line-clamp-2 text-sm" title={r.reason}>
                        {r.reason}
                    </p>
                    {r.review_remarks && (
                        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[11px]" title={r.review_remarks}>
                            <span className="font-medium">Reviewer:</span> {r.review_remarks}
                        </p>
                    )}
                </div>
            ),
        },
        {
            id: 'status',
            header: 'Status',
            cell: ({ row: { original: r } }) => {
                const st = REQUEST_STATUS[r.status];
                const reviewed = r.reviewer && r.reviewed_at ? `${st.label} by ${r.reviewer.firstname} ${r.reviewer.lastname}` : undefined;
                return canManage && r.status === 'pending' ? (
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 border-emerald-300 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                            onClick={() => onReview(r, 'approved')}
                        >
                            <Check className="size-3.5" /> Approve
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive h-7 gap-1 px-2"
                            onClick={() => onReview(r, 'rejected')}
                        >
                            <X className="size-3.5" /> Reject
                        </Button>
                    </div>
                ) : (
                    <Badge variant="outline" className={TONE[st.tone]} title={reviewed}>
                        {st.label}
                    </Badge>
                );
            },
        },
    ];
    // Rows come sorted from the server (pending first, newest filed first), so the headers do not sort.
    columns.forEach((c) => (c.enableSorting = false));

    return (
        <DataTable
            columns={columns}
            data={requests.data}
            filterableColumns={canViewTeam ? { employee: 'Employee' } : undefined}
            filterPlaceholder="Search name or employee code…"
            columnLabels={COLUMN_LABELS}
            enableRowSelection={false}
            getRowClassName={(r) => cn(r.status !== 'pending' && r.status !== 'approved' && 'text-muted-foreground')}
            toolbarFilterExtra={
                <Segmented
                    value={filters.request_status}
                    options={TABS.map((t) => ({ v: t.id, l: t.label, n: t.id === 'all' ? total : counts[t.id], alert: t.id === 'pending' }))}
                    onChange={(v) => onFilter({ request_status: v })}
                />
            }
            toolbarExtra={
                (!canViewTeam || canManage) && (
                    <Button size="sm" variant="outline" className="h-9" onClick={onNew}>
                        <Plus className="size-4" /> {canManage ? 'File overtime on behalf' : 'File overtime'}
                    </Button>
                )
            }
            serverSidePagination={{
                totalRowCount: requests.total,
                pageIndex: Math.max(0, requests.current_page - 1),
                pageSize: requests.per_page,
                search: filters.requests_search ?? '',
                onPaginationChange: ({ pageIndex, pageSize, search }) =>
                    onFilter({ requests_page: pageIndex + 1, requests_per_page: pageSize, requests_search: search ?? filters.requests_search }),
            }}
            emptyTitle={
                filters.requests_search
                    ? 'No overtime requests match this search.'
                    : filters.request_status === 'pending'
                      ? canManage
                          ? 'No overtime waiting on you.'
                          : 'No pending overtime.'
                      : 'No overtime requests here.'
            }
            emptyDescription={
                !canViewTeam ? (
                    <>
                        File overtime before you work it. Missed a punch? Request a correction from your timesheet. Leave and other requests are in{' '}
                        <Link href="/employee-management/requests" className="text-primary hover:underline">
                            My Requests
                        </Link>
                        .
                    </>
                ) : undefined
            }
        />
    );
}
