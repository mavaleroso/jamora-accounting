import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { User } from '@/types';

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

function avatarSrc(user: User): string | undefined {
    if (!user.avatar) return undefined;
    return typeof user.avatar === 'string' && user.avatar.startsWith('http')
        ? user.avatar
        : `/storage/${user.avatar}`;
}

type ViewUserDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
};

export function ViewUserDialog({
    open,
    onOpenChange,
    user,
}: ViewUserDialogProps) {
    if (!user) return null;

    const rows: { label: string; value: string }[] = [
        { label: 'Username', value: user.username },
        { label: 'Name', value: user.name },
        { label: 'Email', value: user.email ?? '—' },
        { label: 'Role', value: user.roles?.[0] ?? '-' },
        { label: 'Permissions', value: (user.permissions ?? []).join(', ') || '-' },
        { label: 'First name', value: user.firstname ?? '—' },
        { label: 'Middle name', value: user.middlename ?? '—' },
        { label: 'Last name', value: user.lastname ?? '—' },
        { label: 'Position', value: user.position ?? '—' },
        { label: 'Contact number', value: user.contact_number ?? '—' },
        { label: 'Sex', value: user.sex ?? '—' },
        { label: 'Birthdate', value: formatDate(user.birthdate ?? null) },
        { label: 'Date started', value: formatDate(user.date_started ?? null) },
        { label: 'Address', value: user.address ?? '—' },
        { label: 'Email verified', value: user.email_verified_at ? 'Yes' : 'No' },
        { label: '2FA', value: user.two_factor_enabled ? 'On' : 'Off' },
        { label: 'Created', value: formatDate(user.created_at) },
        { label: 'Updated', value: formatDate(user.updated_at) },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>View user</DialogTitle>
                    <DialogDescription>
                        User details for {user.name}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center py-2">
                    <Avatar className="size-24">
                        <AvatarImage
                            src={avatarSrc(user)}
                            alt={user.name}
                        />
                        <AvatarFallback className="text-2xl">
                            {user.name
                                .split(/\s+/)
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                </div>
                <dl className="grid gap-3 py-2 sm:grid-cols-2">
                    {rows.map(({ label, value }) => (
                        <div key={label} className="space-y-1">
                            <dt className="text-muted-foreground text-sm font-medium">
                                {label}
                            </dt>
                            <dd className="text-sm">{value}</dd>
                        </div>
                    ))}
                </dl>
            </DialogContent>
        </Dialog>
    );
}
