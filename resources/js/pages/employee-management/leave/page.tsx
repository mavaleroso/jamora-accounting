import { Head, router, usePage } from '@inertiajs/react';
import {
    Calendar,
    CalendarOff,
    Check,
    CheckCircle2,
    Clock,
    FileText,
    Filter,
    Plus,
    RefreshCw,
    Search,
    Umbrella,
    UserCheck,
    X,
    XCircle,
} from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { hasAnyPermission } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import type { Auth, BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management/roster' },
    { title: 'Leave & Absence', href: '/employee-management/leave' },
];

type EmployeeWithBalances = {
    id: number;
    employee_code: string;
    firstname: string;
    lastname: string;
    position: string;
    vacation_leave_credits: string | number;
    sick_leave_credits: string | number;
};

type LeaveRequestItem = {
    id: number;
    leave_type: 'vacation' | 'sick' | 'emergency' | 'maternity' | 'paternity' | 'bereavement';
    start_date: string;
    end_date: string;
    days_count: number;
    reason: string | null;
    status: 'pending' | 'approved' | 'declined';
    approved_at: string | null;
    created_at: string;
    employee?: {
        id: number;
        employee_code: string;
        firstname: string;
        lastname: string;
        position: string;
        department: string;
        vacation_leave_credits: number;
        sick_leave_credits: number;
    };
    approver?: {
        id: number;
        firstname: string;
        lastname: string;
    } | null;
};

type PaginatedRequests = {
    data: LeaveRequestItem[];
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    prev_page_url: string | null;
    next_page_url: string | null;
};

type Props = {
    requests: PaginatedRequests;
    employees: EmployeeWithBalances[];
    counts: {
        pending: number;
        approved: number;
        declined: number;
    };
    filters: {
        status: string | null;
        employee_id: string | null;
    };
};

