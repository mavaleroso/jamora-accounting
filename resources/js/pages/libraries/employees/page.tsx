import { Head, router, usePage } from '@inertiajs/react';
import {
    Briefcase,
    Building2,
    Calendar,
    CreditCard,
    Fingerprint,
    Mail,
    Phone,
    PlusIcon,
    Search,
    Shield,
    UserCheck,
    Users,
} from 'lucide-react';
import * as React from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import AppLayout from '@/layouts/app-layout';
import { formatPhpCurrency } from '@/lib/currency';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management/roster' },
    { title: 'Central Employee Directory', href: '/libraries/employees' },
];

type Employee = {
    id: number;
    employee_code: string;
    firstname: string;
    middlename?: string | null;
    lastname: string;
    name?: string;
    position?: string | null;
    department?: string | null;
    biometric_id?: string | null;
    email?: string | null;
    phone?: string | null;
    hire_date?: string | null;
    employment_status: string;
    pay_type: string;
    basic_pay: string | number;
    vacation_leave_credits?: string | number | null;
    sick_leave_credits?: string | number | null;
    sss_number?: string | null;
    philhealth_number?: string | null;
    pagibig_number?: string | null;
    tin?: string | null;
    bank_name?: string | null;
    bank_account_no?: string | null;
    is_active: boolean;
};

type Props = {
    employees: Employee[];
    totalEmployees: number;
    pageSize: number;
    currentPage: number;
    search?: string;
};

const OPTICAL_POSITIONS = [
    'Lead Optometrist',
    'Consultant Optometrist',
    'Optical Technician & Edger',
    'Branch Manager',
    'Senior Optical Stylist',
    'Sales Associate & Dispenser',
    'Front Desk Receptionist',
    'Finance & Accounting Officer',
    'Inventory & Billing Clerk',
];

const OPTICAL_DEPARTMENTS = [
    'Clinical Optometry',
    'Optical Sales & Lab',
    'Front Desk & Cashiering',
    'Administration & HR',
    'Finance & Accounting',
];

