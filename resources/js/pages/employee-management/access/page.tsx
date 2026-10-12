import { Head, Link } from '@inertiajs/react';
import {
    Check,
    KeyRound,
    Lock,
    Minus,
    Shield,
    ShieldAlert,
    ShieldCheck,
    UserCheck,
    Users,
} from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management/roster' },
    { title: 'People Access', href: '/employee-management/access' },
];

type UserItem = {
    id: number;
    name: string;
    username: string;
    email: string;
    position: string | null;
    status: boolean;
    roles: string[];
};

type RoleItem = {
    id: number;
    name: string;
    permissions_count: number;
    permissions: string[];
};

type Props = {
    users: UserItem[];
    roles: RoleItem[];
};

export default function PeopleAccessPage({ users, roles }: Props) {
    const [activeTab, setActiveTab] = React.useState<'matrix' | 'users'>('matrix');

    // Functional capabilities mapped against standard business management roles (Slide 63-64)
    const accessMatrix = [
        {
            module: 'General Accounting',
            capability: 'View Dashboard & Reports',
            roles: ['Super Admin', 'Branch Manager', 'Accountant', 'HR Officer'],
        },
        {
            module: 'General Accounting',
            capability: 'Post Manual Journal Entries',
            roles: ['Super Admin', 'Accountant'],
        },
        {
            module: 'General Accounting',
            capability: 'Period Close / Soft Close',
            roles: ['Super Admin', 'Accountant'],
        },
        {
            module: 'Invoicing & Billing',
            capability: 'Issue BIR Invoices & Receipts',
            roles: ['Super Admin', 'Branch Manager', 'Accountant', 'Staff'],
        },
        {
            module: 'Invoicing & Billing',
            capability: 'Collect & Apply Customer Deposits',
            roles: ['Super Admin', 'Branch Manager', 'Accountant', 'Staff'],
        },
        {
            module: 'Inventory Integration',
            capability: 'View Optical Stock Movements & Valuation',
            roles: ['Super Admin', 'Branch Manager', 'Accountant'],
        },
        {
            module: 'Inventory Integration',
            capability: 'Approve Edging Loss & Discrepancies',
            roles: ['Super Admin', 'Branch Manager', 'Accountant'],
        },
        {
            module: 'Payables & Banking',
            capability: 'Approve Supplier Bills & POs',
            roles: ['Super Admin', 'Branch Manager', 'Accountant'],
        },
        {
            module: 'Payables & Banking',
            capability: 'Perform Bank Reconciliation',
            roles: ['Super Admin', 'Accountant'],
        },
        {
            module: 'Employee Management',
            capability: 'Manage Shift Rosters & Clinic Hours',
            roles: ['Super Admin', 'Branch Manager', 'HR Officer'],
        },
        {
            module: 'Employee Management',
            capability: 'Verify Biometric Punches & Overtime',
            roles: ['Super Admin', 'Branch Manager', 'HR Officer'],
        },
        {
            module: 'Employee Management',
            capability: 'Approve Vacation & Sick Leaves',
            roles: ['Super Admin', 'Branch Manager', 'HR Officer'],
        },
        {
            module: 'Employee Management',
            capability: 'Run Payroll & Benefits Remittance',
            roles: ['Super Admin', 'Accountant', 'HR Officer'],
        },
        {
            module: 'Compliance',
            capability: 'Verify Statutory Filings (BIR/SSS)',
            roles: ['Super Admin', 'Accountant'],
        },
    ];

    const targetRoles = ['Super Admin', 'Branch Manager', 'Accountant', 'HR Officer', 'Staff'];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="People Access & RBAC" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <Heading
                            title="People Access & RBAC Matrix"
                            description="Slide 63-64: Role-based permissions, capability segregation, and user role assignments."
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            asChild
                        >
                            <Link href="/admin/roles">
                                <Shield className="mr-2 h-4 w-4" />
                                Edit System Roles
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/admin/users">
                                <Users className="mr-2 h-4 w-4" />
                                Manage Users
                            </Link>
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('matrix')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                            activeTab === 'matrix'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <ShieldCheck className="h-4 w-4" />
                        Role-Permission Matrix
                    </button>
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                            activeTab === 'users'
                                ? 'border-primary text-primary font-semibold'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        <Users className="h-4 w-4" />
                        User Role Assignments ({users.length})
                    </button>
                </div>

                {/* Tab 1: Access Matrix */}
                {activeTab === 'matrix' && (
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base font-semibold">Functional Segregation of Duties</CardTitle>
                            <CardDescription>
                                Standard multi-entity optical practice permissions matrix across all business modules.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                                            <TableHead className="w-[200px]">Module</TableHead>
                                            <TableHead>Capability / Workflow Action</TableHead>
                                            {targetRoles.map((role) => (
                                                <TableHead key={role} className="text-center font-semibold">
                                                    {role}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {accessMatrix.map((item, idx) => (
                                            <TableRow key={idx} className="hover:bg-muted/20">
                                                <TableCell className="font-semibold text-xs">
                                                    <Badge variant="outline" className="text-xs">
                                                        {item.module}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs font-medium">
                                                    {item.capability}
                                                </TableCell>
                                                {targetRoles.map((role) => {
                                                    const hasAccess = item.roles.includes(role);
                                                    return (
                                                        <TableCell key={role} className="text-center">
                                                            {hasAccess ? (
                                                                <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                                                    <Check className="h-3.5 w-3.5" />
                                                                </div>
                                                            ) : (
                                                                <div className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/40">
                                                                    <Minus className="h-3.5 w-3.5" />
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    );
                                                })}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Tab 2: Users List */}
                {activeTab === 'users' && (
                    <Card className="border-border/80 shadow-xs">
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                                            <TableHead>User</TableHead>
                                            <TableHead>Username</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Assigned Roles</TableHead>
                                            <TableHead>Account Status</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map((user) => (
                                            <TableRow key={user.id} className="hover:bg-muted/20">
                                                <TableCell className="font-semibold text-xs">
                                                    {user.name}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {user.username}
                                                </TableCell>
                                                <TableCell className="text-xs">
                                                    {user.email}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap gap-1">
                                                        {user.roles.length === 0 ? (
                                                            <span className="text-xs text-muted-foreground">No roles assigned</span>
                                                        ) : (
                                                            user.roles.map((r) => (
                                                                <Badge key={r} variant="secondary" className="text-[11px]">
                                                                    {r}
                                                                </Badge>
                                                            ))
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {user.status ? (
                                                        <Badge
                                                            variant="outline"
                                                            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 text-xs gap-1"
                                                        >
                                                            <Check className="h-3 w-3" />
                                                            Active
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="destructive" className="text-xs">
                                                            Inactive
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                                                        <Link href={`/admin/users`}>
                                                            Configure
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}

