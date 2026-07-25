import * as React from 'react';
import InputError from '@/components/input-error';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { User } from '@/types';

function avatarUrl(user: Partial<User> | null): string | undefined {
    if (!user?.avatar) return undefined;
    return user.avatar.startsWith('http')
        ? user.avatar
        : `/storage/${user.avatar}`;
}

type UserFormFieldsProps = {
    mode: 'create' | 'edit';
    defaultValues?: Partial<User> & { password?: string };
    roles: { name: string; permissions: string[] }[];
    permissions: string[];
    errors?: Record<string, string>;
    /** Preview URL for newly selected avatar file (create/edit) */
    avatarPreviewUrl?: string | null;
    /** Called when user selects an avatar file */
    onAvatarChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

export function UserFormFields({
    mode,
    defaultValues = {},
    roles,
    permissions,
    errors = {},
    avatarPreviewUrl = null,
    onAvatarChange,
}: UserFormFieldsProps) {
    const displayUrl = avatarPreviewUrl ?? avatarUrl(defaultValues);
    const [selectedRole, setSelectedRole] = React.useState(defaultValues.roles?.[0] ?? '');
    const [selectedPermissions, setSelectedPermissions] = React.useState<string[]>(
        defaultValues.permissions ?? [],
    );
    const [birthdate, setBirthdate] = React.useState(
        defaultValues.birthdate ? defaultValues.birthdate.toString().slice(0, 10) : '',
    );
    const [dateStarted, setDateStarted] = React.useState(
        defaultValues.date_started ? defaultValues.date_started.toString().slice(0, 10) : '',
    );

    React.useEffect(() => {
        setSelectedRole(defaultValues.roles?.[0] ?? '');
        setSelectedPermissions(defaultValues.permissions ?? []);
    }, [defaultValues.permissions, defaultValues.roles]);

    const handleRoleChange = (roleName: string) => {
        setSelectedRole(roleName);
        const role = roles.find((r) => r.name === roleName);
        if (role) {
            setSelectedPermissions(role.permissions);
        }
    };

    const togglePermission = (permission: string) => {
        setSelectedPermissions((prev) =>
            prev.includes(permission)
                ? prev.filter((p) => p !== permission)
                : [...prev, permission],
        );
    };

    return (
        <div className="grid gap-4 py-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
                <Label>Avatar</Label>
                <div className="flex items-center gap-4">
                    <Avatar className="size-16">
                        <AvatarImage
                            src={displayUrl ?? undefined}
                            alt={defaultValues?.name ?? 'Avatar'}
                        />
                        <AvatarFallback className="text-lg">
                            {(defaultValues?.name ?? 'U')
                                .split(/\s+/)
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                        <Input
                            id="avatar"
                            name="avatar"
                            type="file"
                            accept="image/*"
                            className={cn(
                                'cursor-pointer',
                                errors.avatar &&
                                    'border-red-600 dark:border-red-400',
                            )}
                            onChange={onAvatarChange}
                            aria-invalid={!!errors.avatar}
                        />
                        <p className="text-xs text-muted-foreground">
                            Optional. Max 2MB. JPG, PNG, GIF, WebP.
                        </p>
                        <InputError message={errors.avatar} />
                    </div>
                </div>
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="username">Username</Label>
                <Input
                    id="username"
                    name="username"
                    defaultValue={defaultValues.username ?? ''}
                    autoComplete="username"
                    placeholder="Username"
                    className={cn(
                        errors.username && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.username}
                />
                <InputError message={errors.username} />
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="role">Role</Label>
                <input type="hidden" name="role" value={selectedRole} />
                <Select value={selectedRole} onValueChange={handleRoleChange}>
                    <SelectTrigger
                        id="role"
                        className={cn(
                            errors.role && 'border-red-600 dark:border-red-400',
                        )}
                    >
                        <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                        {roles.map((role) => (
                            <SelectItem key={role.name} value={role.name}>
                                {role.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <InputError message={errors.role} />
            </div>
            <div className="sm:col-span-2">
                <Label>Permissions</Label>
                <p className="text-xs text-muted-foreground">
                    Changing the role will reset permissions to that role’s defaults.
                </p>
                <input type="hidden" name="permissions_present" value="1" />
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-input bg-background p-3">
                    {permissions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No permissions available.</p>
                    ) : (
                        permissions.map((permission) => (
                            <label key={permission} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={selectedPermissions.includes(permission)}
                                    onCheckedChange={() => togglePermission(permission)}
                                />
                                {selectedPermissions.includes(permission) && (
                                    <input type="hidden" name="permissions[]" value={permission} />
                                )}
                                <span>{permission}</span>
                            </label>
                        ))
                    )}
                </div>
                <InputError message={errors.permissions} />
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={defaultValues.email ?? ''}
                    autoComplete="email"
                    placeholder="email@example.com"
                    className={cn(
                        errors.email && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.email}
                />
                <InputError message={errors.email} />
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="password">
                    Password {mode === 'edit' && '(leave blank to keep)'}
                </Label>
                <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={mode === 'create' ? 'new-password' : 'off'}
                    placeholder={mode === 'edit' ? '••••••••' : 'Password'}
                    className={cn(
                        errors.password && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.password}
                />
                <InputError message={errors.password} />
            </div>
            <div className="">
                <Label htmlFor="firstname">First name</Label>
                <Input
                    id="firstname"
                    name="firstname"
                    defaultValue={defaultValues.firstname ?? ''}
                    placeholder="First name"
                    className={cn(
                        errors.firstname &&
                            'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.firstname}
                />
                <InputError message={errors.firstname} />
            </div>
            <div className="">
                <Label htmlFor="middlename">Middle name</Label>
                <Input
                    id="middlename"
                    name="middlename"
                    defaultValue={defaultValues.middlename ?? ''}
                    placeholder="Middle name"
                    className={cn(
                        errors.middlename &&
                            'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.middlename}
                />
                <InputError message={errors.middlename} />
            </div>
            <div className="">
                <Label htmlFor="lastname">Last name</Label>
                <Input
                    id="lastname"
                    name="lastname"
                    defaultValue={defaultValues.lastname ?? ''}
                    placeholder="Last name"
                    className={cn(
                        errors.lastname && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.lastname}
                />
                <InputError message={errors.lastname} />
            </div>
            <div className="">
                <Label htmlFor="position">Position</Label>
                <Input
                    id="position"
                    name="position"
                    defaultValue={defaultValues.position ?? ''}
                    placeholder="Position"
                    className={cn(
                        errors.position && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.position}
                />
                <InputError message={errors.position} />
            </div>
            <div className="">
                <Label htmlFor="contact_number">Contact number</Label>
                <Input
                    id="contact_number"
                    name="contact_number"
                    defaultValue={defaultValues.contact_number ?? ''}
                    placeholder="Contact number"
                    className={cn(
                        errors.contact_number &&
                            'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.contact_number}
                />
                <InputError message={errors.contact_number} />
            </div>
            <div className="">
                <Label htmlFor="sex">Sex</Label>
                <Input
                    id="sex"
                    name="sex"
                    defaultValue={defaultValues.sex ?? ''}
                    placeholder="Sex"
                    className={cn(
                        errors.sex && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.sex}
                />
                <InputError message={errors.sex} />
            </div>
            <div className="">
                <Label htmlFor="birthdate">Birthdate</Label>
                <input type="hidden" name="birthdate" value={birthdate} />
                <DatePicker
                    id="birthdate"
                    value={birthdate}
                    onChange={setBirthdate}
                    placeholder="Pick birthdate"
                    className={cn(
                        errors.birthdate && 'border-destructive',
                    )}
                />
                <InputError message={errors.birthdate} />
            </div>
            <div className="">
                <Label htmlFor="date_started">Date started</Label>
                <input type="hidden" name="date_started" value={dateStarted} />
                <DatePicker
                    id="date_started"
                    value={dateStarted}
                    onChange={setDateStarted}
                    placeholder="Pick date started"
                    className={cn(
                        errors.date_started && 'border-destructive',
                    )}
                />
                <InputError message={errors.date_started} />
            </div>
            <div className="sm:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input
                    id="address"
                    name="address"
                    defaultValue={defaultValues.address ?? ''}
                    placeholder="Address"
                    className={cn(
                        errors.address && 'border-red-600 dark:border-red-400',
                    )}
                    aria-invalid={!!errors.address}
                />
                <InputError message={errors.address} />
            </div>
        </div>
    );
}
