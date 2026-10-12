import { Head, router } from '@inertiajs/react';
import {
    Banknote,
    Calendar,
    CalendarCheck,
    CheckCircle2,
    Clock,
    Coffee,
    CreditCard,
    Download,
    Eye,
    Fingerprint,
    Mail,
    Phone,
    Plus,
    Umbrella,
    User,
    UserCheck,
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
import { formatPhpCurrency } from '@/lib/currency';
import { toast } from '@/lib/toast';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management/roster' },
    { title: 'Employee Portal', href: '/employee-management/portal' },
];

type EmployeeProfile = {
    id: number;
    name: string;
    code: string;
    position: string;
    department: string;
    hire_date: string | null;
    employment_status: string;
    biometric_id: string | null;
    email: string | null;
    phone: string | null;
    sss_number: string | null;
    philhealth_number: string | null;
    pagibig_number: string | null;
    tin: string | null;
    vacation_leave_credits: number;
    sick_leave_credits: number;
};

type ShiftItem = {
    id: number;
    roster_date: string;
    shift_name: string;
    shift_start: string | null;
    shift_end: string | null;
    is_rest_day: boolean;
};

type LeaveItem = {
    id: number;
    leave_type: string;
    start_date: string;
    end_date: string;
    days_count: number;
    status: 'pending' | 'approved' | 'declined';
    reason: string | null;
    created_at: string;
};

type PayslipItem = {
    id: number;
    gross_pay: string | number;
    total_deductions: string | number;
    net_pay: string | number;
    created_at: string;
    payroll_run?: {
        id: number;
        payout_date: string;
        period?: {
            period_name: string;
            start_date: string;
            end_date: string;
        };
    };
};

type Props = {
    employee: EmployeeProfile | null;
    upcomingShifts: ShiftItem[];
    recentLeaveRequests: LeaveItem[];
    recentPayslips: PayslipItem[];
};

