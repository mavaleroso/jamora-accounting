import { ConfirmDialog } from '@/components/confirm-dialog';
import { FilterChips, ListTable, ServerPagination, TableCard, TableEmpty, TableSearch, TableToolbar } from '@/components/data-table';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ChevronsUpDown,
    Eye,
    Fingerprint,
    MoreHorizontal,
    Pencil,
    PlusIcon,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
} from 'lucide-react';
import * as React from 'react';
import { EmployeeAvatar } from './components/employee-avatar';
import { EmployeeFormDialog } from './components/employee-form-dialog';
import { EmployeeProfileDialog } from './components/employee-profile-dialog';
import {
    addMonths,
    EMPLOYMENT_STATUSES,
    EMPLOYMENT_TYPES,
    formatDate,
    formatPay,
    fullName,
    labelOf,
    missingStatutory,
    PROBATION_MONTHS,
    restDayLabel,
    shiftRange,
    statusBadgeClass,
    STATUTORY_FIELDS,
    tenure,
    type Employee,
    type LeaveTypeOption,
    type LinkableUser,
    type Policy,
    type ShiftTemplate,
} from './lib';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management' },
    { title: 'Employee Directory', href: '/libraries/employees' },
];

type Filters = {
    status: string;
    type: string;
    department: string;
    sort: string;
    direction: 'asc' | 'desc';
};

type Stats = {
    total: number;
    active: number;
    probationary: number;
    separated: number;
    unmapped_biometric: number;
    incomplete_statutory: number;
    incomplete_records: number;
};

type Props = {
    employees: Employee[];
    totalEmployees: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    filters: Filters;
    stats: Stats;
    departments: string[];
    positions: string[];
    shiftTemplates: ShiftTemplate[];
    policy: Policy;
    leaveTypes: LeaveTypeOption[];
    linkableUsers?: LinkableUser[];
};

const ALL = 'all';
const PAGE_SIZES = [10, 25, 50, 100];

