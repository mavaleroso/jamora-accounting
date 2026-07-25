import { Head } from '@inertiajs/react';
import { ActivityIcon, ClockIcon, PencilIcon, PlusCircleIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import { DataTable } from '@/components/data-table';
import Heading from '@/components/heading';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/toast';
import type { AuditTrail, BreadcrumbItem } from '@/types';
import { getAuditTrailColumns, auditTrailColumnLabels, auditTrailFilterableColumns } from './components/columns';
import { ViewAuditTrailDialog } from './components/view-audit-trail-dialog';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Audit Trails', href: '/admin/audit-trails' }];

type Props = {
  auditTrails: AuditTrail[];
  total: number;
  pageSize: number;
};

function getCsrfToken(): string {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function AuditTrails({
  auditTrails: initialAuditTrails,
  total: initialTotal,
  pageSize: initialPageSize,
}: Props) {
  const [viewOpen, setViewOpen] = React.useState(false);
  const [selectedAuditTrail, setSelectedAuditTrail] = React.useState<AuditTrail | null>(null);
  const [auditTrails, setAuditTrails] = React.useState<AuditTrail[]>(initialAuditTrails);
  const [total, setTotal] = React.useState(initialTotal);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(initialPageSize);
  const [search, setSearch] = React.useState('');

  const fetchPage = React.useCallback(async (params: { pageIndex: number; pageSize: number; search?: string }) => {
    try {
      const res = await fetch('/admin/audit-trails/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-XSRF-TOKEN': getCsrfToken(),
        },
        body: JSON.stringify({
          page: params.pageIndex + 1,
          per_page: params.pageSize,
          search: params.search ?? '',
        }),
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const json = (await res.json()) as {
        audit_trails: { data?: AuditTrail[] } | AuditTrail[];
        total: number;
      };
      const data = Array.isArray(json.audit_trails) ? json.audit_trails : (json.audit_trails.data ?? []);
      setAuditTrails(data);
      setTotal(json.total);
      setPageIndex(params.pageIndex);
      setPageSize(params.pageSize);
    } catch {
      toast.error('Failed to load audit trails. Please try again.');
    }
  }, []);

  const handlePaginationChange = React.useCallback(
    (params: { pageIndex: number; pageSize: number; search?: string }) => {
      if (params.search !== undefined) {
        setSearch(params.search);
      }
      const searchToUse = params.search ?? search;
      fetchPage({
        pageIndex: params.pageIndex,
        pageSize: params.pageSize,
        search: searchToUse,
      });
    },
    [fetchPage, search],
  );

  React.useEffect(() => {
    setAuditTrails(initialAuditTrails);
    setTotal(initialTotal);
    setPageSize(initialPageSize);
  }, [initialAuditTrails, initialTotal, initialPageSize]);

  const metrics = React.useMemo(() => {
    const counts = {
      create: 0,
      update: 0,
      delete: 0,
    };
    const users = new Set<string>();
    let latestAt: string | null = null;

    auditTrails.forEach((trail) => {
      const action = (trail.action ?? '').toLowerCase();
      if (action === 'create') counts.create += 1;
      if (action === 'update') counts.update += 1;
      if (action === 'delete') counts.delete += 1;

      if (trail.user?.id != null) {
        users.add(`id:${trail.user.id}`);
      } else if (trail.user?.username) {
        users.add(`username:${trail.user.username}`);
      }

      if (trail.created_at) {
        if (!latestAt || new Date(trail.created_at) > new Date(latestAt)) {
          latestAt = trail.created_at;
        }
      }
    });

    return {
      totalRecords: total,
      pageRecords: auditTrails.length,
      uniqueUsers: users.size,
      latestAt,
      counts,
    };
  }, [auditTrails, total]);

  const columns = React.useMemo(
    () =>
      getAuditTrailColumns({
        onViewAuditTrail: (trail) => {
          setSelectedAuditTrail(trail);
          setViewOpen(true);
        },
      }),
    [],
  );

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Audit Trails" />
      <div className="flex h-full flex-1 flex-col gap-5 rounded-xl p-4">
        <div className="rounded-xl border bg-gradient-to-br from-muted/60 via-background to-muted/30 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <Heading title="Audit Trails" description="Monitor changes and request metadata across the platform." />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border bg-background px-3 py-1">
                Total records: {metrics.totalRecords.toLocaleString()}
              </span>
              <span className="rounded-full border bg-background px-3 py-1">
                Current view: {metrics.pageRecords.toLocaleString()}
              </span>
              <span className="rounded-full border bg-background px-3 py-1">
                Latest: {formatDateTime(metrics.latestAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/60 pt-3 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
              <ActivityIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-semibold tabular-nums">{metrics.totalRecords.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">All audit entries stored.</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 pt-3 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Events In View</CardTitle>
              <ClockIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-semibold tabular-nums">{metrics.pageRecords.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Based on current filters and page size.</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 pt-3 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unique Users</CardTitle>
              <UsersIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-2xl font-semibold tabular-nums">{metrics.uniqueUsers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Users captured in this view.</p>
            </CardContent>
          </Card>
          <Card className="border-border/60 py-3 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Actions Mix</CardTitle>
              <ActivityIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <PlusCircleIcon className="size-4" />
                  Create
                </span>
                <span className="tabular-nums">{metrics.counts.create.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <PencilIcon className="size-4" />
                  Update
                </span>
                <span className="tabular-nums">{metrics.counts.update.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Trash2Icon className="size-4" />
                  Delete
                </span>
                <span className="tabular-nums">{metrics.counts.delete.toLocaleString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-col gap-1 border-b border-border/60 bg-muted/30 py-5">
            <CardTitle className="text-base font-semibold">Activity Log</CardTitle>
            <CardDescription>Search, filter, and drill into the full request data.</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <DataTable
              columns={columns}
              data={auditTrails}
              filterableColumns={auditTrailFilterableColumns}
              filterPlaceholder="Search audit trails..."
              columnLabels={auditTrailColumnLabels}
              initialSorting={[{ id: 'created_at', desc: true }]}
              serverSidePagination={{
                totalRowCount: total,
                pageIndex,
                pageSize,
                search,
                onPaginationChange: handlePaginationChange,
              }}
            />
          </CardContent>
        </Card>
      </div>
      <ViewAuditTrailDialog
        open={viewOpen}
        onOpenChange={(open) => {
          setViewOpen(open);
          if (!open) setSelectedAuditTrail(null);
        }}
        auditTrail={selectedAuditTrail}
      />
    </AppLayout>
  );
}
