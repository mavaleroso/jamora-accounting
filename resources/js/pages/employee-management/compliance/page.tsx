import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    Building2,
    Calendar,
    CheckCircle2,
    Clock,
    DollarSign,
    FileCheck,
    FileText,
    Filter,
    Plus,
    RefreshCw,
    Scale,
    Search,
    ShieldAlert,
    ShieldCheck,
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
    { title: 'Compliance Management', href: '/employee-management/compliance' },
];

type ComplianceCategory = 'statutory_tax' | 'statutory_payroll' | 'local_government' | 'regulatory';
type ComplianceStatus = 'pending' | 'prepared' | 'submitted' | 'verified';

type ComplianceItemData = {
    id: number;
    title: string;
    category: ComplianceCategory;
    period: string;
    due_date: string | null;
    owner_role: string;
    status: ComplianceStatus;
    reference_no: string | null;
    amount: number;
    notes: string | null;
    verified_by: string | null;
    verified_at: string | null;
};

type ComplianceSummary = {
    total: number;
    pending: number;
    prepared: number;
    submitted: number;
    verified: number;
};

type Props = {
    items: ComplianceItemData[];
    summary: ComplianceSummary;
    filters: {
        category?: string;
        status?: string;
        period?: string;
    };
};

const CATEGORY_MAP: Record<ComplianceCategory, { label: string; badge: string; icon: typeof FileText }> = {
    statutory_tax: {
        label: 'Statutory Tax (BIR)',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300',
        icon: Scale,
    },
    statutory_payroll: {
        label: 'Statutory Payroll (SSS/PHIC/HDMF)',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300',
        icon: FileSpreadsheetIcon,
    },
    local_government: {
        label: 'Local Government (LGU)',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300',
        icon: Building2,
    },
    regulatory: {
        label: 'Regulatory & DOLE',
        badge: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300',
        icon: ShieldAlert,
    },
};

function FileSpreadsheetIcon(props: React.SVGProps<SVGSVGElement>) {
    return <FileText {...props} />;
}

const STATUS_CONFIG: Record<ComplianceStatus, { label: string; badge: string; icon: typeof Clock }> = {
    pending: {
        label: 'Pending',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300',
        icon: Clock,
    },
    prepared: {
        label: 'Prepared',
        badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300',
        icon: FileText,
    },
    submitted: {
        label: 'Submitted / For Payment',
        badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300',
        icon: FileCheck,
    },
    verified: {
        label: 'Verified & Compliant',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300',
        icon: CheckCircle2,
    },
};

const TEMPLATE_PRESETS = [
    { title: 'BIR Form 1601-C (Monthly Remittance Return of Income Taxes Withheld on Compensation)', category: 'statutory_tax', owner: 'Finance & Accounting' },
    { title: 'BIR Form 2550Q (Quarterly Value-Added Tax Return)', category: 'statutory_tax', owner: 'CPA Consultant / Accounting' },
    { title: 'BIR Form 1702-RT (Annual Income Tax Return for Corporation)', category: 'statutory_tax', owner: 'Finance & Accounting' },
    { title: 'SSS R-3 Contribution Collection List & Payment', category: 'statutory_payroll', owner: 'HR / Payroll' },
    { title: 'PhilHealth EPRS Monthly Contribution Remittance', category: 'statutory_payroll', owner: 'HR / Accounting' },
    { title: 'Pag-IBIG MCR Monthly Contribution Remittance', category: 'statutory_payroll', owner: 'HR / Accounting' },
    { title: 'LGU Mayor’s Business Permit Annual Renewal & Clearance', category: 'local_government', owner: 'Branch Operations Admin' },
    { title: 'DOLE 13th Month Pay Compliance Report', category: 'regulatory', owner: 'HR & People Operations' },
];

