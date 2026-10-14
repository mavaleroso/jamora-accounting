import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ChevronLeft,
    ChevronRight,
    ChevronsUpDown,
    Eye,
    Fingerprint,
    MoreHorizontal,
    Pencil,
    PlusIcon,
    Search,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
    X,
} from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';
import { EmployeeFormDialog } from './components/employee-form-dialog';
import { EmployeeAvatar } from './components/employee-avatar';
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
    STATUTORY_FIELDS,
    statusBadgeClass,
    tenure,
    type Employee,
    type LeaveTypeOption,
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
}: Props) {
    const [formOpen, setFormOpen] = React.useState(false);
    const [viewOpen, setViewOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<Employee | null>(null);
    const [selected, setSelected] = React.useState<Employee | null>(null);
    const [deleting, setDeleting] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState(search);

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
            const clean = Object.fromEntries(
                Object.entries(params).filter(([k, v]) => v !== '' && v !== null && !(k === 'page' && v === 1)),
            );
            router.get('/libraries/employees', clean, { preserveState: true, preserveScroll: true, replace: true });
        },
        [search, filters, pageSize],
    );

    // Debounced live search
    React.useEffect(() => {
        if (searchQuery.trim() === search) return;
        const t = setTimeout(() => query({ search: searchQuery.trim() }), 350);
        return () => clearTimeout(t);
    }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const SortHead = ({ column, children, className }: { column: string; children: React.ReactNode; className?: string }) => {
        const active = filters.sort === column;
        const Icon = active ? (filters.direction === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
        return (
            <TableHead className={className}>
                <button
                    type="button"
                    onClick={() => toggleSort(column)}
                    className={cn(
                        'inline-flex items-center gap-1 hover:text-foreground',
                        active ? 'text-foreground' : 'text-muted-foreground',
                        className?.includes('text-right') && 'flex-row-reverse',
                    )}
                >
                    {children}
                    <Icon className="size-3.5" />
                </button>
            </TableHead>
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
            tone:
                stats.incomplete_records > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground',
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Employee Directory" />

            <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <Heading
                        title="Employee Directory"
                        description="Master records used by rostering, attendance, leave, benefits and payroll."
                    />
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
                                    'rounded-xl border bg-card p-4 text-left shadow-sm',
                                    s.onClick && 'transition-colors hover:border-primary/40 hover:bg-muted/40',
                                )}
                            >
                                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                                    {s.label}
                                    <Icon className="size-4" />
                                </div>
                                <div className={cn('mt-2 text-2xl font-bold tabular-nums', s.tone)}>{s.value}</div>
                                <div className="mt-1 truncate text-[11px] text-muted-foreground">{s.hint}</div>
                            </Comp>
                        );
                    })}
                </div>

                {/* Toolbar */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="relative flex-1 lg:max-w-sm">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search name, code, position, biometric ID, email…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8"
                            aria-label="Search employees"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-md border bg-muted p-0.5">
                            {[{ value: '', label: 'All' }, ...EMPLOYMENT_STATUSES].map((s) => (
                                <button
                                    key={s.value || ALL}
                                    type="button"
                                    onClick={() => query({ status: s.value })}
                                    className={cn(
                                        'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                                        filters.status === s.value
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <Select value={filters.type || ALL} onValueChange={(v) => query({ type: v === ALL ? '' : v })}>
                            <SelectTrigger className="w-[160px]">
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
                            <SelectTrigger className="w-[200px]">
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
                        {hasFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setSearchQuery('');
                                    query({ search: '', status: '', type: '', department: '' });
                                }}
                            >
                                <X className="size-4" />
                                Clear
                            </Button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <TableShell>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    <TableHead className="w-12">
                                        <span className="sr-only">Actions</span>
                                    </TableHead>
                                    <TableHead className="w-12 text-right">#</TableHead>
                                    <SortHead column="name" className="min-w-[240px]">
                                        Employee
                                    </SortHead>
                                    <TableHead className="hidden md:table-cell">Department</TableHead>
                                    <TableHead>Employment</TableHead>
                                    <SortHead column="hire_date" className="hidden lg:table-cell">
                                        Hired
                                    </SortHead>
                                    <TableHead className="hidden xl:table-cell">Schedule</TableHead>
                                    <SortHead column="basic_pay" className="text-right">
                                        Basic rate
                                    </SortHead>
                                    <TableHead className="hidden sm:table-cell">Records</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {employees.length === 0 ? (
                                    <TableRow className="hover:bg-transparent">
                                        <TableCell colSpan={9} className="h-48 text-center">
                                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                <Users className="size-8 opacity-40" />
                                                <p className="text-sm font-medium text-foreground">
                                                    {hasFilters ? 'No employees match these filters' : 'No employees yet'}
                                                </p>
                                                <p className="text-xs">
                                                    {hasFilters ? 'Try a different search or clear the filters.' : 'Add your first employee to start rostering and payroll.'}
                                                </p>
                                                {!hasFilters && (
                                                    <Button size="sm" className="mt-2" onClick={openCreate}>
                                                        <PlusIcon className="size-4" />
                                                        Add employee
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    employees.map((e, index) => {
                                        const missing = missingStatutory(e);
                                        const probationEnds =
                                            e.employment_type === 'probationary' && !e.regularization_date
                                                ? addMonths(e.hire_date, PROBATION_MONTHS)
                                                : null;
                                        const probationOverdue = probationEnds !== null && new Date(probationEnds) < new Date();
                                        const dimmed = e.employment_status === 'separated';
                                        return (
                                            <TableRow
                                                key={e.id}
                                                className={cn('cursor-pointer', dimmed && 'opacity-60')}
                                                onClick={() => openView(e)}
                                            >
                                                <TableCell onClick={(ev) => ev.stopPropagation()}>
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
                                                </TableCell>
                                                <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                                                    {(currentPage - 1) * pageSize + index + 1}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <EmployeeAvatar employee={e} />
                                                        <div className="min-w-0">
                                                            <div className="truncate font-medium">{fullName(e)}</div>
                                                            <div className="truncate text-xs text-muted-foreground">
                                                                <span className="font-mono">{e.employee_code}</span>
                                                                {e.position && <> · {e.position}</>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden text-sm md:table-cell">
                                                    {e.department || <span className="text-muted-foreground">—</span>}
                                                </TableCell>
                                                <TableCell>
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
                                                </TableCell>
                                                <TableCell className="hidden text-sm lg:table-cell">
                                                    {e.hire_date ? (
                                                        <>
                                                            <div>{formatDate(e.hire_date)}</div>
                                                            <div className="text-[11px] text-muted-foreground">{tenure(e.hire_date, e.separation_date)}</div>
                                                        </>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="hidden text-sm xl:table-cell">
                                                    <div className="truncate">
                                                        {e.default_shift_template ? e.default_shift_template.name : <span className="text-muted-foreground">Default shift</span>}
                                                    </div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {e.default_shift_template && <>{shiftRange(e.default_shift_template)} · </>}
                                                        Off {restDayLabel(e.rest_days, policy.defaultRestDays)}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-sm whitespace-nowrap tabular-nums">
                                                    {formatPay(e)}
                                                </TableCell>
                                                <TableCell className="hidden sm:table-cell">
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
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-muted-foreground">
                            {totalEmployees === 0 ? 'No results' : `Showing ${from}–${to} of ${totalEmployees}`}
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">Rows</span>
                                <Select value={String(pageSize)} onValueChange={(v) => query({ per_page: Number(v) })}>
                                    <SelectTrigger className="h-8 w-[72px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent side="top">
                                        {PAGE_SIZES.map((s) => (
                                            <SelectItem key={s} value={String(s)}>
                                                {s}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-8"
                                    disabled={currentPage <= 1}
                                    onClick={() => query({ page: currentPage - 1 })}
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft className="size-4" />
                                </Button>
                                <span className="min-w-[72px] text-center tabular-nums">
                                    {currentPage} / {pageCount}
                                </span>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="size-8"
                                    disabled={currentPage >= pageCount}
                                    onClick={() => query({ page: currentPage + 1 })}
                                    aria-label="Next page"
                                >
                                    <ChevronRight className="size-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </TableShell>
            </div>

            <EmployeeFormDialog
                open={formOpen}
                onOpenChange={setFormOpen}
                employee={editing}
                shiftTemplates={shiftTemplates}
                departments={departments}
                positions={positions}
                policy={policy}
                leaveTypes={leaveTypes}
            />

            <EmployeeProfileDialog open={viewOpen} onOpenChange={setViewOpen} employee={selected} policy={policy} leaveTypes={leaveTypes} onEdit={openEdit} />

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