export default function EmployeesPage({
    employees = [],
    totalEmployees = 0,
    pageSize = 10,
    currentPage = 1,
    search = '',
    filters,
    stats,
    departments = [],
    positions = [],
    shiftTemplates = [],
    policy,
    leaveTypes = [],
    linkableUsers = [],
}: Props) {
    const [formOpen, setFormOpen] = React.useState(false);
    const [viewOpen, setViewOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<Employee | null>(null);
    const [selected, setSelected] = React.useState<Employee | null>(null);
    const [deleting, setDeleting] = React.useState(false);

    const query = React.useCallback(
        (overrides: Partial<Filters & { search: string; page: number; per_page: number }>) => {
            const params = {
                search,
                status: filters.status,
                type: filters.type,
                department: filters.department,
                sort: filters.sort,
                direction: filters.direction,
                per_page: pageSize,
                page: 1,
                ...overrides,
            };
            const clean = Object.fromEntries(Object.entries(params).filter(([k, v]) => v !== '' && v !== null && !(k === 'page' && v === 1)));
            router.get('/libraries/employees', clean, { preserveState: true, preserveScroll: true, replace: true });
        },
        [search, filters, pageSize],
    );

    const toggleSort = (column: string) =>
        query({
            sort: column,
            direction: filters.sort === column && filters.direction === 'asc' ? 'desc' : 'asc',
            page: currentPage,
        });

    const hasFilters = Boolean(search || filters.status || filters.type || filters.department);
    const pageCount = Math.max(1, Math.ceil(totalEmployees / pageSize));
    const from = totalEmployees === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const to = Math.min(currentPage * pageSize, totalEmployees);

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };
    const openEdit = (e: Employee) => {
        setViewOpen(false);
        setEditing(e);
        setFormOpen(true);
    };
    const openView = (e: Employee) => {
        setSelected(e);
        setViewOpen(true);
    };

    const SortButton = ({ column, children, alignRight = false }: { column: string; children: React.ReactNode; alignRight?: boolean }) => {
        const active = filters.sort === column;
        const Icon = active ? (filters.direction === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
        return (
            <button
                type="button"
                onClick={() => toggleSort(column)}
                className={cn(
                    'hover:text-foreground inline-flex items-center gap-1',
                    active ? 'text-foreground' : 'text-muted-foreground',
                    alignRight && 'flex-row-reverse',
                )}
            >
                {children}
                <Icon className="size-3.5" />
            </button>
        );
    };

    const statCards = [
        { label: 'Total employees', value: stats.total, icon: Users, hint: `${stats.separated} separated`, tone: 'text-foreground' },
        {
            label: 'Active',
            value: stats.active,
            icon: UserCheck,
            hint: 'On roster & payroll',
            tone: 'text-emerald-600 dark:text-emerald-400',
            onClick: () => query({ status: 'active' }),
        },
        {
            label: 'On probation',
            value: stats.probationary,
            icon: UserPlus,
            hint: `Review within ${PROBATION_MONTHS} months of hire`,
            tone: 'text-sky-600 dark:text-sky-400',
            onClick: () => query({ status: 'active', type: 'probationary' }),
        },
        {
            label: 'Records to complete',
            value: stats.incomplete_records,
            icon: AlertTriangle,
            hint: `${stats.incomplete_statutory} missing gov’t IDs · ${stats.unmapped_biometric} no biometric`,
            tone: stats.incomplete_records > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Employee Directory" />

            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading title="Employee Directory" description="Master records used by rostering, attendance, leave, benefits and payroll." />
                    <Button onClick={openCreate} className="shrink-0 gap-2">
                        <PlusIcon className="size-4" />
                        Add employee
                    </Button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {statCards.map((s) => {
                        const Icon = s.icon;
                        const Comp = s.onClick ? 'button' : 'div';
                        return (
                            <Comp
                                key={s.label}
                                type={s.onClick ? 'button' : undefined}
                                onClick={s.onClick}
                                className={cn(
                                    'bg-card rounded-xl border p-4 text-left shadow-sm',
                                    s.onClick && 'hover:border-primary/40 hover:bg-muted/40 transition-colors',
                                )}
                            >
                                <div className="text-muted-foreground flex items-center justify-between text-xs font-medium">
                                    {s.label}
                                    <Icon className="size-4" />
                                </div>
                                <div className={cn('mt-2 text-2xl font-bold tabular-nums', s.tone)}>{s.value}</div>
                                <div className="text-muted-foreground mt-1 truncate text-[11px]">{s.hint}</div>
                            </Comp>
                        );
                    })}
                </div>

                <TableCard>
                    <TableToolbar
                        below={
                            <FilterChips
                                chips={[
                                    ...(search ? [{ key: 'search', label: `“${search}”`, onRemove: () => query({ search: '' }) }] : []),
                                    ...(filters.status
                                        ? [
                                              {
                                                  key: 'status',
                                                  label: labelOf(EMPLOYMENT_STATUSES, filters.status),
                                                  onRemove: () => query({ status: '' }),
                                              },
                                          ]
                                        : []),
                                    ...(filters.type
                                        ? [{ key: 'type', label: labelOf(EMPLOYMENT_TYPES, filters.type), onRemove: () => query({ type: '' }) }]
                                        : []),
                                    ...(filters.department
                                        ? [{ key: 'department', label: filters.department, onRemove: () => query({ department: '' }) }]
                                        : []),
                                ]}
                                onClearAll={() => query({ search: '', status: '', type: '', department: '' })}
                            />
                        }
                    >
                        <TableSearch
                            value={search}
                            onSearch={(value) => query({ search: value })}
                            placeholder="Search name, code, position, biometric ID, email…"
                            className="lg:w-80"
                        />
                        <div className="bg-muted inline-flex w-fit rounded-md border p-0.5">
                            {[{ value: '', label: 'All' }, ...EMPLOYMENT_STATUSES].map((s) => (
                                <button
                                    key={s.value || ALL}
                                    type="button"
                                    onClick={() => query({ status: s.value })}
                                    className={cn(
                                        'rounded px-3 py-1 text-sm font-medium transition-colors',
                                        filters.status === s.value
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                            <Select value={filters.type || ALL} onValueChange={(v) => query({ type: v === ALL ? '' : v })}>
                                <SelectTrigger className={cn('h-9 w-full sm:w-40', filters.type && 'border-primary/50')} aria-label="Employment type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All types</SelectItem>
                                    {EMPLOYMENT_TYPES.map((t) => (
                                        <SelectItem key={t.value} value={t.value}>
                                            {t.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={filters.department || ALL} onValueChange={(v) => query({ department: v === ALL ? '' : v })}>
                                <SelectTrigger
                                    className={cn('h-9 w-full sm:w-48', filters.department && 'border-primary/50')}
                                    aria-label="Department"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={ALL}>All departments</SelectItem>
                                    {departments.map((d) => (
                                        <SelectItem key={d} value={d}>
                                            {d}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </TableToolbar>

                    <ListTable
                        rows={employees}
                        rowKey={(e) => e.id}
                        sequenceStart={from || 1}
                        onRowClick={(e) => openView(e)}
                        rowClassName={(e) => (e.employment_status === 'separated' ? 'opacity-60' : undefined)}
                        rowAccent={(e) => (e.employment_status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/50')}
                        actions={(e) => (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${fullName(e)}`}>
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuItem onClick={() => openView(e)}>
                                        <Eye className="size-4" /> View profile
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openEdit(e)}>
                                        <Pencil className="size-4" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => {
                                            setSelected(e);
                                            setDeleteOpen(true);
                                        }}
                                    >
                                        <Trash2 className="size-4" /> Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        columns={[
                            {
                                id: 'name',
                                header: <SortButton column="name">Employee</SortButton>,
                                headerClassName: 'min-w-[240px]',
                                cell: (e) => (
                                    <div className="flex items-center gap-3">
                                        <EmployeeAvatar employee={e} />
                                        <div className="min-w-0">
                                            <div className="truncate font-medium">{fullName(e)}</div>
                                            <div className="text-muted-foreground truncate text-xs">
                                                <span className="font-mono">{e.employee_code}</span>
                                                {e.position && <> · {e.position}</>}
                                            </div>
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                id: 'department',
                                header: 'Department',
                                minScreen: 'md',
                                className: 'text-sm',
                                cell: (e) => e.department || <span className="text-muted-foreground">—</span>,
                            },
                            {
                                id: 'employment',
                                header: 'Employment',
                                cell: (e) => {
                                    const probationEnds =
                                        e.employment_type === 'probationary' && !e.regularization_date
                                            ? addMonths(e.hire_date, PROBATION_MONTHS)
                                            : null;
                                    const probationOverdue = probationEnds !== null && new Date(probationEnds) < new Date();
                                    return (
                                        <div className="flex flex-col items-start gap-1">
                                            <Badge variant="outline" className={statusBadgeClass(e.employment_status)}>
                                                {labelOf(EMPLOYMENT_STATUSES, e.employment_status)}
                                            </Badge>
                                            <span
                                                className={cn(
                                                    'text-[11px]',
                                                    probationOverdue ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                                                )}
                                            >
                                                {labelOf(EMPLOYMENT_TYPES, e.employment_type)}
                                                {probationEnds && <> · {probationOverdue ? 'review due' : `until ${formatDate(probationEnds)}`}</>}
                                            </span>
                                        </div>
                                    );
                                },
                            },
                            {
                                id: 'hired',
                                header: <SortButton column="hire_date">Hired</SortButton>,
                                minScreen: 'lg',
                                className: 'text-sm',
                                cell: (e) =>
                                    e.hire_date ? (
                                        <>
                                            <div>{formatDate(e.hire_date)}</div>
                                            <div className="text-muted-foreground text-[11px]">{tenure(e.hire_date, e.separation_date)}</div>
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    ),
                            },
                            {
                                id: 'schedule',
                                header: 'Schedule',
                                minScreen: 'xl',
                                className: 'text-sm',
                                cell: (e) => (
                                    <>
                                        <div className="truncate">
                                            {e.default_shift_template ? (
                                                e.default_shift_template.name
                                            ) : (
                                                <span className="text-muted-foreground">Default shift</span>
                                            )}
                                        </div>
                                        <div className="text-muted-foreground text-[11px]">
                                            {e.default_shift_template && <>{shiftRange(e.default_shift_template)} · </>}
                                            Off {restDayLabel(e.rest_days, policy.defaultRestDays)}
                                        </div>
                                    </>
                                ),
                            },
                            {
                                id: 'pay',
                                header: (
                                    <SortButton column="basic_pay" alignRight>
                                        Basic rate
                                    </SortButton>
                                ),
                                align: 'right',
                                className: 'font-mono text-sm whitespace-nowrap tabular-nums',
                                cell: (e) => formatPay(e),
                            },
                            {
                                id: 'records',
                                header: 'Records',
                                minScreen: 'sm',
                                cell: (e) => {
                                    const missing = missingStatutory(e);
                                    return (
                                        <div className="flex items-center gap-2">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="flex gap-0.5" aria-label={`${4 - missing.length} of 4 government IDs`}>
                                                        {STATUTORY_FIELDS.map((f) => (
                                                            <span
                                                                key={f.key}
                                                                className={cn(
                                                                    'h-4 w-1.5 rounded-sm',
                                                                    e[f.key] ? 'bg-emerald-500' : 'bg-muted-foreground/25',
                                                                )}
                                                            />
                                                        ))}
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {missing.length === 0
                                                        ? 'All government IDs on file'
                                                        : `Missing: ${missing.map((m) => m.label).join(', ')}`}
                                                </TooltipContent>
                                            </Tooltip>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Fingerprint
                                                        className={cn(
                                                            'size-4',
                                                            e.biometric_id ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground/40',
                                                        )}
                                                    />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {e.biometric_id ? `Biometric ID ${e.biometric_id}` : 'No biometric ID mapped'}
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    );
                                },
                            },
                        ]}
                        empty={
                            <TableEmpty
                                icon={Users}
                                title={hasFilters ? 'No employees match these filters' : 'No employees yet'}
                                description={
                                    hasFilters
                                        ? 'Try a different search or clear the filters.'
                                        : 'Add your first employee to start rostering and payroll.'
                                }
                                action={
                                    !hasFilters && (
                                        <Button size="sm" onClick={openCreate}>
                                            <PlusIcon className="size-4" />
                                            Add employee
                                        </Button>
                                    )
                                }
                            />
                        }
                    />

                    <ServerPagination
                        page={currentPage}
                        lastPage={pageCount}
                        perPage={pageSize}
                        total={totalEmployees}
                        from={totalEmployees === 0 ? null : from}
                        to={totalEmployees === 0 ? null : to}
                        pageSizes={PAGE_SIZES}
                        onPage={(page) => query({ page })}
                        onPerPage={(per_page) => query({ per_page })}
                    />
                </TableCard>
            </div>

            <EmployeeFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                employee={editing}
                shiftTemplates={shiftTemplates}
                positions={positions}
                policy={policy}
                leaveTypes={leaveTypes}
                linkableUsers={linkableUsers}
            />

            <EmployeeProfileDialog
                open={viewOpen}
                onOpenChange={setViewOpen}
                employee={selected}
                policy={policy}
                leaveTypes={leaveTypes}
                onEdit={openEdit}
            />

            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete employee"
                description={
                    selected
                        ? `Delete ${fullName(selected)} (${selected.employee_code})? If they have left the company, set their status to Separated instead to keep payroll and attendance history intact.`
                        : ''
                }
                confirmLabel="Delete"
                variant="destructive"
                loading={deleting}
                onConfirm={() => {
                    if (!selected) return;
                    setDeleting(true);
                    router.delete(`/libraries/employees/${selected.id}`, {
                        preserveScroll: true,
                        onSuccess: () => {
                            setDeleteOpen(false);
                            setSelected(null);
                        },
                        onFinish: () => setDeleting(false),
                    });
                }}
            />
        </AppLayout>
    );
}