export default function EmployeesPage({ employees = [], totalEmployees = 0, pageSize = 10, currentPage = 1, search = '' }: Props) {
    const { errors = {} } = usePage().props as { errors?: Record<string, string> };
    const [createOpen, setCreateOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [viewOpen, setViewOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);
    const [selected, setSelected] = React.useState<Employee | null>(null);
    const [deleting, setDeleting] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState(search);
    const [departmentFilter, setDepartmentFilter] = React.useState<string>('all');

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        router.get('/libraries/employees', { search: searchQuery }, { preserveState: true });
    };

    const filteredEmployees = React.useMemo(() => {
        if (departmentFilter === 'all') return employees;
        return employees.filter((e) => e.department === departmentFilter);
    }, [employees, departmentFilter]);

    const activeCount = employees.filter((e) => e.is_active && e.employment_status === 'active').length;
    const optometristCount = employees.filter((e) => e.position?.toLowerCase().includes('optometrist')).length;

    const submit = (url: string, form: HTMLFormElement, onDone: () => void, method?: string) => {
        const fd = new FormData(form);
        if (method) fd.append('_method', method);
        router.post(url, fd, {
            preserveScroll: true,
            onSuccess: () => onDone(),
        });
    };

    const EmployeeForm = ({ defaults }: { defaults?: Employee }) => {
        const [employmentStatus, setEmploymentStatus] = React.useState(defaults?.employment_status ?? 'active');
        const [payType, setPayType] = React.useState(defaults?.pay_type ?? 'monthly');
        const [position, setPosition] = React.useState(defaults?.position ?? 'Sales Associate & Dispenser');
        const [department, setDepartment] = React.useState(defaults?.department ?? 'Optical Sales & Lab');

        return (
            <form
                className="space-y-5 py-2 max-h-[80vh] overflow-y-auto px-1"
                onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    if (defaults) {
                        submit(`/libraries/employees/${defaults.id}`, form, () => setEditOpen(false), 'PUT');
                    } else {
                        submit('/libraries/employees', form, () => {
                            setCreateOpen(false);
                            form.reset();
                        });
                    }
                }}
            >
                <input type="hidden" name="employment_status" value={employmentStatus} />
                <input type="hidden" name="pay_type" value={payType} />
                <input type="hidden" name="position" value={position} />
                <input type="hidden" name="department" value={department} />

                {/* Section 1: Identification & Profile */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-1">
                        <Users className="h-3.5 w-3.5 text-amber-600" /> Employee Identification & Branch Role
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <Label className="text-xs font-medium">Employee Code *</Label>
                            <Input
                                name="employee_code"
                                defaultValue={defaults?.employee_code}
                                placeholder="e.g. EMP-001"
                                required
                            />
                            <InputError message={errors.employee_code} />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Biometric ID (Timeclock Punch)</Label>
                            <Input
                                name="biometric_id"
                                defaultValue={defaults?.biometric_id ?? ''}
                                placeholder="e.g. BIO-101"
                            />
                            <InputError message={errors.biometric_id} />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Hire Date</Label>
                            <Input
                                name="hire_date"
                                type="date"
                                defaultValue={defaults?.hire_date ? defaults.hire_date.slice(0, 10) : ''}
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <Label className="text-xs font-medium">First Name *</Label>
                            <Input name="firstname" defaultValue={defaults?.firstname} required />
                            <InputError message={errors.firstname} />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Middle Name</Label>
                            <Input name="middlename" defaultValue={defaults?.middlename ?? ''} />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Last Name *</Label>
                            <Input name="lastname" defaultValue={defaults?.lastname} required />
                            <InputError message={errors.lastname} />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label className="text-xs font-medium">Position / Role *</Label>
                            <Select value={position} onValueChange={setPosition}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {OPTICAL_POSITIONS.map((pos) => (
                                        <SelectItem key={pos} value={pos}>
                                            {pos}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Department *</Label>
                            <Select value={department} onValueChange={setDepartment}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {OPTICAL_DEPARTMENTS.map((dept) => (
                                        <SelectItem key={dept} value={dept}>
                                            {dept}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Section 2: Contact & Compensation */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-1">
                        <CreditCard className="h-3.5 w-3.5 text-amber-600" /> Compensation & Bank Details
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                            <Label className="text-xs font-medium">Employment Status *</Label>
                            <Select value={employmentStatus} onValueChange={setEmploymentStatus}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                    <SelectItem value="separated">Separated</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Pay Frequency *</Label>
                            <Select value={payType} onValueChange={setPayType}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="daily">Daily</SelectItem>
                                    <SelectItem value="hourly">Hourly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Basic Pay Rate (PHP) *</Label>
                            <Input
                                name="basic_pay"
                                type="number"
                                step="0.01"
                                defaultValue={defaults?.basic_pay ?? ''}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label className="text-xs font-medium">Disbursement Bank</Label>
                            <Input
                                name="bank_name"
                                defaultValue={defaults?.bank_name ?? 'BDO Unibank'}
                                placeholder="e.g. BDO, BPI, UnionBank"
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Bank Account Number</Label>
                            <Input
                                name="bank_account_no"
                                defaultValue={defaults?.bank_account_no ?? ''}
                                placeholder="e.g. 0012-3456-7890"
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label className="text-xs font-medium">Email Address</Label>
                            <Input
                                name="email"
                                type="email"
                                defaultValue={defaults?.email ?? ''}
                                placeholder="employee@jamoraoptics.com"
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Mobile Phone</Label>
                            <Input
                                name="phone"
                                defaultValue={defaults?.phone ?? ''}
                                placeholder="+63 917 123 4567"
                            />
                        </div>
                    </div>
                </div>

                {/* Section 3: Statutory IDs & Leave Credits */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-1">
                        <Shield className="h-3.5 w-3.5 text-amber-600" /> Statutory Numbers & Annual Leave Credits
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-4">
                        <div>
                            <Label className="text-xs font-medium">SSS Number</Label>
                            <Input
                                name="sss_number"
                                defaultValue={defaults?.sss_number ?? ''}
                                placeholder="00-0000000-0"
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">PhilHealth ID</Label>
                            <Input
                                name="philhealth_number"
                                defaultValue={defaults?.philhealth_number ?? ''}
                                placeholder="00-000000000-0"
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Pag-IBIG / HDMF</Label>
                            <Input
                                name="pagibig_number"
                                defaultValue={defaults?.pagibig_number ?? ''}
                                placeholder="0000-0000-0000"
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">TIN</Label>
                            <Input
                                name="tin"
                                defaultValue={defaults?.tin ?? ''}
                                placeholder="000-000-000-000"
                            />
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label className="text-xs font-medium">Vacation Leave (VL) Credits</Label>
                            <Input
                                name="vacation_leave_credits"
                                type="number"
                                step="0.5"
                                defaultValue={defaults?.vacation_leave_credits ?? 15}
                            />
                        </div>
                        <div>
                            <Label className="text-xs font-medium">Sick Leave (SL) Credits</Label>
                            <Input
                                name="sick_leave_credits"
                                type="number"
                                step="0.5"
                                defaultValue={defaults?.sick_leave_credits ?? 15}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                    <Checkbox name="is_active" value="1" defaultChecked={defaults?.is_active ?? true} />
                    <Label className="font-normal text-xs">Active and eligible for shift scheduling and payroll runs</Label>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => (defaults ? setEditOpen(false) : setCreateOpen(false))}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
                    >
                        {defaults ? 'Save Changes' : 'Create Employee Record'}
                    </Button>
                </div>
            </form>
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Central Employee Directory - Jamora Accounting" />

            <div className="flex flex-1 flex-col gap-6 p-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Heading
                            title="Central Employee Directory"
                            description="Comprehensive employee profiles with optical/clinical branch roles, biometric clocking IDs, statutory numbers, compensation, and leave credits."
                        />
                    </div>
                    <Button
                        onClick={() => setCreateOpen(true)}
                        className="gap-2 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
                    >
                        <PlusIcon className="size-4" />
                        Add New Employee
                    </Button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                    <Card className="border-l-4 border-l-slate-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Total Staff</CardDescription>
                            <CardTitle className="text-2xl font-bold">{totalEmployees}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-slate-500" />
                            Registered directory profiles
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-emerald-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Active Staff</CardDescription>
                            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {activeCount}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                            Active on roster & payroll
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Optometrists</CardDescription>
                            <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                {optometristCount}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Briefcase className="h-3.5 w-3.5 text-amber-500" />
                            Licensed clinical practitioners
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-blue-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Biometric Synced</CardDescription>
                            <CardTitle className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {employees.filter((e) => Boolean(e.biometric_id)).length}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Fingerprint className="h-3.5 w-3.5 text-blue-500" />
                            Ready for attendance clocks
                        </CardContent>
                    </Card>
                </div>

                {/* Filter and Table Card */}
                <Card>
                    <CardHeader className="pb-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-2">
                                <form onSubmit={handleSearch} className="relative w-64 sm:w-80">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by name, code, biometric..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-8 text-xs"
                                    />
                                </form>

                                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                                    <SelectTrigger className="w-[190px] text-xs">
                                        <SelectValue placeholder="All Departments" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Departments</SelectItem>
                                        {OPTICAL_DEPARTMENTS.map((dept) => (
                                            <SelectItem key={dept} value={dept}>
                                                {dept}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <p className="text-muted-foreground text-xs">
                                Showing {filteredEmployees.length} of {totalEmployees} employees
                            </p>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        <div className="rounded-md border-t">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead className="w-[120px]">Code</TableHead>
                                        <TableHead>Employee & Role</TableHead>
                                        <TableHead>Department</TableHead>
                                        <TableHead>Biometric ID</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Pay Structure</TableHead>
                                        <TableHead>Leave (VL / SL)</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredEmployees.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                                No employees found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredEmployees.map((e) => (
                                            <TableRow key={e.id} className="hover:bg-muted/30">
                                                <TableCell className="font-mono text-xs font-semibold">
                                                    {e.employee_code}
                                                </TableCell>

                                                <TableCell>
                                                    <div className="font-medium text-sm text-foreground">
                                                        {e.name ?? `${e.firstname} ${e.lastname}`}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                        <Briefcase className="h-3 w-3 text-amber-600" />
                                                        {e.position || 'Staff'}
                                                    </div>
                                                </TableCell>

                                                <TableCell className="text-xs">
                                                    {e.department ? (
                                                        <Badge variant="outline" className="text-[11px] font-normal bg-muted/40">
                                                            {e.department}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground italic">—</span>
                                                    )}
                                                </TableCell>

                                                <TableCell>
                                                    {e.biometric_id ? (
                                                        <Badge variant="outline" className="font-mono text-[11px] gap-1 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300">
                                                            <Fingerprint className="h-3 w-3" />
                                                            {e.biometric_id}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs italic">Unmapped</span>
                                                    )}
                                                </TableCell>

                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[11px] ${
                                                            e.employment_status === 'active'
                                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
                                                                : 'bg-muted text-muted-foreground'
                                                        }`}
                                                    >
                                                        {e.employment_status}
                                                    </Badge>
                                                </TableCell>

                                                <TableCell>
                                                    <div className="font-mono text-xs font-medium">
                                                        {formatPhpCurrency(Number(e.basic_pay))}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground uppercase">
                                                        {e.pay_type}
                                                    </div>
                                                </TableCell>

                                                <TableCell>
                                                    <div className="text-xs font-medium">
                                                        VL: <span className="text-emerald-600 font-semibold">{e.vacation_leave_credits ?? 15}</span> / SL:{' '}
                                                        <span className="text-blue-600 font-semibold">{e.sick_leave_credits ?? 15}</span>
                                                    </div>
                                                </TableCell>

                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 px-2 text-xs"
                                                            onClick={() => {
                                                                setSelected(e);
                                                                setViewOpen(true);
                                                            }}
                                                        >
                                                            View
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 px-2 text-xs"
                                                            onClick={() => {
                                                                setSelected(e);
                                                                setEditOpen(true);
                                                            }}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 px-2 text-xs text-destructive hover:text-destructive"
                                                            onClick={() => {
                                                                setSelected(e);
                                                                setDeleteOpen(true);
                                                            }}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Create Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PlusIcon className="h-5 w-5 text-amber-600" /> Add Employee to Central Directory
                        </DialogTitle>
                        <DialogDescription>
                            Create a full employee profile with optical branch role, biometric clocking mapping, and statutory details.
                        </DialogDescription>
                    </DialogHeader>
                    <EmployeeForm />
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Briefcase className="h-5 w-5 text-amber-600" /> Edit Employee Profile
                        </DialogTitle>
                        <DialogDescription>
                            Update roles, compensation, biometric mapping, and statutory numbers for {selected?.employee_code}.
                        </DialogDescription>
                    </DialogHeader>
                    {selected && <EmployeeForm defaults={selected} />}
                </DialogContent>
            </Dialog>

            {/* View Profile Dialog */}
            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-amber-600" /> Employee Profile Card
                        </DialogTitle>
                    </DialogHeader>
                    {selected && (
                        <div className="space-y-4 pt-1 text-sm">
                            <div className="rounded-lg bg-muted/30 border p-4 flex items-center justify-between">
                                <div>
                                    <div className="font-bold text-base text-foreground">
                                        {selected.name ?? `${selected.firstname} ${selected.lastname}`}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {selected.position || 'Staff'} • {selected.department || 'Branch Operations'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <Badge variant="outline" className="font-mono text-xs">
                                        {selected.employee_code}
                                    </Badge>
                                    {selected.biometric_id && (
                                        <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 mt-1">
                                            Bio ID: {selected.biometric_id}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Employment Status</div>
                                    <div className="font-semibold mt-1 capitalize">{selected.employment_status}</div>
                                </div>
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Hire Date</div>
                                    <div className="font-semibold mt-1">{selected.hire_date || 'N/A'}</div>
                                </div>
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Basic Pay Rate</div>
                                    <div className="font-semibold mt-1 font-mono">{formatPhpCurrency(Number(selected.basic_pay))} ({selected.pay_type})</div>
                                </div>
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Leave Balances</div>
                                    <div className="font-semibold mt-1">VL: {selected.vacation_leave_credits ?? 15} days | SL: {selected.sick_leave_credits ?? 15} days</div>
                                </div>
                            </div>

                            <div className="rounded border p-3 text-xs space-y-2">
                                <div className="text-muted-foreground uppercase font-medium text-[10px]">Statutory Identifiers</div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>SSS: <span className="font-mono font-medium">{selected.sss_number || 'N/A'}</span></div>
                                    <div>PhilHealth: <span className="font-mono font-medium">{selected.philhealth_number || 'N/A'}</span></div>
                                    <div>Pag-IBIG: <span className="font-mono font-medium">{selected.pagibig_number || 'N/A'}</span></div>
                                    <div>TIN: <span className="font-mono font-medium">{selected.tin || 'N/A'}</span></div>
                                </div>
                            </div>

                            <div className="rounded border p-3 text-xs space-y-1">
                                <div className="text-muted-foreground uppercase font-medium text-[10px]">Disbursement Bank</div>
                                <div>{selected.bank_name || 'BDO Unibank'} • Account: <span className="font-mono font-medium">{selected.bank_account_no || 'Not set'}</span></div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Confirm Delete */}
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete employee"
                description={`Are you sure you want to delete "${selected?.employee_code}" (${selected?.name ?? `${selected?.firstname} ${selected?.lastname}`})? This action cannot be undone.`}
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
