import { Head, router } from '@inertiajs/react';
import {
    CreditCard,
    DollarSign,
    Gift,
    HeartHandshake,
    Layers,
    Plus,
    RefreshCw,
    Shield,
    Users,
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
    { title: 'Benefits Admin', href: '/employee-management/benefits' },
];

type BenefitProgramItem = {
    id: number;
    code: string;
    name: string;
    category: 'statutory' | 'voluntary' | 'allowance';
    employer_share_default: string | number;
    employee_share_default: string | number;
    description: string | null;
    is_active: boolean;
};

type EnrollmentItem = {
    id: number;
    employee_id: number;
    employee_name: string;
    employee_code: string;
    basic_pay: number;
    program_id: number;
    program_code: string;
    program_name: string;
    category: string;
    employee_share: number;
    employer_share: number;
    total_contribution: number;
    payroll_treatment: string;
    participation_status: string;
};

type EmployeeOption = {
    id: number;
    employee_code: string;
    firstname: string;
    lastname: string;
    position: string;
};

type Props = {
    tab?: string;
    programs: BenefitProgramItem[];
    enrollments: EnrollmentItem[];
    employees: EmployeeOption[];
    totals?: {
        totalEmployerExpense: number;
        totalEmployeeDeductions: number;
        totalContributions: number;
    };
    summary?: {
        totalEmployerExpense: number;
        totalEmployeeDeductions: number;
        totalContributions?: number;
        totalPrograms?: number;
    };
};

