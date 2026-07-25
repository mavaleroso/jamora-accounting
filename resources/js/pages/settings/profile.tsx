import { Link, useForm, usePage } from '@inertiajs/react';
import * as React from 'react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { toast } from '@/lib/toast';
import { edit } from '@/routes/profile';
import { edit as editPassword } from '@/routes/user-password';
import type { BreadcrumbItem, SharedData } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Profile settings',
        href: edit().url,
    },
];

function initials(firstname?: string | null, lastname?: string | null, username?: string | null): string {
    const a = (firstname ?? '').trim().charAt(0);
    const b = (lastname ?? '').trim().charAt(0);
    const combined = `${a}${b}`.trim();
    if (combined) return combined.toUpperCase();
    return (username ?? 'U').trim().charAt(0).toUpperCase() || 'U';
}

export default function Profile() {
    const { auth } = usePage<SharedData>().props;
    const user = auth.user;

    const [avatarPreviewUrl, setAvatarPreviewUrl] = React.useState<string | null>(null);

    const form = useForm({
        firstname: (user.firstname ?? '') as string,
        middlename: (user.middlename ?? '') as string,
        lastname: (user.lastname ?? '') as string,
        email: (user.email ?? '') as string,
        address: (user.address ?? '') as string,
        sex: (user.sex ?? '') as string,
        contact_number: (user.contact_number ?? '') as string,
        birthdate: (user.birthdate ?? '') as string,
        date_started: (user.date_started ?? '') as string,
        avatar: null as File | null,
    });

    const displayAvatar = avatarPreviewUrl ?? user.avatar ?? undefined;

    const onAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        form.setData('avatar', file);
        setAvatarPreviewUrl(file ? URL.createObjectURL(file) : null);
    };

    const submit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        form.transform((data) => ({
            ...data,
            _method: 'patch',
        }));

        form.post('/settings/profile', {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                form.setData('avatar', null);
                toast.success('Profile updated.');
            },
            onError: () => {
                toast.error('Please fix the errors below.');
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <SettingsLayout>
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title="Profile information"
                        description="Update your profile image and personal details. Username and position are read-only."
                    />

                    <form onSubmit={submit} encType="multipart/form-data" className="space-y-6">
                        {form.recentlySuccessful && (
                            <Alert className="border-emerald-200 bg-emerald-50/70 text-emerald-900">
                                <AlertTitle>Profile saved</AlertTitle>
                                <AlertDescription>Your profile changes were saved successfully.</AlertDescription>
                            </Alert>
                        )}
                        {Object.keys(form.errors).length > 0 && (
                            <Alert variant="destructive">
                                <AlertTitle>Update failed</AlertTitle>
                                <AlertDescription>Please review the highlighted fields and try again.</AlertDescription>
                            </Alert>
                        )}
                        <div className="grid gap-4 rounded-lg border p-4">
                            <div className="flex items-center gap-4">
                                <Avatar className="size-16 border">
                                    <AvatarImage src={displayAvatar} alt={user.name} />
                                    <AvatarFallback>{initials(user.firstname as string, user.lastname as string, user.username)}</AvatarFallback>
                                </Avatar>
                                <div className="space-y-2">
                                    <Label htmlFor="avatar">Profile image</Label>
                                    <Input id="avatar" type="file" accept="image/*" onChange={onAvatarChange} />
                                    <p className="text-xs text-muted-foreground">JPG/PNG up to 2MB</p>
                                    <InputError message={form.errors.avatar} />
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="username">Username</Label>
                                <Input id="username" value={user.username} disabled readOnly />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="position">Position</Label>
                                <Input id="position" value={(user.position ?? '') as string} disabled readOnly />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                                <Label htmlFor="firstname">First name</Label>
                                <Input id="firstname" value={form.data.firstname} onChange={(e) => form.setData('firstname', e.target.value)} />
                                <InputError message={form.errors.firstname} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="middlename">Middle name</Label>
                                <Input id="middlename" value={form.data.middlename} onChange={(e) => form.setData('middlename', e.target.value)} />
                                <InputError message={form.errors.middlename} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="lastname">Last name</Label>
                                <Input id="lastname" value={form.data.lastname} onChange={(e) => form.setData('lastname', e.target.value)} />
                                <InputError message={form.errors.lastname} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email</Label>
                                <Input id="email" type="email" value={form.data.email} onChange={(e) => form.setData('email', e.target.value)} />
                                <InputError message={form.errors.email} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="sex">Sex</Label>
                                <Input id="sex" value={form.data.sex} onChange={(e) => form.setData('sex', e.target.value)} />
                                <InputError message={form.errors.sex} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="contact_number">Contact number</Label>
                                <Input id="contact_number" value={form.data.contact_number} onChange={(e) => form.setData('contact_number', e.target.value)} />
                                <InputError message={form.errors.contact_number} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="birthdate">Birthdate</Label>
                                <DatePicker
                                    id="birthdate"
                                    value={form.data.birthdate}
                                    onChange={(value) => form.setData('birthdate', value)}
                                    placeholder="Select birthdate"
                                    toYear={new Date().getFullYear()}
                                />
                                <InputError message={form.errors.birthdate} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="date_started">Date started</Label>
                                <DatePicker
                                    id="date_started"
                                    value={form.data.date_started}
                                    onChange={(value) => form.setData('date_started', value)}
                                    placeholder="Select start date"
                                />
                                <InputError message={form.errors.date_started} />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="address">Address</Label>
                            <Input id="address" value={form.data.address} onChange={(e) => form.setData('address', e.target.value)} />
                            <InputError message={form.errors.address} />
                        </div>

                        <div className="flex items-center gap-3">
                            <Button type="submit" disabled={form.processing}>
                                {form.processing ? 'Saving...' : 'Save profile'}
                            </Button>
                            <Button type="button" variant="outline" asChild>
                                <Link href={editPassword().url}>Change password</Link>
                            </Button>
                            {form.recentlySuccessful && <p className="text-sm text-muted-foreground">Saved</p>}
                        </div>
                    </form>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