export default function ComplianceManagementPage({ items = [], summary, filters = {} }: Props) {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState<string>(filters.category || 'all');
    const [selectedStatus, setSelectedStatus] = React.useState<string>(filters.status || 'all');

    // Modals
    const [createModalOpen, setCreateModalOpen] = React.useState(false);
    const [verifyModalOpen, setVerifyModalOpen] = React.useState(false);
    const [detailModalOpen, setDetailModalOpen] = React.useState(false);
    const [activeItem, setActiveItem] = React.useState<ComplianceItemData | null>(null);

    // Create form state
    const [createForm, setCreateForm] = React.useState({
        title: '',
        category: 'statutory_tax' as ComplianceCategory,
        period: 'September 2026',
        due_date: new Date().toISOString().slice(0, 10),
        owner_role: 'Finance & Accounting',
        status: 'pending' as ComplianceStatus,
        reference_no: '',
        amount: '',
        notes: '',
    });
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    // Verify form state
    const [verifyForm, setVerifyForm] = React.useState({
        reference_no: '',
        amount: '',
        notes: '',
    });

    const filteredItems = React.useMemo(() => {
        return items.filter((item) => {
            if (selectedCategory !== 'all' && item.category !== selectedCategory) {
                return false;
            }
            if (selectedStatus !== 'all' && item.status !== selectedStatus) {
                return false;
            }
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchTitle = item.title.toLowerCase().includes(query);
                const matchPeriod = item.period.toLowerCase().includes(query);
                const matchRef = item.reference_no?.toLowerCase().includes(query) ?? false;
                const matchOwner = item.owner_role.toLowerCase().includes(query);
                if (!matchTitle && !matchPeriod && !matchRef && !matchOwner) {
                    return false;
                }
            }
            return true;
        });
    }, [items, selectedCategory, selectedStatus, searchQuery]);

    const totalAmount = React.useMemo(() => {
        return items.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    }, [items]);

    const verifiedAmount = React.useMemo(() => {
        return items
            .filter((item) => item.status === 'verified')
            .reduce((acc, curr) => acc + (curr.amount || 0), 0);
    }, [items]);

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        router.post(
            '/employee-management/compliance',
            {
                ...createForm,
                amount: createForm.amount ? parseFloat(createForm.amount) : null,
            },
            {
                onSuccess: () => {
                    toast.success('Compliance requirement created successfully.');
                    setCreateModalOpen(false);
                    setCreateForm({
                        title: '',
                        category: 'statutory_tax',
                        period: 'September 2026',
                        due_date: new Date().toISOString().slice(0, 10),
                        owner_role: 'Finance & Accounting',
                        status: 'pending',
                        reference_no: '',
                        amount: '',
                        notes: '',
                    });
                },
                onError: (err) => {
                    toast.error('Failed to create compliance item. Please check the fields.');
                },
                onFinish: () => setIsSubmitting(false),
            }
        );
    };

    const handleOpenVerify = (item: ComplianceItemData) => {
        setActiveItem(item);
        setVerifyForm({
            reference_no: item.reference_no || '',
            amount: item.amount ? String(item.amount) : '',
            notes: item.notes || '',
        });
        setVerifyModalOpen(true);
    };

    const handleVerifySubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeItem) return;

        setIsSubmitting(true);
        router.post(
            `/employee-management/compliance/${activeItem.id}/verify`,
            {
                reference_no: verifyForm.reference_no,
                amount: verifyForm.amount ? parseFloat(verifyForm.amount) : null,
                notes: verifyForm.notes,
            },
            {
                onSuccess: () => {
                    toast.success(`Compliance item "${activeItem.title}" verified and marked compliant.`);
                    setVerifyModalOpen(false);
                },
                onError: () => {
                    toast.error('Verification failed. Please try again.');
                },
                onFinish: () => setIsSubmitting(false),
            }
        );
    };

    const applyPreset = (preset: typeof TEMPLATE_PRESETS[0]) => {
        setCreateForm((prev) => ({
            ...prev,
            title: preset.title,
            category: preset.category as ComplianceCategory,
            owner_role: preset.owner,
        }));
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Statutory & Regulatory Compliance - Jamora Accounting" />

            <div className="flex flex-1 flex-col gap-6 p-6">
                {/* Header */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Heading
                            title="Compliance Management"
                            description="Track and audit Philippine statutory filings, tax deadlines (BIR), payroll contributions (SSS, PHIC, HDMF), and local regulatory clearances across branches."
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.reload({ only: ['items', 'summary'] })}
                            className="gap-2"
                        >
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setCreateModalOpen(true)}
                            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
                        >
                            <Plus className="h-4 w-4" />
                            Add Compliance Tracker
                        </Button>
                    </div>
                </div>

                {/* KPI Metrics */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <Card className="border-l-4 border-l-slate-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Total Trackers</CardDescription>
                            <CardTitle className="text-2xl font-bold">{summary?.total ?? items.length}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Scale className="h-3.5 w-3.5 text-slate-500" />
                            All active periods
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Pending / Draft</CardDescription>
                            <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                {(summary?.pending ?? 0) + (summary?.prepared ?? 0)}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                            Needs preparation or review
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-indigo-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Submitted / Remittance</CardDescription>
                            <CardTitle className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                                {summary?.submitted ?? 0}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <FileCheck className="h-3.5 w-3.5 text-indigo-500" />
                            Awaiting settlement verification
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-emerald-500">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Verified & Compliant</CardDescription>
                            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {summary?.verified ?? 0}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                            Fully audited & acknowledged
                        </CardContent>
                    </Card>

                    <Card className="border-l-4 border-l-amber-600">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-xs uppercase font-medium">Total Compliance Value</CardDescription>
                            <CardTitle className="text-xl font-bold text-amber-800 dark:text-amber-300">
                                {formatPhpCurrency(totalAmount)}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0 text-xs text-muted-foreground flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-amber-600" />
                            Verified: {formatPhpCurrency(verifiedAmount)}
                        </CardContent>
                    </Card>
                </div>

                {/* Important Deadlines Notice Banner */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <span className="font-semibold text-amber-900 dark:text-amber-200">
                                Philippine Statutory Calendar Quick Rules:
                            </span>{' '}
                            <span className="text-amber-800 dark:text-amber-300">
                                BIR 1601-C is due on the 10th of every month (or 15th for eFPS tier). SSS R-3 and PhilHealth EPRS are due on or before the last day / 20th of the following month. Pag-IBIG remittances are due by the 15th. Verify payments with bank debit advice before closing periods.
                            </span>
                        </div>
                    </div>
                </div>

                {/* Main Table Card */}
                <Card>
                    <CardHeader className="pb-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <CardTitle className="text-lg">Statutory Filing Register</CardTitle>
                                <CardDescription>
                                    List of all compliance requirements, payment reference codes, and sign-offs for this entity.
                                </CardDescription>
                            </div>

                            {/* Filters Bar */}
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative w-48 sm:w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search title, ref#, owner..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-8 text-xs"
                                    />
                                </div>

                                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                    <SelectTrigger className="w-[180px] text-xs">
                                        <SelectValue placeholder="All Categories" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Categories</SelectItem>
                                        <SelectItem value="statutory_tax">Tax (BIR)</SelectItem>
                                        <SelectItem value="statutory_payroll">Payroll (SSS/PHIC/HDMF)</SelectItem>
                                        <SelectItem value="local_government">Local Govt (LGU)</SelectItem>
                                        <SelectItem value="regulatory">Regulatory & DOLE</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                                    <SelectTrigger className="w-[150px] text-xs">
                                        <SelectValue placeholder="All Statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Statuses</SelectItem>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="prepared">Prepared</SelectItem>
                                        <SelectItem value="submitted">Submitted</SelectItem>
                                        <SelectItem value="verified">Verified</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        <div className="rounded-md border-t">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40">
                                        <TableHead className="w-[280px]">Requirement / Description</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead>Period</TableHead>
                                        <TableHead>Due Date</TableHead>
                                        <TableHead>Owner Role</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Ref Number</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredItems.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="h-36 text-center text-muted-foreground">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <FileCheck className="h-8 w-8 text-muted-foreground/50" />
                                                    <p>No compliance requirements found matching your criteria.</p>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSearchQuery('');
                                                            setSelectedCategory('all');
                                                            setSelectedStatus('all');
                                                        }}
                                                    >
                                                        Clear filters
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredItems.map((item) => {
                                            const catConfig = CATEGORY_MAP[item.category] || {
                                                label: item.category,
                                                badge: 'bg-muted text-muted-foreground',
                                                icon: FileText,
                                            };
                                            const statusConfig = STATUS_CONFIG[item.status] || {
                                                label: item.status,
                                                badge: 'bg-muted text-muted-foreground',
                                                icon: Clock,
                                            };
                                            const StatusIcon = statusConfig.icon;
                                            const isOverdue =
                                                item.due_date &&
                                                new Date(item.due_date) < new Date() &&
                                                item.status !== 'verified';

                                            return (
                                                <TableRow key={item.id} className="hover:bg-muted/30">
                                                    <TableCell>
                                                        <div className="font-semibold text-sm text-foreground">
                                                            {item.title}
                                                        </div>
                                                        {item.notes && (
                                                            <div className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
                                                                {item.notes}
                                                            </div>
                                                        )}
                                                    </TableCell>

                                                    <TableCell>
                                                        <Badge variant="outline" className={`text-[11px] font-normal ${catConfig.badge}`}>
                                                            {catConfig.label}
                                                        </Badge>
                                                    </TableCell>

                                                    <TableCell className="text-sm font-medium">
                                                        {item.period}
                                                    </TableCell>

                                                    <TableCell>
                                                        <div className="flex items-center gap-1.5 text-xs">
                                                            <Calendar className={`h-3.5 w-3.5 ${isOverdue ? 'text-red-500' : 'text-muted-foreground'}`} />
                                                            <span className={isOverdue ? 'text-red-600 font-bold dark:text-red-400' : ''}>
                                                                {item.due_date || 'No deadline'}
                                                            </span>
                                                        </div>
                                                        {isOverdue && (
                                                            <span className="text-[10px] text-red-500 uppercase font-semibold">Overdue</span>
                                                        )}
                                                    </TableCell>

                                                    <TableCell className="text-xs text-muted-foreground">
                                                        {item.owner_role}
                                                    </TableCell>

                                                    <TableCell className="text-right font-mono font-medium text-sm">
                                                        {item.amount > 0 ? formatPhpCurrency(item.amount) : '—'}
                                                    </TableCell>

                                                    <TableCell>
                                                        {item.reference_no ? (
                                                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">
                                                                {item.reference_no}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs italic">Unassigned</span>
                                                        )}
                                                    </TableCell>

                                                    <TableCell>
                                                        <Badge variant="outline" className={`gap-1 text-[11px] ${statusConfig.badge}`}>
                                                            <StatusIcon className="h-3 w-3" />
                                                            {statusConfig.label}
                                                        </Badge>
                                                    </TableCell>

                                                    <TableCell className="text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-8 px-2 text-xs"
                                                                onClick={() => {
                                                                    setActiveItem(item);
                                                                    setDetailModalOpen(true);
                                                                }}
                                                            >
                                                                Details
                                                            </Button>

                                                            {item.status !== 'verified' ? (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8 px-2.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950/40 gap-1"
                                                                    onClick={() => handleOpenVerify(item)}
                                                                >
                                                                    <ShieldCheck className="h-3.5 w-3.5" />
                                                                    Verify
                                                                </Button>
                                                            ) : (
                                                                <span className="text-[11px] text-emerald-600 font-semibold px-2 flex items-center gap-1 dark:text-emerald-400">
                                                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                                                    Verified
                                                                </span>
                                                            )}
                                                        </div>
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

                {/* Audit & Compliance Assurance Notice */}
                <Card className="border-dashed bg-muted/20">
                    <CardHeader className="py-3">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <CardTitle className="text-sm">Compliance & Audit Sign-off Standard</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground leading-relaxed">
                        In accordance with Philippine Bureau of Internal Revenue (BIR) Revenue Regulations, Social Security System (SSS) guidelines, PhilHealth Circulars, and Home Development Mutual Fund (Pag-IBIG) mandates, each monthly or quarterly statutory return must maintain a verifiable electronic confirmation receipt or official deposit acknowledgment. Verified items are permanently logged with the verifying user identity and timestamp.
                    </CardContent>
                </Card>
            </div>

            {/* Create Compliance Item Modal */}
            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-amber-600" />
                            Create Compliance Tracker
                        </DialogTitle>
                        <DialogDescription>
                            Add a statutory filing, tax schedule, or local regulatory renewal for this accounting entity.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Presets Quick Picker */}
                    <div className="space-y-2 rounded-md bg-muted/40 p-3 border">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Quick Templates & Standards
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                            {TEMPLATE_PRESETS.map((p, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => applyPreset(p)}
                                    className="text-[11px] rounded bg-background border px-2 py-1 text-left hover:border-amber-500 hover:text-amber-600 transition-colors"
                                >
                                    {p.title.split('(')[0].trim()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="title" className="text-xs font-semibold">
                                Requirement Title / Form Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="title"
                                required
                                value={createForm.title}
                                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                                placeholder="e.g. BIR Form 1601-C (Withholding Tax - Compensation)"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="category" className="text-xs font-semibold">
                                    Regulatory Category <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                    value={createForm.category}
                                    onValueChange={(val: ComplianceCategory) => setCreateForm({ ...createForm, category: val })}
                                >
                                    <SelectTrigger id="category">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="statutory_tax">Statutory Tax (BIR)</SelectItem>
                                        <SelectItem value="statutory_payroll">Statutory Payroll (SSS / PHIC / HDMF)</SelectItem>
                                        <SelectItem value="local_government">Local Government (LGU / Permits)</SelectItem>
                                        <SelectItem value="regulatory">Regulatory & DOLE</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="period" className="text-xs font-semibold">
                                    Applicable Period <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="period"
                                    required
                                    value={createForm.period}
                                    onChange={(e) => setCreateForm({ ...createForm, period: e.target.value })}
                                    placeholder="e.g. September 2026 or Q3 2026"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="due_date" className="text-xs font-semibold">
                                    Statutory Due Date <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="due_date"
                                    type="date"
                                    required
                                    value={createForm.due_date}
                                    onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="owner_role" className="text-xs font-semibold">
                                    Responsible Officer / Owner Role <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="owner_role"
                                    required
                                    value={createForm.owner_role}
                                    onChange={(e) => setCreateForm({ ...createForm, owner_role: e.target.value })}
                                    placeholder="e.g. Finance & Accounting or HR / Payroll"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="status" className="text-xs font-semibold">
                                    Initial Status
                                </Label>
                                <Select
                                    value={createForm.status}
                                    onValueChange={(val: ComplianceStatus) => setCreateForm({ ...createForm, status: val })}
                                >
                                    <SelectTrigger id="status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="prepared">Prepared</SelectItem>
                                        <SelectItem value="submitted">Submitted</SelectItem>
                                        <SelectItem value="verified">Verified</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="reference_no" className="text-xs font-semibold">
                                    Filing Ref / eFPS Confirmation #
                                </Label>
                                <Input
                                    id="reference_no"
                                    value={createForm.reference_no}
                                    onChange={(e) => setCreateForm({ ...createForm, reference_no: e.target.value })}
                                    placeholder="e.g. BIR-1601C-2026-09-001"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="amount" className="text-xs font-semibold">
                                    Remittance Amount (PHP)
                                </Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={createForm.amount}
                                    onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="notes" className="text-xs font-semibold">
                                Internal Notes & Instructions
                            </Label>
                            <Textarea
                                id="notes"
                                rows={3}
                                value={createForm.notes}
                                onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                                placeholder="Add payment channels, bank accounts used, or CPA review notes..."
                            />
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCreateModalOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
                            >
                                {isSubmitting ? 'Saving...' : 'Create Tracker'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Verify & Settle Modal */}
            <Dialog open={verifyModalOpen} onOpenChange={setVerifyModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-emerald-600" />
                            Verify & Mark Compliant
                        </DialogTitle>
                        <DialogDescription>
                            Sign off this statutory filing as verified against official government acknowledgement and bank debit proof.
                        </DialogDescription>
                    </DialogHeader>

                    {activeItem && (
                        <form onSubmit={handleVerifySubmit} className="space-y-4 pt-2">
                            <div className="rounded-md bg-muted/40 p-3 space-y-1 border text-xs">
                                <div className="font-semibold text-foreground text-sm">{activeItem.title}</div>
                                <div className="text-muted-foreground">
                                    Period: <span className="font-medium text-foreground">{activeItem.period}</span> | Due:{' '}
                                    <span className="font-medium text-foreground">{activeItem.due_date || 'N/A'}</span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="verify_ref" className="text-xs font-semibold">
                                    Government Ref # / Bank Debit Advice No.
                                </Label>
                                <Input
                                    id="verify_ref"
                                    value={verifyForm.reference_no}
                                    onChange={(e) => setVerifyForm({ ...verifyForm, reference_no: e.target.value })}
                                    placeholder="e.g. EPRS-2026-SEP-0098 / OR# 88471"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="verify_amount" className="text-xs font-semibold">
                                    Final Settled Amount (PHP)
                                </Label>
                                <Input
                                    id="verify_amount"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={verifyForm.amount}
                                    onChange={(e) => setVerifyForm({ ...verifyForm, amount: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="verify_notes" className="text-xs font-semibold">
                                    Audit Remarks / Settle Confirmation
                                </Label>
                                <Textarea
                                    id="verify_notes"
                                    rows={2}
                                    value={verifyForm.notes}
                                    onChange={(e) => setVerifyForm({ ...verifyForm, notes: e.target.value })}
                                    placeholder="Settled via online BDO bank debit. Receipt filed."
                                />
                            </div>

                            <DialogFooter className="pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setVerifyModalOpen(false)}
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 gap-1.5"
                                >
                                    <ShieldCheck className="h-4 w-4" />
                                    {isSubmitting ? 'Verifying...' : 'Verify & Mark Compliant'}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* Detail View Modal */}
            <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-amber-600" />
                            Compliance Record Details
                        </DialogTitle>
                        <DialogDescription>
                            Full audit information and status log for this requirement.
                        </DialogDescription>
                    </DialogHeader>

                    {activeItem && (
                        <div className="space-y-4 pt-2 text-sm">
                            <div className="rounded-md border p-3 bg-muted/20">
                                <div className="text-xs uppercase font-medium text-muted-foreground">Title</div>
                                <div className="font-semibold text-base text-foreground mt-0.5">{activeItem.title}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Category</div>
                                    <div className="font-semibold mt-1">
                                        {CATEGORY_MAP[activeItem.category]?.label || activeItem.category}
                                    </div>
                                </div>
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Status</div>
                                    <div className="font-semibold mt-1 flex items-center gap-1.5">
                                        <Badge variant="outline" className={STATUS_CONFIG[activeItem.status]?.badge}>
                                            {STATUS_CONFIG[activeItem.status]?.label || activeItem.status}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Period</div>
                                    <div className="font-semibold mt-1">{activeItem.period}</div>
                                </div>
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Due Date</div>
                                    <div className="font-semibold mt-1">{activeItem.due_date || 'N/A'}</div>
                                </div>
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Owner Role</div>
                                    <div className="font-semibold mt-1">{activeItem.owner_role}</div>
                                </div>
                                <div className="rounded border p-2.5">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Remittance Amount</div>
                                    <div className="font-semibold mt-1 font-mono">
                                        {activeItem.amount > 0 ? formatPhpCurrency(activeItem.amount) : 'PHP 0.00'}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded border p-3 text-xs space-y-1">
                                <div className="text-muted-foreground uppercase font-medium text-[10px]">Reference Number</div>
                                <div className="font-mono font-medium text-foreground">
                                    {activeItem.reference_no || 'No reference code assigned'}
                                </div>
                            </div>

                            {activeItem.notes && (
                                <div className="rounded border p-3 text-xs space-y-1">
                                    <div className="text-muted-foreground uppercase font-medium text-[10px]">Notes / Remarks</div>
                                    <div className="text-foreground whitespace-pre-wrap">{activeItem.notes}</div>
                                </div>
                            )}

                            {activeItem.verified_by && (
                                <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs dark:bg-emerald-950/30 dark:border-emerald-800">
                                    <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                        <ShieldCheck className="h-4 w-4" />
                                        Audit Sign-off Complete
                                    </div>
                                    <div className="text-emerald-700 dark:text-emerald-400 mt-1">
                                        Verified by: <span className="font-semibold">{activeItem.verified_by}</span>
                                        {activeItem.verified_at && <span> on {activeItem.verified_at}</span>}
                                    </div>
                                </div>
                            )}

                            <DialogFooter className="pt-2">
                                <Button variant="outline" onClick={() => setDetailModalOpen(false)}>
                                    Close
                                </Button>
                                {activeItem.status !== 'verified' && (
                                    <Button
                                        onClick={() => {
                                            setDetailModalOpen(false);
                                            handleOpenVerify(activeItem);
                                        }}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                                    >
                                        <ShieldCheck className="h-4 w-4" />
                                        Verify This Item
                                    </Button>
                                )}
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

