import { Head } from '@inertiajs/react';
import {
    BarChart3,
    Briefcase,
    Calendar,
    Clock,
    DollarSign,
    PieChart,
    Umbrella,
    UserCheck,
    Users,
    Zap,
} from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatPhpCurrency } from '@/lib/currency';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management/roster' },
    { title: 'People Reports', href: '/employee-management/reports' },
];

type Props = {
    headcount: {
        total: number;
        regular: number;
        probationary: number;
        byDepartment: Record<string, number>;
    };
    leaves: {
        totalRequests: number;
        byType: Record<string, { count: number; total_days: number }>;
    };
    attendance: {
        totalTardyMinutes: number;
        totalOtHours: number;
        absencesCount: number;
    };
    payrollCost: {
        totalMonthlyBasic: number;
    };
};

export default function PeopleReportsPage({
    headcount,
    leaves,
    attendance,
    payrollCost,
}: Props) {
    const deptEntries = Object.entries(headcount.byDepartment || {});
    const leaveEntries = Object.entries(leaves.byType || {});

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="People Reports & Analytics" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div>
                    <Heading
                        title="People Reports & Analytics"
                        description="Slide 61-62: Workforce headcount distribution, leave utilization, attendance analytics, and payroll cost modeling."
                    />
                </div>

                {/* KPI Top Cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Active Headcount
                            </CardTitle>
                            <div className="rounded-full bg-primary/10 p-2 text-primary">
                                <Users className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-primary">
                                {headcount.total} staff
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {headcount.regular} Regular &bull; {headcount.probationary} Probationary
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Monthly Payroll Commitment
                            </CardTitle>
                            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                                <DollarSign className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                                {formatPhpCurrency(payrollCost.totalMonthlyBasic)}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Base monthly salary obligation
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Overtime Rendered
                            </CardTitle>
                            <div className="rounded-full bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                                <Zap className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                                {Number(attendance.totalOtHours).toFixed(1)} hrs
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Total OT clocked this month
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Tardiness & Absence
                            </CardTitle>
                            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                                <Clock className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                                {attendance.totalTardyMinutes}m late
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {attendance.absencesCount} recorded absences
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Middle Analytics Cards */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Headcount by Department */}
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">Headcount by Department</CardTitle>
                            <CardDescription>Staff distribution across clinical and retail functions</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {deptEntries.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No department data recorded.</p>
                            ) : (
                                deptEntries.map(([dept, count]) => {
                                    const percentage = headcount.total > 0 ? Math.round((count / headcount.total) * 100) : 0;
                                    return (
                                        <div key={dept} className="space-y-1.5">
                                            <div className="flex justify-between text-xs">
                                                <span className="font-semibold">{dept}</span>
                                                <span className="text-muted-foreground">
                                                    {count} staff ({percentage}%)
                                                </span>
                                            </div>
                                            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-primary transition-all duration-500"
                                                    style={{ width: `${percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>

                    {/* Leave Utilization by Type */}
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader>
                            <CardTitle className="text-base font-semibold">Leave Utilization</CardTitle>
                            <CardDescription>Breakdown of vacation, sick, and emergency days consumed</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                                            <TableHead>Leave Type</TableHead>
                                            <TableHead className="text-center">Requests Filed</TableHead>
                                            <TableHead className="text-right">Total Days Consumed</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {leaveEntries.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground text-xs">
                                                    No leave applications recorded yet.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            leaveEntries.map(([type, stats]) => (
                                                <TableRow key={type} className="hover:bg-muted/20">
                                                    <TableCell className="font-medium text-xs uppercase">
                                                        <Badge variant="outline" className="text-xs">
                                                            {type}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-center font-mono text-xs">
                                                        {stats.count}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-semibold text-primary">
                                                        {stats.total_days} days
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
            </div>
        </AppLayout>
    );
}

