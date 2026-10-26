import InputError from '@/components/input-error';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TextCombobox } from '@/components/ui/text-combobox';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { DetailItem, SettingsSection } from '@/layouts/settings/section';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { RoleBadge, StatusBadge } from '@/pages/admin/users/components/shared';
import {
    CIVIL_STATUSES,
    EMERGENCY_RELATIONSHIPS,
    EMPLOYMENT_STATUSES,
    EMPLOYMENT_TYPES,
    formatDate,
    formatTime,
    labelOf,
    MIN_WORKING_AGE,
    statusBadgeClass,
    STATUTORY_FIELDS,
    tenure,
    typeBadgeClass,
} from '@/pages/libraries/employees/lib';
import { edit } from '@/routes/profile';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Head, useForm, usePage } from '@inertiajs/react';
import {
    BadgeCheck,
    Briefcase,
    Building2,
    CalendarClock,
    Camera,
    ChevronRight,
    HeartPulse,
    IdCard,
    KeyRound,
    Landmark,
    Loader2,
    ShieldAlert,
    Trash2,
    UserRound,
} from 'lucide-react';
import * as React from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Profile settings',
        href: edit().url,
    },
];

const SEX_OPTIONS = ['Male', 'Female'];

/** App\Http\Controllers\Settings\ProfileController::details(): the login's values, else the employee record's. */
type Details = {
    firstname: string | null;
    middlename: string | null;
    lastname: string | null;
    email: string | null;
    contact_number: string | null;
    address: string | null;
    birthdate: string | null;
    sex: string | null;
    civil_status: string | null;
    emergency_contact_name: string | null;
    emergency_contact_relationship: string | null;
    emergency_contact_phone: string | null;
};

/** The login, as User management keeps it. */
type Account = {
    username: string;
    role: string | null;
    role_description: string | null;
    position: string | null;
    date_started: string | null;
    status: boolean;
    email_verified: boolean;
    created_at: string | null;
    companies: { id: number; code: string; name: string; is_default: boolean; is_current: boolean }[];
    access: { key: string; label: string; permissions: string[] }[];
};

/** An employee record linked to the login, as the Employee Directory keeps it (one per company). */
type Employment = {
    id: number;
    employee_code: string;
    company: { id: number; code: string; name: string } | null;
    position: string | null;
    employment_status: string;
    employment_type: string;
    hire_date: string | null;
    regularization_date: string | null;
    separation_date: string | null;
    shift: { name: string; start: string; end: string };
    ids: Record<(typeof STATUTORY_FIELDS)[number]['key'], string | null>;
    bank: { name: string | null; account_no: string | null };
};

type Props = {
    profile: Details;
    account: Account;
    employments: Employment[];
};

function initials(firstname?: string | null, lastname?: string | null, username?: string | null): string {
    const a = (firstname ?? '').trim().charAt(0);
    const b = (lastname ?? '').trim().charAt(0);
    const combined = `${a}${b}`.trim();
    if (combined) return combined.toUpperCase();
    return (username ?? 'U').trim().charAt(0).toUpperCase() || 'U';
}

