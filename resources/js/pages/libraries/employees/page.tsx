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
    companyDot,
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
    type Company,
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
    company: string;
    status: string;
    type: string;
    sort: string;
    direction: 'asc' | 'desc';
};

type Stats = {
    total: number;
    active: number;
    probationary: number;
    separated: number;
    incomplete_statutory: number;
};

type Props = {
    employees: Employee[];
    totalEmployees: number;
    pageSize: number;
    currentPage: number;
    search?: string;
    filters: Filters;
    stats: Stats;
    positions: string[];
    shiftTemplates: ShiftTemplate[];
    policy: Policy;
    leaveTypes: LeaveTypeOption[];
    linkableUsers?: LinkableUser[];
    /** Every company the user can open: the directory lists their employees together. */
    companies: Company[];
    /** Where a new employee goes unless another company is picked. */
    currentCompanyId: number | null;
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
    positions = [],
    shiftTemplates = [],
    policy,
    leaveTypes = [],
    linkableUsers = [],
    companies = [],
    currentCompanyId = null,
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
                company: filters.company,
                status: filters.status,
                type: filters.type,
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

    const hasFilters = Boolean(search || filters.company || filters.status || filters.type);
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
            value: stats.incomplete_statutory,
            icon: AlertTriangle,
            hint: 'Active employees missing gov’t IDs',
            tone: stats.incomplete_statutory > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
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
                                    ...(filters.company
                                        ? [
                                              {
                                                  key: 'company',
                                                  label: companies.find((c) => String(c.id) === filters.company)?.name ?? 'Company',
                                                  onRemove: () => query({ company: '' }),
                                              },
                                          ]
                                        : []),
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
                                ]}
                                onClearAll={() => query({ search: '', company: '', status: '', type: '' })}
                            />
                        }
                    >
                        <TableSearch
                            value={search}
                            onSearch={(value) => query({ search: value })}
                            placeholder="Search name, code, position, email…"
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
                            {companies.length > 1 && (
                                <Select value={filters.company || ALL} onValueChange={(v) => query({ company: v === ALL ? '' : v })}>
                                    <SelectTrigger
                                        className={cn('col-span-2 h-9 w-full sm:w-48', filters.company && 'border-primary/50')}
                                        aria-label="Company"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={ALL}>All companies</SelectItem>
                                        {companies.map((c) => (
                                            <SelectItem key={c.id} value={String(c.id)}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
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
                                id: 'company',
                                header: <SortButton column="company">Company</SortButton>,
                                className: 'text-sm',
                                cell: (e) =>
                                    e.entity ? (
                                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                                            <span className={cn('size-2 shrink-0 rounded-full', companyDot(companies, e.entity_id))} aria-hidden />
                                            {e.entity.name}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">—</span>
                                    ),
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
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div className="flex gap-0.5" aria-label={`${4 - missing.length} of 4 government IDs`}>
                                                    {STATUTORY_FIELDS.map((f) => (
                                                        <span
                                                            key={f.key}
                                                            className={cn(
                                                                'h-4 w-1.5 rounded-sm',
                                                                missing.includes(f) ? 'bg-muted-foreground/25' : 'bg-emerald-500',
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
                companies={companies}
                currentCompanyId={currentCompanyId}
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
                        ? `Delete ${fullName(selected)} (${selected.employee_code}${selected.entity ? `, ${selected.entity.name}` : ''})? If they have left the company, set their status to Separated instead to keep payroll and attendance history intact.`
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
