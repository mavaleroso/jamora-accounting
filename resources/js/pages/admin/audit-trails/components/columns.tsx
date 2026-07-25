import type { ColumnDef } from '@tanstack/react-table';
import {
    AlertTriangleIcon,
    CheckCircle2Icon,
    MoreHorizontalIcon,
    PencilLineIcon,
    PlusCircleIcon,
    Trash2Icon,
} from 'lucide-react';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AuditTrail } from '@/types';

const AUDIT_TRAIL_TIME_ZONE = 'Asia/Manila';

function formatDate(value: string | null | undefined): string {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-PH', {
        timeZone: AUDIT_TRAIL_TIME_ZONE,
        dateStyle: 'medium',
    });
}

function formatTime(value: string | null | undefined): string {
    if (!value) return '--';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '--';
    return d.toLocaleTimeString('en-PH', {
        timeZone: AUDIT_TRAIL_TIME_ZONE,
        timeStyle: 'short',
    });
}

function formatSubject(trail: AuditTrail): string {
    if (trail.subject_type && trail.subject_id) {
        const shortType = trail.subject_type.split('\\').pop();
        return `${shortType} #${trail.subject_id}`;
    }
    if (trail.subject_id) return String(trail.subject_id);
    return '--';
}

function getInitials(value: string | null | undefined): string {
    if (!value) return '--';
    const parts = value.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatUser(trail: AuditTrail): { label: string; secondary?: string } {
    if (trail.user?.name) {
        return { label: trail.user.name, secondary: trail.user.username ?? undefined };
    }
    if (trail.user?.username) {
        return { label: trail.user.username };
    }
    return { label: '--' };
}

function actionBadge(action: string | null | undefined) {
    const normalized = (action ?? '').toLowerCase();
    if (normalized === 'create') {
        return { variant: 'default', icon: PlusCircleIcon, label: 'Create' } as const;
    }
    if (normalized === 'update') {
        return { variant: 'secondary', icon: PencilLineIcon, label: 'Update' } as const;
    }
    if (normalized === 'delete') {
        return { variant: 'destructive', icon: Trash2Icon, label: 'Delete' } as const;
    }
    return { variant: 'outline', icon: AlertTriangleIcon, label: action ?? '--' } as const;
}

function methodBadge(method: string | null | undefined) {
    const normalized = (method ?? '').toUpperCase();
    if (normalized === 'POST') {
        return { variant: 'default', label: 'POST', icon: PlusCircleIcon } as const;
    }
    if (normalized === 'PUT' || normalized === 'PATCH') {
        return { variant: 'secondary', label: normalized, icon: PencilLineIcon } as const;
    }
    if (normalized === 'DELETE') {
        return { variant: 'destructive', label: 'DELETE', icon: Trash2Icon } as const;
    }
    if (normalized) {
        return { variant: 'outline', label: normalized, icon: CheckCircle2Icon } as const;
    }
    return { variant: 'outline', label: '--', icon: AlertTriangleIcon } as const;
}

function formatUrl(url: string | null | undefined): { primary: string; full?: string } {
    if (!url) return { primary: '--' };
    try {
        const parsed = new URL(url);
        return { primary: parsed.pathname || url, full: url };
    } catch {
        return { primary: url, full: url };
    }
}

export const auditTrailColumnLabels: Record<string, string> = {
    created_at: 'Date',
    user: 'User',
    action: 'Action',
    method: 'Method',
    subject: 'Subject',
    route_name: 'Route',
    url: 'URL',
    ip_address: 'IP',
};

export const auditTrailFilterableColumns: Record<string, string> = {
    action: 'Action',
    route_name: 'Route',
    method: 'Method',
    subject_type: 'Subject Type',
    subject_id: 'Subject ID',
    url: 'URL',
    ip_address: 'IP',
};

export type AuditTrailTableActions = {
    onViewAuditTrail: (trail: AuditTrail) => void;
};

export function getAuditTrailColumns(
    actions: AuditTrailTableActions,
): ColumnDef<AuditTrail>[] {
    const { onViewAuditTrail } = actions;
    return [
        {
            id: 'actions',
            cell: ({ row }) => {
                const trail = row.original;
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                aria-label="Open menu"
                            >
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontalIcon className="size-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                                onClick={() => onViewAuditTrail(trail)}
                            >
                                View details
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                );
            },
            enableSorting: false,
            enableHiding: false,
        },
        {
            accessorKey: 'created_at',
            sortDescFirst: true,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Date" />
            ),
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="text-sm font-medium">
                        {formatDate(row.original.created_at)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {formatTime(row.original.created_at)}
                    </span>
                </div>
            ),
        },
        {
            id: 'user',
            accessorFn: (row) => row.user?.name ?? row.user?.username,
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="User" />
            ),
            cell: ({ row }) => {
                const user = formatUser(row.original);
                return (
                    <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground/80">
                            {getInitials(user.label)}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">
                                {user.label}
                            </span>
                            {user.secondary ? (
                                <span className="text-xs text-muted-foreground">
                                    @{user.secondary}
                                </span>
                            ) : null}
                        </div>
                    </div>
                );
            },
        },
        {
            accessorKey: 'action',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Action" />
            ),
            cell: ({ row }) => {
                const { variant, icon: Icon, label } = actionBadge(
                    row.getValue('action') as string | null | undefined,
                );
                return (
                    <Badge variant={variant} className="gap-1">
                        <Icon className="size-3" />
                        <span className="capitalize">{label}</span>
                    </Badge>
                );
            },
        },
        {
            accessorKey: 'method',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Method" />
            ),
            cell: ({ row }) => {
                const { variant, icon: Icon, label } = methodBadge(
                    row.getValue('method') as string | null | undefined,
                );
                return (
                    <Badge variant={variant} className="gap-1">
                        <Icon className="size-3" />
                        {label}
                    </Badge>
                );
            },
        },
        {
            id: 'subject',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Subject" />
            ),
            cell: ({ row }) => (
                <div className="flex flex-col">
                    <span className="text-sm font-medium">
                        {formatSubject(row.original)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {row.original.subject_type ?? '--'}
                    </span>
                </div>
            ),
        },
        {
            accessorKey: 'route_name',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="Route" />
            ),
            cell: ({ row }) => (
                <span className="text-xs font-medium text-muted-foreground">
                    {row.getValue('route_name') ?? '--'}
                </span>
            ),
        },
        {
            accessorKey: 'url',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="URL" />
            ),
            cell: ({ row }) => {
                const { primary, full } = formatUrl(
                    row.getValue('url') as string | null | undefined,
                );
                return (
                    <span
                        className="block max-w-[260px] truncate text-sm text-muted-foreground"
                        title={full}
                    >
                        {primary}
                    </span>
                );
            },
        },
        {
            accessorKey: 'ip_address',
            header: ({ column }) => (
                <DataTableColumnHeader column={column} title="IP" />
            ),
            cell: ({ row }) => (
                <span className="text-xs font-medium text-muted-foreground">
                    {row.getValue('ip_address') ?? '--'}
                </span>
            ),
        },
    ];
}