export default function LeaveManagementPage({
    requests,
    employees,
    counts,
    filters,
}: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canApproveLeave = hasAnyPermission(auth, ['leave.approve', 'payroll.manage']);

    const [isCreateOpen, setIsCreateOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Filter state
    const [statusFilter, setStatusFilter] = React.useState(filters.status || 'all');
    const [empFilter, setEmpFilter] = React.useState(filters.employee_id || 'all');

    // Form state
    const [formData, setFormData] = React.useState({
        employee_id: employees[0]?.id ? String(employees[0].id) : '',
        leave_type: 'vacation',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        days_count: '1',
        reason: '',
    });

    const handleFilterChange = (params: Record<string, string>) => {
        router.get(
            '/employee-management/leave',
            {
                status: statusFilter === 'all' ? undefined : statusFilter,
                employee_id: empFilter === 'all' ? undefined : empFilter,
                ...params,
            },
            { preserveState: true, preserveScroll: true }
        );
    };

    const handleCreateLeave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        router.post('/employee-management/leave', formData, {
            onSuccess: () => {
                toast.success('Leave request submitted.');
                setIsCreateOpen(false);
                setFormData({
                    employee_id: employees[0]?.id ? String(employees[0].id) : '',
                    leave_type: 'vacation',
                    start_date: new Date().toISOString().split('T')[0],
                    end_date: new Date().toISOString().split('T')[0],
                    days_count: '1',
                    reason: '',
                });
            },
            onError: (err) => {
                const message = Object.values(err)[0] as string;
                toast.error(message || 'Failed to submit leave.');
            },
            onFinish: () => setIsSubmitting(false),
        });
    };

    const handleUpdateStatus = (id: number, status: 'approved' | 'declined') => {
        setIsSubmitting(true);
        router.post(
            `/employee-management/leave/${id}/status`,
            { status },
            {
                onSuccess: () => toast.success(`Leave request ${status}.`),
                onError: () => toast.error('Failed to update status.'),
                onFinish: () => setIsSubmitting(false),
            }
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Leave & Absence Management" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <Heading
                            title="Leave & Absence Management"
                            description="Slide 53-54: Vacation and sick leave balances, online filing, and multi-tier approval workflow."
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => setIsCreateOpen(true)}
                            className="gap-2 shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            File Leave Request
                        </Button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Pending Approvals
                            </CardTitle>
                            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                                <Clock className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                                {counts.pending} requests
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Requires manager / admin action</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Approved Leaves
                            </CardTitle>
                            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                                {counts.approved} approved
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Credits deducted from balance</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Declined Requests
                            </CardTitle>
                            <div className="rounded-full bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
                                <XCircle className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                                {counts.declined} rejected
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Insufficient credits or conflict</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Filter Toolbar */}
                <Card className="border-border/80 shadow-xs">
                    <CardContent className="pt-4 pb-4">
                        <div className={`grid grid-cols-1 gap-3 ${canApproveLeave ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                            <Select
                                value={statusFilter}
                                onValueChange={(val) => {
                                    setStatusFilter(val);
                                    handleFilterChange({ status: val === 'all' ? '' : val });
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="All Statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Request Statuses</SelectItem>
                                    <SelectItem value="pending">Pending Approvals</SelectItem>
                                    <SelectItem value="approved">Approved</SelectItem>
                                    <SelectItem value="declined">Declined</SelectItem>
                                </SelectContent>
                            </Select>

                            {canApproveLeave && (
                                <Select
                                    value={empFilter}
                                    onValueChange={(val) => {
                                        setEmpFilter(val);
                                        handleFilterChange({ employee_id: val === 'all' ? '' : val });
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Employees" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Staff</SelectItem>
                                        {employees.map((emp) => (
                                            <SelectItem key={emp.id} value={String(emp.id)}>
                                                {emp.firstname} {emp.lastname}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}

                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => handleFilterChange({})}
                                    className="flex-1"
                                >
                                    Filter
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setStatusFilter('all');
                                        setEmpFilter('all');
                                        router.get('/employee-management/leave', {}, { preserveState: true });
                                    }}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Requests Table */}
                <Card className="border-border/80 shadow-xs">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div>
                            <CardTitle className="text-base font-semibold">Leave Applications</CardTitle>
                            <CardDescription>
                                Showing {requests.data.length} of {requests.total} applications
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Leave Type</TableHead>
                                        <TableHead>Dates</TableHead>
                                        <TableHead className="text-center">Days</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead>Remaining Balance</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {requests.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                                No leave applications found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        requests.data.map((req) => {
                                            const isPending = req.status === 'pending';
                                            return (
                                                <TableRow key={req.id} className="hover:bg-muted/30">
                                                    <TableCell>
                                                        <div className="font-semibold text-xs">
                                                            {req.employee?.firstname} {req.employee?.lastname}
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground">
                                                            {req.employee?.position}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-xs uppercase">
                                                            {req.leave_type}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs whitespace-nowrap">
                                                        {req.start_date} &rarr; {req.end_date}
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono text-xs font-semibold">
                                                        {req.days_count} day{req.days_count > 1 ? 's' : ''}
                                                    </TableCell>
                                                    <TableCell className="text-xs max-w-[200px] truncate" title={req.reason || ''}>
                                                        {req.reason || '—'}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                                            <span title="Vacation Leave">
                                                                VL: {req.employee?.vacation_leave_credits ?? 0}
                                                            </span>
                                                            <span className="text-muted-foreground">&bull;</span>
                                                            <span title="Sick Leave">
                                                                SL: {req.employee?.sick_leave_credits ?? 0}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {req.status === 'approved' ? (
                                                            <Badge
                                                                variant="outline"
                                                                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1 text-[11px]"
                                                            >
                                                                <Check className="h-3 w-3" />
                                                                Approved
                                                            </Badge>
                                                        ) : req.status === 'declined' ? (
                                                            <Badge variant="destructive" className="gap-1 text-[11px]">
                                                                <X className="h-3 w-3" />
                                                                Declined
                                                            </Badge>
                                                        ) : (
                                                            <Badge
                                                                variant="outline"
                                                                className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1 text-[11px]"
                                                            >
                                                                <Clock className="h-3 w-3" />
                                                                Pending
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {isPending ? (
                                                            canApproveLeave ? (
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    <Button
                                                                        size="sm"
                                                                        variant="outline"
                                                                        className="h-7 text-xs border-emerald-500/30 text-emerald-700 hover:bg-emerald-50"
                                                                        onClick={() => handleUpdateStatus(req.id, 'approved')}
                                                                        disabled={isSubmitting}
                                                                    >
                                                                        Approve
                                                                    </Button>
                                                                    <Button
                                                                        size="sm"
                                                                        variant="ghost"
                                                                        className="h-7 text-xs text-rose-600 hover:bg-rose-50"
                                                                        onClick={() => handleUpdateStatus(req.id, 'declined')}
                                                                        disabled={isSubmitting}
                                                                    >
                                                                        Decline
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[11px] text-amber-600 font-medium italic">
                                                                    Pending Review
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span className="text-[11px] text-muted-foreground">
                                                                {req.approver ? `by ${req.approver.firstname}` : '—'}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Modal: File Leave */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <form onSubmit={handleCreateLeave}>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Umbrella className="h-5 w-5 text-primary" />
                                File Leave Request
                            </DialogTitle>
                            <DialogDescription>
                                Submit a vacation, sick, or emergency leave application.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="leave_emp">Employee *</Label>
                                {canApproveLeave ? (
                                    <Select
                                        value={formData.employee_id}
                                        onValueChange={(val) => setFormData({ ...formData, employee_id: val })}
                                    >
                                        <SelectTrigger id="leave_emp">
                                            <SelectValue placeholder="Select employee" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {employees.map((emp) => (
                                                <SelectItem key={emp.id} value={String(emp.id)}>
                                                    {emp.firstname} {emp.lastname} (VL: {emp.vacation_leave_credits}, SL: {emp.sick_leave_credits})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                                        <div className="font-medium text-foreground">
                                            {employees[0] ? `${employees[0].firstname} ${employees[0].lastname}` : auth.user.name}
                                        </div>
                                        {employees[0] && (
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                Available VL: {employees[0].vacation_leave_credits} days &bull; SL: {employees[0].sick_leave_credits} days
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="leave_type">Leave Type *</Label>
                                <Select
                                    value={formData.leave_type}
                                    onValueChange={(val) => setFormData({ ...formData, leave_type: val })}
                                >
                                    <SelectTrigger id="leave_type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="vacation">Vacation Leave (VL)</SelectItem>
                                        <SelectItem value="sick">Sick Leave (SL)</SelectItem>
                                        <SelectItem value="emergency">Emergency Leave</SelectItem>
                                        <SelectItem value="maternity">Maternity Leave</SelectItem>
                                        <SelectItem value="paternity">Paternity Leave</SelectItem>
                                        <SelectItem value="bereavement">Bereavement Leave</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="start_date">Start Date *</Label>
                                    <Input
                                        id="start_date"
                                        type="date"
                                        value={formData.start_date}
                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="end_date">End Date *</Label>
                                    <Input
                                        id="end_date"
                                        type="date"
                                        value={formData.end_date}
                                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="days_count">Number of Days *</Label>
                                <Input
                                    id="days_count"
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    value={formData.days_count}
                                    onChange={(e) => setFormData({ ...formData, days_count: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="reason">Reason / Medical Notes</Label>
                                <Textarea
                                    id="reason"
                                    placeholder="State purpose of leave or attach medical certificate notes..."
                                    value={formData.reason}
                                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsCreateOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Submitting...' : 'Submit Request'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