export default function EmployeePortalPage({
    employee,
    upcomingShifts,
    recentLeaveRequests,
    recentPayslips,
}: Props) {
    const [isLeaveModalOpen, setIsLeaveModalOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [selectedPayslip, setSelectedPayslip] = React.useState<PayslipItem | null>(null);

    const [leaveForm, setLeaveForm] = React.useState({
        leave_type: 'vacation',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        days_count: '1',
        reason: '',
    });

    const handleFileLeave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        router.post('/employee-management/portal/leave-request', leaveForm, {
            onSuccess: () => {
                toast.success('Your leave request has been submitted for approval.');
                setIsLeaveModalOpen(false);
                setLeaveForm({
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

    if (!employee) {
        return (
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title="Employee Portal" />
                <div className="flex flex-1 items-center justify-center p-8">
                    <Card className="max-w-md text-center p-6">
                        <User className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                        <h2 className="text-lg font-semibold">No Employee Profile Linked</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Your user account is not currently linked to an active employee record in this entity.
                        </p>
                    </Card>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Employee Self-Service Workspace" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                {/* Profile Header Banner */}
                <Card className="border-border/80 bg-linear-to-r from-primary/10 via-background to-card shadow-xs">
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
                                    {employee.name.charAt(0)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h1 className="text-xl font-bold tracking-tight">{employee.name}</h1>
                                        <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                                            {employee.employment_status.toUpperCase()}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {employee.position} &bull; {employee.department}
                                    </p>
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1 font-mono">
                                            <Fingerprint className="h-3.5 w-3.5 text-primary" />
                                            Bio ID: {employee.biometric_id || 'N/A'}
                                        </span>
                                        {employee.email && (
                                            <span className="flex items-center gap-1">
                                                <Mail className="h-3.5 w-3.5" />
                                                {employee.email}
                                            </span>
                                        )}
                                        {employee.phone && (
                                            <span className="flex items-center gap-1">
                                                <Phone className="h-3.5 w-3.5" />
                                                {employee.phone}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    onClick={() => setIsLeaveModalOpen(true)}
                                    className="gap-2 shadow-sm"
                                >
                                    <Plus className="h-4 w-4" />
                                    File Leave Request
                                </Button>
                            </div>
                        </div>

                        {/* Statutory Reference Badges */}
                        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/80 pt-3 sm:grid-cols-4 text-xs font-mono">
                            <div>
                                <span className="text-muted-foreground">SSS No: </span>
                                <span className="font-semibold">{employee.sss_number || '—'}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">PhilHealth: </span>
                                <span className="font-semibold">{employee.philhealth_number || '—'}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Pag-IBIG: </span>
                                <span className="font-semibold">{employee.pagibig_number || '—'}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">TIN: </span>
                                <span className="font-semibold">{employee.tin || '—'}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Leave Balances KPI */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Vacation Leave Balance
                            </CardTitle>
                            <div className="rounded-full bg-primary/10 p-2 text-primary">
                                <Umbrella className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-primary">
                                {Number(employee.vacation_leave_credits).toFixed(1)} days
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Available vacation credits</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Sick Leave Balance
                            </CardTitle>
                            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                                {Number(employee.sick_leave_credits).toFixed(1)} days
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Available medical / sick credits</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Upcoming Shifts
                            </CardTitle>
                            <div className="rounded-full bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                                <CalendarCheck className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                                {upcomingShifts.filter((s) => !s.is_rest_day).length} days
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Scheduled in next 7 days</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Rest Days Scheduled
                            </CardTitle>
                            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                                <Coffee className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                                {upcomingShifts.filter((s) => s.is_rest_day).length} days
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Scheduled rest days ahead</p>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Section 1: Upcoming Schedule */}
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="text-base font-semibold">My Upcoming Schedule</CardTitle>
                                <CardDescription>Your assigned shift roster for the next 7 days</CardDescription>
                            </div>
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border/60">
                                {upcomingShifts.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-muted-foreground">
                                        No upcoming shifts published for your profile.
                                    </div>
                                ) : (
                                    upcomingShifts.map((shift) => (
                                        <div
                                            key={shift.id}
                                            className="flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="font-mono text-xs font-semibold">
                                                    {shift.roster_date}
                                                </div>
                                                <div className="text-xs font-medium">{shift.shift_name}</div>
                                            </div>

                                            {shift.is_rest_day ? (
                                                <Badge
                                                    variant="outline"
                                                    className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs gap-1"
                                                >
                                                    <Coffee className="h-3 w-3" />
                                                    Rest Day
                                                </Badge>
                                            ) : (
                                                <span className="flex items-center gap-1 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                                    <Clock className="h-3 w-3" />
                                                    {shift.shift_start?.substring(0, 5)} - {shift.shift_end?.substring(0, 5)}
                                                </span>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Section 2: Recent Leave Applications */}
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <div>
                                <CardTitle className="text-base font-semibold">My Leave Applications</CardTitle>
                                <CardDescription>Recent vacation, sick, and emergency requests</CardDescription>
                            </div>
                            <Umbrella className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border/60">
                                {recentLeaveRequests.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-muted-foreground">
                                        You have not filed any leave requests recently.
                                    </div>
                                ) : (
                                    recentLeaveRequests.map((req) => (
                                        <div
                                            key={req.id}
                                            className="flex items-center justify-between p-3.5 hover:bg-muted/20 transition-colors"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-xs uppercase">
                                                        {req.leave_type} Leave
                                                    </span>
                                                    <span className="text-xs text-muted-foreground">
                                                        ({req.days_count} day{req.days_count > 1 ? 's' : ''})
                                                    </span>
                                                </div>
                                                <div className="font-mono text-[11px] text-muted-foreground">
                                                    {req.start_date} &rarr; {req.end_date}
                                                </div>
                                            </div>

                                            <Badge
                                                variant="outline"
                                                className={
                                                    req.status === 'approved'
                                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                        : req.status === 'declined'
                                                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-700'
                                                        : 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                                                }
                                            >
                                                {req.status.toUpperCase()}
                                            </Badge>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Section 3: Recent Payslips */}
                <Card className="border-border/80 shadow-xs">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div>
                            <CardTitle className="text-base font-semibold">My Recent Payslips</CardTitle>
                            <CardDescription>Generated payroll slips and take-home pay history</CardDescription>
                        </div>
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableHead>Payroll Period</TableHead>
                                        <TableHead>Payout Date</TableHead>
                                        <TableHead className="text-right">Gross Earnings</TableHead>
                                        <TableHead className="text-right">Deductions</TableHead>
                                        <TableHead className="text-right">Net Pay</TableHead>
                                        <TableHead className="text-right">Slip</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recentPayslips.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="h-28 text-center text-muted-foreground text-xs">
                                                No payslips generated yet for this account.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        recentPayslips.map((slip) => (
                                            <TableRow key={slip.id} className="hover:bg-muted/30">
                                                <TableCell className="font-medium text-xs">
                                                    {slip.payroll_run?.period?.period_name || 'Standard Cutoff'}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {slip.payroll_run?.payout_date || '—'}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs">
                                                    {formatPhpCurrency(slip.gross_pay)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-rose-600">
                                                    -{formatPhpCurrency(slip.total_deductions)}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                    {formatPhpCurrency(slip.net_pay)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 text-xs gap-1"
                                                        onClick={() => setSelectedPayslip(slip)}
                                                    >
                                                        <Eye className="h-3 w-3" />
                                                        View
                                                    </Button>
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

            {/* Modal: File Leave Request */}
            <Dialog open={isLeaveModalOpen} onOpenChange={setIsLeaveModalOpen}>
                <DialogContent className="sm:max-w-[460px]">
                    <form onSubmit={handleFileLeave}>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Umbrella className="h-5 w-5 text-primary" />
                                Apply for Leave
                            </DialogTitle>
                            <DialogDescription>
                                Available Balance: VL ({employee.vacation_leave_credits} days) &bull; SL ({employee.sick_leave_credits} days)
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="portal_leave_type">Leave Type *</Label>
                                <Select
                                    value={leaveForm.leave_type}
                                    onValueChange={(val) => setLeaveForm({ ...leaveForm, leave_type: val })}
                                >
                                    <SelectTrigger id="portal_leave_type">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="vacation">Vacation Leave (VL)</SelectItem>
                                        <SelectItem value="sick">Sick Leave (SL)</SelectItem>
                                        <SelectItem value="emergency">Emergency Leave</SelectItem>
                                        <SelectItem value="bereavement">Bereavement Leave</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="portal_start_date">Start Date *</Label>
                                    <Input
                                        id="portal_start_date"
                                        type="date"
                                        value={leaveForm.start_date}
                                        onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="portal_end_date">End Date *</Label>
                                    <Input
                                        id="portal_end_date"
                                        type="date"
                                        value={leaveForm.end_date}
                                        onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="portal_days">Days Requested *</Label>
                                <Input
                                    id="portal_days"
                                    type="number"
                                    step="0.5"
                                    min="0.5"
                                    value={leaveForm.days_count}
                                    onChange={(e) => setLeaveForm({ ...leaveForm, days_count: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="portal_reason">Reason</Label>
                                <Textarea
                                    id="portal_reason"
                                    placeholder="Explain reason for leave..."
                                    value={leaveForm.reason}
                                    onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsLeaveModalOpen(false)}
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

            {/* Modal: View Payslip Slip */}
            <Dialog open={!!selectedPayslip} onOpenChange={() => setSelectedPayslip(null)}>
                <DialogContent className="sm:max-w-[480px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Banknote className="h-5 w-5 text-emerald-600" />
                            Official Payslip Summary
                        </DialogTitle>
                        <DialogDescription>
                            Cutoff: {selectedPayslip?.payroll_run?.period?.period_name} &bull; Payout: {selectedPayslip?.payroll_run?.payout_date}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedPayslip && (
                        <div className="space-y-4 py-2 text-sm">
                            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Employee:</span>
                                    <span className="font-semibold">{employee.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Position:</span>
                                    <span>{employee.position}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between border-b pb-1">
                                    <span className="text-muted-foreground">Gross Earnings:</span>
                                    <span className="font-mono font-semibold">{formatPhpCurrency(selectedPayslip.gross_pay)}</span>
                                </div>
                                <div className="flex justify-between border-b pb-1 text-rose-600">
                                    <span>Statutory & Tax Deductions:</span>
                                    <span className="font-mono font-semibold">-{formatPhpCurrency(selectedPayslip.total_deductions)}</span>
                                </div>
                                <div className="flex justify-between border-b-2 border-primary/40 pt-1 text-base font-bold text-emerald-600 dark:text-emerald-400">
                                    <span>Net Take-Home Pay:</span>
                                    <span className="font-mono">{formatPhpCurrency(selectedPayslip.net_pay)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedPayslip(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