export default function Profile({ profile, account, employments }: Props) {
    const { auth } = usePage<SharedData>().props;
    const user = auth.user;
    const isEmployee = employments.length > 0;
    const primary = employments[0];

    const [avatarPreviewUrl, setAvatarPreviewUrl] = React.useState<string | null>(null);
    const fileRef = React.useRef<HTMLInputElement>(null);

    const form = useForm({
        firstname: profile.firstname ?? '',
        middlename: profile.middlename ?? '',
        lastname: profile.lastname ?? '',
        email: profile.email ?? '',
        contact_number: profile.contact_number ?? '',
        address: profile.address ?? '',
        sex: profile.sex ?? '',
        birthdate: profile.birthdate ?? '',
        civil_status: profile.civil_status ?? '',
        emergency_contact_name: profile.emergency_contact_name ?? '',
        emergency_contact_relationship: profile.emergency_contact_relationship ?? '',
        emergency_contact_phone: profile.emergency_contact_phone ?? '',
        avatar: null as File | null,
        remove_avatar: false,
    });

    const displayAvatar = form.data.remove_avatar ? undefined : (avatarPreviewUrl ?? user.avatar ?? undefined);
    const position = primary?.position ?? account.position;
    const companyNames = employments.map((e) => e.company?.name).filter(Boolean) as string[];
    const hasErrors = Object.keys(form.errors).length > 0;

    React.useEffect(() => () => void (avatarPreviewUrl && URL.revokeObjectURL(avatarPreviewUrl)), [avatarPreviewUrl]);

    const clearFile = () => {
        setAvatarPreviewUrl(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    const onAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        form.setData((d) => ({ ...d, avatar: file, remove_avatar: false }));
        setAvatarPreviewUrl(file ? URL.createObjectURL(file) : null);
    };

    const removePhoto = () => {
        clearFile();
        // A photo picked but not saved yet is simply dropped; a saved one is removed on save.
        form.setData((d) => ({ ...d, avatar: null, remove_avatar: !d.avatar && !!user.avatar }));
    };

    const discard = () => {
        form.reset();
        form.clearErrors();
        clearFile();
    };

    const submit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const submitted = form.data;
        form.transform((data) => {
            // Employee-only details are left out for a login without an employee record.
            const { civil_status, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, ...rest } = data;
            return {
                ...rest,
                ...(isEmployee ? { civil_status, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone } : {}),
                _method: 'patch',
            };
        });

        form.post('/settings/profile', {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => {
                const next = { ...submitted, avatar: null, remove_avatar: false };
                form.setDefaults(next);
                form.setData(next);
                clearFile();
                toast.success('Profile updated.');
            },
            onError: () => {
                toast.error('Please fix the highlighted fields.');
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Profile settings" />

            <SettingsLayout>
                <form onSubmit={submit} encType="multipart/form-data" className="space-y-6">
                    {/* Who you are: the same person User management and the Employee Directory show. */}
                    <section className="bg-card relative overflow-hidden rounded-xl border shadow-sm">
                        <div
                            className="from-primary/10 via-primary/[0.03] pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent"
                            aria-hidden
                        />
                        <div className="relative flex flex-col gap-6 p-5 lg:flex-row lg:items-center lg:p-6">
                            <div className="flex min-w-0 flex-1 items-center gap-5">
                                <div className="relative shrink-0">
                                    <Avatar className="ring-background size-24 text-2xl shadow-md ring-4">
                                        <AvatarImage src={displayAvatar} alt={user.name} className="object-cover" />
                                        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                            {initials(form.data.firstname, form.data.lastname, account.username)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className="border-background bg-primary text-primary-foreground absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full border-2 shadow transition-transform hover:scale-105"
                                        aria-label="Change profile photo"
                                    >
                                        <Camera className="size-4" />
                                    </button>
                                </div>
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div>
                                        <h2 className="truncate text-2xl font-semibold tracking-tight">{user.name}</h2>
                                        <p className="text-muted-foreground truncate text-sm">
                                            @{account.username}
                                            {position && ` · ${position}`}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <RoleBadge role={account.role} />
                                        <StatusBadge active={account.status} />
                                        {employments.map((e) => (
                                            <Badge key={e.id} variant="outline" className="bg-background font-mono text-[11px]">
                                                {e.employee_code}
                                                {employments.length > 1 && e.company && (
                                                    <span className="text-muted-foreground font-sans">· {e.company.code}</span>
                                                )}
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                        <button
                                            type="button"
                                            onClick={() => fileRef.current?.click()}
                                            className="text-primary font-medium hover:underline"
                                        >
                                            {user.avatar || form.data.avatar ? 'Change photo' : 'Upload photo'}
                                        </button>
                                        {(form.data.avatar || (user.avatar && !form.data.remove_avatar)) && (
                                            <button
                                                type="button"
                                                onClick={removePhoto}
                                                className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
                                            >
                                                <Trash2 className="size-3" /> Remove
                                            </button>
                                        )}
                                        <span
                                            className={cn(
                                                'text-muted-foreground',
                                                (form.data.avatar || form.data.remove_avatar) && 'font-medium text-amber-700 dark:text-amber-400',
                                            )}
                                        >
                                            {form.data.remove_avatar
                                                ? 'Photo will be removed when you save.'
                                                : form.data.avatar
                                                  ? `${form.data.avatar.name} — save to apply.`
                                                  : 'JPG, PNG or WebP, up to 2 MB.'}
                                        </span>
                                    </div>
                                    <InputError message={form.errors.avatar} />
                                </div>
                            </div>

                            {/* At a glance: the same facts User management and the Employee Directory list. */}
                            <dl className="bg-background/70 grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border backdrop-blur sm:grid-cols-4 lg:w-[34rem]">
                                <HeroFact
                                    label="Companies"
                                    value={account.companies.length}
                                    hint={account.companies.find((c) => c.is_current)?.code ?? undefined}
                                />
                                <HeroFact
                                    label="Employee records"
                                    value={employments.length || '—'}
                                    hint={primary?.hire_date ? `Since ${formatDate(primary.hire_date)}` : undefined}
                                />
                                <HeroFact
                                    label="Email"
                                    value={account.email_verified ? 'Verified' : 'Unverified'}
                                    tone={account.email_verified ? 'good' : 'warn'}
                                    hint={profile.email ?? 'No email on file'}
                                />
                                <HeroFact
                                    label="Member since"
                                    value={account.created_at ? formatDate(account.created_at).replace(/^\w+ \d+, /, '') : '—'}
                                    hint={account.created_at ? formatDate(account.created_at) : undefined}
                                />
                            </dl>
                        </div>
                        <input
                            ref={fileRef}
                            id="avatar"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={onAvatarChange}
                            className="sr-only"
                            tabIndex={-1}
                        />
                    </section>

                    {hasErrors && (
                        <Alert variant="destructive">
                            <ShieldAlert className="size-4" />
                            <AlertTitle>Your changes were not saved</AlertTitle>
                            <AlertDescription>Review the highlighted fields and try again.</AlertDescription>
                        </Alert>
                    )}

                    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
                        <div className="min-w-0 space-y-6">
                            <SettingsSection
                                icon={UserRound}
                                title="Personal details"
                                description={
                                    isEmployee
                                        ? `Saved to your login and your employee record${employments.length > 1 ? 's' : ''} in ${companyNames.join(', ')}.`
                                        : 'Saved to your login. Username, role and position are managed by an administrator.'
                                }
                                contentClassName="space-y-5"
                            >
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <Field id="firstname" label="First name" error={form.errors.firstname} required>
                                        <Input
                                            id="firstname"
                                            value={form.data.firstname}
                                            onChange={(e) => form.setData('firstname', e.target.value)}
                                            required
                                            autoComplete="given-name"
                                        />
                                    </Field>
                                    <Field id="middlename" label="Middle name" error={form.errors.middlename}>
                                        <Input
                                            id="middlename"
                                            value={form.data.middlename}
                                            onChange={(e) => form.setData('middlename', e.target.value)}
                                            autoComplete="additional-name"
                                        />
                                    </Field>
                                    <Field id="lastname" label="Last name" error={form.errors.lastname} required>
                                        <Input
                                            id="lastname"
                                            value={form.data.lastname}
                                            onChange={(e) => form.setData('lastname', e.target.value)}
                                            required
                                            autoComplete="family-name"
                                        />
                                    </Field>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    <Field
                                        id="email"
                                        label="Email"
                                        error={form.errors.email}
                                        hint={account.email_verified && form.data.email === (profile.email ?? '') ? 'Verified' : undefined}
                                    >
                                        <Input
                                            id="email"
                                            type="email"
                                            value={form.data.email}
                                            onChange={(e) => form.setData('email', e.target.value)}
                                            autoComplete="email"
                                        />
                                    </Field>
                                    <Field id="contact_number" label="Mobile" error={form.errors.contact_number}>
                                        <Input
                                            id="contact_number"
                                            type="tel"
                                            placeholder="09XX XXX XXXX"
                                            value={form.data.contact_number}
                                            onChange={(e) => form.setData('contact_number', e.target.value)}
                                            autoComplete="tel"
                                        />
                                    </Field>
                                    <Field id="sex" label="Sex" error={form.errors.sex}>
                                        <Select value={form.data.sex} onValueChange={(v) => form.setData('sex', v)}>
                                            <SelectTrigger id="sex" className="w-full">
                                                <SelectValue placeholder="Select" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[
                                                    ...SEX_OPTIONS,
                                                    ...(form.data.sex && !SEX_OPTIONS.includes(form.data.sex) ? [form.data.sex] : []),
                                                ].map((o) => (
                                                    <SelectItem key={o} value={o}>
                                                        {o}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </Field>
                                    <Field id="birthdate" label="Birthdate" error={form.errors.birthdate}>
                                        <DatePicker
                                            id="birthdate"
                                            value={form.data.birthdate}
                                            onChange={(value) => form.setData('birthdate', value)}
                                            placeholder="Select birthdate"
                                            toYear={new Date().getFullYear() - (isEmployee ? MIN_WORKING_AGE : 0)}
                                        />
                                    </Field>
                                    {isEmployee && (
                                        <Field id="civil_status" label="Civil status" error={form.errors.civil_status}>
                                            <Select value={form.data.civil_status} onValueChange={(v) => form.setData('civil_status', v)}>
                                                <SelectTrigger id="civil_status" className="w-full">
                                                    <SelectValue placeholder="Select" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {CIVIL_STATUSES.map((o) => (
                                                        <SelectItem key={o.value} value={o.value}>
                                                            {o.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </Field>
                                    )}
                                    <Field
                                        id="address"
                                        label="Home address"
                                        error={form.errors.address}
                                        className={cn(!isEmployee && 'sm:col-span-2')}
                                    >
                                        <Input
                                            id="address"
                                            value={form.data.address}
                                            onChange={(e) => form.setData('address', e.target.value)}
                                            autoComplete="street-address"
                                        />
                                    </Field>
                                </div>
                            </SettingsSection>

                            {isEmployee && (
                                <SettingsSection
                                    icon={HeartPulse}
                                    title="Emergency contact"
                                    description="Who HR calls if something happens to you at work."
                                >
                                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        <Field
                                            id="emergency_contact_name"
                                            label="Name"
                                            error={form.errors.emergency_contact_name}
                                            className="sm:col-span-2 lg:col-span-1"
                                        >
                                            <Input
                                                id="emergency_contact_name"
                                                value={form.data.emergency_contact_name}
                                                onChange={(e) => form.setData('emergency_contact_name', e.target.value)}
                                            />
                                        </Field>
                                        <Field
                                            id="emergency_contact_relationship"
                                            label="Relationship"
                                            error={form.errors.emergency_contact_relationship}
                                        >
                                            <TextCombobox
                                                id="emergency_contact_relationship"
                                                value={form.data.emergency_contact_relationship}
                                                onValueChange={(v) => form.setData('emergency_contact_relationship', v)}
                                                options={EMERGENCY_RELATIONSHIPS}
                                                placeholder="Select or type"
                                                aria-invalid={!!form.errors.emergency_contact_relationship}
                                            />
                                        </Field>
                                        <Field id="emergency_contact_phone" label="Mobile" error={form.errors.emergency_contact_phone}>
                                            <Input
                                                id="emergency_contact_phone"
                                                type="tel"
                                                placeholder="09XX XXX XXXX"
                                                value={form.data.emergency_contact_phone}
                                                onChange={(e) => form.setData('emergency_contact_phone', e.target.value)}
                                            />
                                        </Field>
                                    </div>
                                </SettingsSection>
                            )}

                            <SettingsSection
                                icon={Briefcase}
                                title="Employment"
                                description={
                                    isEmployee
                                        ? 'From the Employee Directory. HR keeps these details; ask them to correct anything that is wrong.'
                                        : 'Your login has no employee record. Position and start date are kept in User management.'
                                }
                                contentClassName={cn(isEmployee && 'space-y-4')}
                            >
                                {isEmployee ? (
                                    employments.map((e) => <EmploymentBlock key={e.id} employment={e} framed={employments.length > 1} />)
                                ) : (
                                    <dl className="grid gap-4 sm:grid-cols-2">
                                        <DetailItem label="Position">{account.position}</DetailItem>
                                        <DetailItem label="Date started">{account.date_started && formatDate(account.date_started)}</DetailItem>
                                    </dl>
                                )}
                            </SettingsSection>
                        </div>

                        <div className="min-w-0 space-y-6">
                            <AccountSection account={account} />
                        </div>
                    </div>

                    {/* Only while something is unsaved; stays in view while scrolling. */}
                    {(form.isDirty || form.processing) && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 sticky bottom-4 z-20">
                            <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur">
                                <p className="flex items-center gap-2 text-sm">
                                    <span className="size-2 animate-pulse rounded-full bg-amber-500" aria-hidden />
                                    You have unsaved changes
                                </p>
                                <div className="flex gap-2">
                                    <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={form.processing}>
                                        Discard
                                    </Button>
                                    <Button type="submit" size="sm" disabled={form.processing}>
                                        {form.processing && <Loader2 className="size-4 animate-spin" />}
                                        {form.processing ? 'Saving…' : 'Save changes'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </form>
            </SettingsLayout>
        </AppLayout>
    );
}

/** A headline figure in the profile header. */
function HeroFact({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'good' | 'warn' }) {
    return (
        <div className="min-w-0 px-4 py-3 even:border-l sm:border-l sm:first:border-l-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
            <dt className="text-muted-foreground truncate text-[11px] font-medium tracking-wide uppercase">{label}</dt>
            <dd
                className={cn(
                    'mt-0.5 truncate text-lg font-semibold tabular-nums',
                    tone === 'good' && 'text-emerald-700 dark:text-emerald-400',
                    tone === 'warn' && 'text-amber-700 dark:text-amber-400',
                )}
            >
                {value}
            </dd>
            {hint && <p className="text-muted-foreground truncate text-[11px]">{hint}</p>}
        </div>
    );
}

function Field({
    id,
    label,
    error,
    hint,
    required,
    className,
    children,
}: {
    id: string;
    label: string;
    error?: string;
    hint?: string;
    required?: boolean;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn('grid content-start gap-2', className)}>
            <Label htmlFor={id} className="flex items-center gap-1">
                {label}
                {required && <span className="text-destructive">*</span>}
                {hint && (
                    <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] font-normal text-emerald-700 dark:text-emerald-400">
                        <BadgeCheck className="size-3" /> {hint}
                    </span>
                )}
            </Label>
            {children}
            <InputError message={error} />
        </div>
    );
}

function EmploymentBlock({ employment: e, framed }: { employment: Employment; framed: boolean }) {
    const service = tenure(e.hire_date, e.separation_date);
    const missing = STATUTORY_FIELDS.filter((f) => !e.ids[f.key]);

    return (
        <article className={cn(framed && 'rounded-lg border p-4')}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <Building2 className="text-muted-foreground size-4 shrink-0" />
                    <span className="truncate">{e.company?.name ?? 'Company'}</span>
                    <span className="text-muted-foreground font-mono text-xs font-normal">{e.employee_code}</span>
                </h3>
                <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={statusBadgeClass(e.employment_status)}>
                        {labelOf(EMPLOYMENT_STATUSES, e.employment_status)}
                    </Badge>
                    <Badge variant="outline" className={typeBadgeClass(e.employment_type)}>
                        {labelOf(EMPLOYMENT_TYPES, e.employment_type)}
                    </Badge>
                </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                <DetailItem label="Position" className="col-span-2 sm:col-span-1">
                    {e.position}
                </DetailItem>
                <DetailItem label="Hired">
                    {e.hire_date && (
                        <>
                            {formatDate(e.hire_date)}
                            {service && <span className="text-muted-foreground block text-xs">{service} of service</span>}
                        </>
                    )}
                </DetailItem>
                <DetailItem label={e.separation_date ? 'Separated' : 'Regularized'}>
                    {e.separation_date ? formatDate(e.separation_date) : e.regularization_date && formatDate(e.regularization_date)}
                </DetailItem>
                <DetailItem label="Regular shift" className="col-span-2 sm:col-span-3 lg:col-span-1">
                    <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="text-muted-foreground size-3.5" />
                        {e.shift.name} · {formatTime(e.shift.start)} – {formatTime(e.shift.end)}
                    </span>
                </DetailItem>
            </dl>

            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="bg-muted/20 rounded-lg border p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <IdCard className="text-muted-foreground size-3.5" /> Government IDs
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {STATUTORY_FIELDS.map((f) => (
                            <DetailItem key={f.key} label={f.label} mono>
                                {e.ids[f.key]}
                            </DetailItem>
                        ))}
                    </dl>
                </div>
                <div className="bg-muted/20 rounded-lg border p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                        <Landmark className="text-muted-foreground size-3.5" /> Payroll bank
                    </p>
                    {e.bank.name ? (
                        <p className="text-sm">
                            {e.bank.name}
                            {e.bank.account_no && <span className="text-muted-foreground block font-mono text-xs">{e.bank.account_no}</span>}
                        </p>
                    ) : (
                        <p className="text-muted-foreground text-sm">Paid in cash or cheque</p>
                    )}
                </div>
            </div>

            {missing.length > 0 && e.employment_status === 'active' && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <IdCard className="mt-px size-3.5 shrink-0" />
                    Not on file: {missing.map((m) => m.label).join(', ')}. Give HR your numbers so your contributions are reported.
                </p>
            )}
        </article>
    );
}

function AccountSection({ account }: { account: Account }) {
    const permissionCount = account.access.reduce((n, m) => n + m.permissions.length, 0);

    return (
        <SettingsSection
            icon={KeyRound}
            title="Account & access"
            description="From User management. An administrator changes your role and companies."
            action={<StatusBadge active={account.status} />}
            contentClassName="space-y-5"
        >
            {!account.status && (
                <Alert variant="destructive">
                    <ShieldAlert className="size-4" />
                    <AlertTitle>Account disabled</AlertTitle>
                    <AlertDescription>Your login is disabled; an administrator can enable it.</AlertDescription>
                </Alert>
            )}

            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <DetailItem label="Username" mono>
                    {account.username}
                </DetailItem>
                <DetailItem label="Member since">{account.created_at && formatDate(account.created_at)}</DetailItem>
                <DetailItem label="Role" className="sm:col-span-2">
                    <span className="flex flex-col gap-1">
                        <RoleBadge role={account.role} className="self-start" />
                        {account.role_description && <span className="text-muted-foreground text-xs">{account.role_description}</span>}
                    </span>
                </DetailItem>
                <DetailItem label="Companies" className="sm:col-span-2">
                    {account.companies.length > 0 && (
                        <span className="flex flex-wrap gap-1.5">
                            {account.companies.map((c) => (
                                <Badge key={c.id} variant="outline" className={cn('font-normal', c.is_current && 'border-primary/40 bg-primary/5')}>
                                    <Building2 className="size-3" />
                                    {c.name}
                                    {c.is_current && <span className="text-primary text-[10px] font-medium">current</span>}
                                    {c.is_default && <span className="text-muted-foreground text-[10px]">default</span>}
                                </Badge>
                            ))}
                        </span>
                    )}
                </DetailItem>
            </dl>

            <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">What you can access</h3>
                    <span className="text-muted-foreground text-xs tabular-nums">
                        {permissionCount} permission{permissionCount === 1 ? '' : 's'} in {account.access.length} module
                        {account.access.length === 1 ? '' : 's'}
                    </span>
                </div>
                {account.access.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-sm">
                        No permissions yet. Ask an administrator to assign you a role.
                    </p>
                ) : (
                    <div className="divide-y rounded-lg border">
                        {account.access.map((m) => (
                            <details key={m.key} className="group">
                                <summary className="hover:bg-muted/40 flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                                    <ChevronRight className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-90" />
                                    <span className="flex-1 font-medium">{m.label}</span>
                                    <span className="bg-muted text-muted-foreground rounded-full px-2 text-[11px] tabular-nums">
                                        {m.permissions.length}
                                    </span>
                                </summary>
                                <div className="flex flex-wrap gap-1 px-3 pb-3 pl-9">
                                    {m.permissions.map((p) => (
                                        <span key={p} className="bg-muted/40 rounded-md border px-1.5 py-0.5 text-[11px]">
                                            {p}
                                        </span>
                                    ))}
                                </div>
                            </details>
                        ))}
                    </div>
                )}
            </div>
        </SettingsSection>
    );
}