export default function BenefitsAdministrationPage({
    programs = [],
    enrollments = [],
    employees = [],
    totals,
    summary,
}: Props) {
    const kpiTotals = {
        totalEmployerExpense: totals?.totalEmployerExpense ?? summary?.totalEmployerExpense ?? 0,
        totalEmployeeDeductions: totals?.totalEmployeeDeductions ?? summary?.totalEmployeeDeductions ?? 0,
        totalContributions:
            totals?.totalContributions ??
            summary?.totalContributions ??
            ((totals?.totalEmployerExpense ?? summary?.totalEmployerExpense ?? 0) +
                (totals?.totalEmployeeDeductions ?? summary?.totalEmployeeDeductions ?? 0)),
    };

    const [activeTab, setActiveTab] = React.useState<'enrollments' | 'programs'>('enrollments');
    const [isEnrollModalOpen, setIsEnrollModalOpen] = React.useState(false);
    const [isProgramModalOpen, setIsProgramModalOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Form: Enroll Employee
    const [enrollForm, setEnrollForm] = React.useState({
        employee_id: employees[0]?.id ? String(employees[0].id) : '',
        benefit_program_id: programs[0]?.id ? String(programs[0].id) : '',
        employee_share: '0.00',
        employer_share: '0.00',
        payroll_treatment: 'pre_tax',
    });

    // Form: Create Program
    const [programForm, setProgramForm] = React.useState({
        code: '',
        name: '',
        category: 'statutory',
        employee_share_default: '0.00',
        employer_share_default: '0.00',
        description: '',
    });

    const handleEnrollSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        router.post('/employee-management/benefits/enroll', enrollForm, {
            onSuccess: () => {
                toast.success('Employee enrolled in benefit program.');
                setIsEnrollModalOpen(false);
            },
            onError: (err) => {
                const message = Object.values(err)[0] as string;
                toast.error(message || 'Failed to enroll employee.');
            },
            onFinish: () => setIsSubmitting(false),
        });
    };

    const handleProgramSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        router.post('/employee-management/benefits/programs', programForm, {
            onSuccess: () => {
                toast.success('Benefit program created.');
                setIsProgramModalOpen(false);
            },
            onError: (err) => {
                const message = Object.values(err)[0] as string;
                toast.error(message || 'Failed to create program.');
            },
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Benefits Administration" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <Heading
                            title="Benefits Administration"
                            description="Slide 57-58: Statutory contributions (SSS, PhilHealth, Pag-IBIG) and company optical allowances."
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsProgramModalOpen(true)}
                            className="gap-2"
                        >
                            <Gift className="h-4 w-4 text-primary" />
                            New Benefit Program
                        </Button>
                        <Button
                            onClick={() => setIsEnrollModalOpen(true)}
                            className="gap-2 shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            Enroll Employee
                        </Button>
                    </div>
                </div>

                {/* KPI Summary */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Total Employer Expense
                            </CardTitle>
                            <div className="rounded-full bg-primary/10 p-2 text-primary">
                                <DollarSign className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-primary">
                                {formatPhpCurrency(kpiTotals.totalEmployerExpense)}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Monthly company-paid statutory & optical subsidies
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Employee Deductions
                            </CardTitle>
                            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                                <CreditCard className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                                {formatPhpCurrency(kpiTotals.totalEmployeeDeductions)}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Monthly payroll withholding deductions
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Total Remittance Fund
                            </CardTitle>
                            <div className="rounded-full bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                                <HeartHandshake className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
                                {formatPhpCurrency(kpiTotals.totalContributions)}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Combined employer + employee monthly pool
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('enrollments')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                            activeTab === 'enrollments'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Users className="h-4 w-4" />
                        Active Employee Enrollments ({enrollments.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('programs')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                            activeTab === 'programs'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Shield className="h-4 w-4" />
                        Programs Catalog ({programs.length})
                    </button>
                </div>

                {/* Tab 1: Enrollments Table */}
                {activeTab === 'enrollments' && (
                    <Card className="border-border/80 shadow-xs">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                                            <TableHead>Employee</TableHead>
                                            <TableHead>Program</TableHead>
                                            <TableHead>Category</TableHead>
                                            <TableHead className="text-right">Employee Share</TableHead>
                                            <TableHead className="text-right">Employer Share</TableHead>
                                            <TableHead className="text-right">Total Remittance</TableHead>
                                            <TableHead>Payroll Treatment</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {enrollments.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                                    No employee benefit enrollments found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            enrollments.map((enr) => (
                                                <TableRow key={enr.id} className="hover:bg-muted/30">
                                                    <TableCell>
                                                        <div className="font-semibold text-xs">
                                                            {enr.employee_name}
                                                        </div>
                                                        <div className="font-mono text-[11px] text-muted-foreground">
                                                            {enr.employee_code}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium text-xs">{enr.program_name}</div>
                                                        <div className="font-mono text-[11px] text-muted-foreground">
                                                            {enr.program_code}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={
                                                                enr.category === 'statutory'
                                                                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs'
                                                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs'
                                                            }
                                                        >
                                                            {enr.category.toUpperCase()}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {formatPhpCurrency(enr.employee_share)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {formatPhpCurrency(enr.employer_share)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-semibold text-primary">
                                                        {formatPhpCurrency(enr.total_contribution)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                                                            {enr.payroll_treatment.replace('_', ' ')}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs"
                                                        >
                                                            {enr.participation_status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Tab 2: Programs Catalog */}
                {activeTab === 'programs' && (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {programs.map((prog) => (
                            <Card key={prog.id} className="border-border/80 shadow-xs">
                                <CardHeader className="flex flex-row items-start justify-between pb-2">
                                    <div>
                                        <CardTitle className="text-base font-semibold">{prog.name}</CardTitle>
                                        <div className="font-mono text-xs text-muted-foreground">{prog.code}</div>
                                    </div>
                                    <Badge
                                        variant="outline"
                                        className={
                                            prog.category === 'statutory'
                                                ? 'border-blue-500/30 bg-blue-500/10 text-blue-700'
                                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                                        }
                                    >
                                        {prog.category.toUpperCase()}
                                    </Badge>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {prog.description || 'Statutory contribution or company allowance.'}
                                    </p>
                                    <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-xs space-y-1 font-mono">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Default EE Share:</span>
                                            <span className="font-semibold">{formatPhpCurrency(prog.employee_share_default)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Default ER Share:</span>
                                            <span className="font-semibold">{formatPhpCurrency(prog.employer_share_default)}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal: Enroll Employee */}
            <Dialog open={isEnrollModalOpen} onOpenChange={setIsEnrollModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <form onSubmit={handleEnrollSubmit}>
                        <DialogHeader>
                            <DialogTitle>Enroll Employee in Benefit Program</DialogTitle>
                            <DialogDescription>
                                Set contribution amounts and payroll deduction treatment.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="enroll_emp">Employee *</Label>
                                <Select
                                    value={enrollForm.employee_id}
                                    onValueChange={(val) => setEnrollForm({ ...enrollForm, employee_id: val })}
                                >
                                    <SelectTrigger id="enroll_emp">
                                        <SelectValue placeholder="Select employee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.map((emp) => (
                                            <SelectItem key={emp.id} value={String(emp.id)}>
                                                {emp.firstname} {emp.lastname} ({emp.position})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="enroll_prog">Benefit Program *</Label>
                                <Select
                                    value={enrollForm.benefit_program_id}
                                    onValueChange={(val) => {
                                        const prog = programs.find((p) => String(p.id) === val);
                                        setEnrollForm({
                                            ...enrollForm,
                                            benefit_program_id: val,
                                            employee_share: prog ? String(prog.employee_share_default) : '0.00',
                                            employer_share: prog ? String(prog.employer_share_default) : '0.00',
                                        });
                                    }}
                                >
                                    <SelectTrigger id="enroll_prog">
                                        <SelectValue placeholder="Select program" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {programs.map((p) => (
                                            <SelectItem key={p.id} value={String(p.id)}>
                                                {p.name} ({p.code})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="ee_share">Employee Share (PHP) *</Label>
                                    <Input
                                        id="ee_share"
                                        type="number"
                                        step="0.01"
                                        value={enrollForm.employee_share}
                                        onChange={(e) =>
                                            setEnrollForm({ ...enrollForm, employee_share: e.target.value })
                                        }
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="er_share">Employer Share (PHP) *</Label>
                                    <Input
                                        id="er_share"
                                        type="number"
                                        step="0.01"
                                        value={enrollForm.employer_share}
                                        onChange={(e) =>
                                            setEnrollForm({ ...enrollForm, employer_share: e.target.value })
                                        }
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="payroll_treatment">Payroll Treatment</Label>
                                <Select
                                    value={enrollForm.payroll_treatment}
                                    onValueChange={(val) =>
                                        setEnrollForm({ ...enrollForm, payroll_treatment: val })
                                    }
                                >
                                    <SelectTrigger id="payroll_treatment">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pre_tax">Pre-Tax Deduction (Statutory SSS/PH/PI)</SelectItem>
                                        <SelectItem value="post_tax">Post-Tax Voluntary Deduction</SelectItem>
                                        <SelectItem value="company_paid">Company-Paid (Non-taxable Allowance)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsEnrollModalOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Enrolling...' : 'Save Enrollment'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Modal: Create Program */}
            <Dialog open={isProgramModalOpen} onOpenChange={setIsProgramModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <form onSubmit={handleProgramSubmit}>
                        <DialogHeader>
                            <DialogTitle>Create Benefit Program</DialogTitle>
                            <DialogDescription>
                                Add a new statutory tier or company optical allowance program.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="prog_code">Program Code *</Label>
                                    <Input
                                        id="prog_code"
                                        placeholder="e.g. SSS-2026, EYEWEAR"
                                        value={programForm.code}
                                        onChange={(e) => setProgramForm({ ...programForm, code: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="prog_cat">Category *</Label>
                                    <Select
                                        value={programForm.category}
                                        onValueChange={(val) => setProgramForm({ ...programForm, category: val })}
                                    >
                                        <SelectTrigger id="prog_cat">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="statutory">Statutory (Govt Mandated)</SelectItem>
                                            <SelectItem value="allowance">Company Allowance / Subsidy</SelectItem>
                                            <SelectItem value="voluntary">Voluntary Savings</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="prog_name">Program Name *</Label>
                                <Input
                                    id="prog_name"
                                    placeholder="e.g. Annual Eyewear & Lens Subsidy"
                                    value={programForm.name}
                                    onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="ee_def">Default EE Share (PHP)</Label>
                                    <Input
                                        id="ee_def"
                                        type="number"
                                        step="0.01"
                                        value={programForm.employee_share_default}
                                        onChange={(e) =>
                                            setProgramForm({ ...programForm, employee_share_default: e.target.value })
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="er_def">Default ER Share (PHP)</Label>
                                    <Input
                                        id="er_def"
                                        type="number"
                                        step="0.01"
                                        value={programForm.employer_share_default}
                                        onChange={(e) =>
                                            setProgramForm({ ...programForm, employer_share_default: e.target.value })
                                        }
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="prog_desc">Description / Rules</Label>
                                <Textarea
                                    id="prog_desc"
                                    placeholder="State eligibility criteria, voucher value, or statutory guidelines..."
                                    value={programForm.description}
                                    onChange={(e) => setProgramForm({ ...programForm, description: e.target.value })}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsProgramModalOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Creating...' : 'Create Program'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

