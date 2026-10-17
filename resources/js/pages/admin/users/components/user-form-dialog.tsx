import { router } from '@inertiajs/react';
import { AlertCircle, Camera, Eye, EyeOff, RotateCcw, Wand2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import InputError from '@/components/input-error';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AccessCatalog, UserRow } from '../lib';
import { extrasOnly, generatePassword, rolePermissions, USERS_URL } from '../lib';
import { AccessFields } from './access-fields';
import { UserAvatar } from './shared';

type Props = AccessCatalog & {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** null = create a new user. */
    user: UserRow | null;
    errors?: Record<string, string>;
};

const SEX_OPTIONS = ['Male', 'Female'];

const FIELD_LABELS: Record<string, string> = {
    username: 'Username',
    email: 'Email',
    password: 'Password',
    firstname: 'First name',
    middlename: 'Middle name',
    lastname: 'Last name',
    sex: 'Sex',
    birthdate: 'Birthdate',
    contact_number: 'Contact number',
    address: 'Address',
    position: 'Position',
    date_started: 'Date started',
    role: 'Role',
    permissions: 'Permissions',
    avatar: 'Photo',
};

export function UserFormDialog({ open, onOpenChange, user, errors = {}, roles, permissions, modules }: Props) {
    const mode = user ? 'edit' : 'create';
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(94vh,50rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,76rem)]">
                <DialogHeader className="border-b px-6 py-4 text-left">
                    <DialogTitle>{mode === 'create' ? 'Create user' : `Edit ${user!.name}`}</DialogTitle>
                    <DialogDescription>{mode === 'create' ? 'Set up a sign-in, profile and access for a new person.' : 'Update profile details and access. Leave the password blank to keep it.'}</DialogDescription>
                </DialogHeader>
                {/* Remount per user so uncontrolled inputs pick up the right defaults */}
                {open && <UserForm key={user?.id ?? 'new'} user={user} errors={errors} roles={roles} permissions={permissions} modules={modules} onDone={() => onOpenChange(false)} onCancel={() => onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function UserForm({ user, errors, roles, permissions, modules, onDone, onCancel }: AccessCatalog & { user: UserRow | null; errors: Record<string, string>; onDone: () => void; onCancel: () => void }) {
    const mode = user ? 'edit' : 'create';
    const initialRole = user?.roles?.[0] ?? '';
    const [processing, setProcessing] = React.useState(false);
    const confirm = useConfirm();
    const [submitted, setSubmitted] = React.useState(false);
    const [role, setRole] = React.useState(initialRole);
    const [extras, setExtras] = React.useState(() => extrasOnly(user?.permissions, rolePermissions(roles, initialRole)));
    const [birthdate, setBirthdate] = React.useState(user?.birthdate?.toString().slice(0, 10) ?? '');
    const [dateStarted, setDateStarted] = React.useState(user?.date_started?.toString().slice(0, 10) ?? '');
    const [sex, setSex] = React.useState(user?.sex ?? '');
    const [password, setPassword] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);
    const [preview, setPreview] = React.useState<string | null>(null);
    const fileRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

    // Only surface server errors after this form was submitted (the page shares one error bag)
    const errs = submitted ? errors : {};
    const errorKeys = Object.keys(errs).filter((k) => FIELD_LABELS[k] || k.startsWith('permissions'));

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setPreview(file ? URL.createObjectURL(file) : null);
    };
    const clearFile = () => {
        if (fileRef.current) fileRef.current.value = '';
        setPreview(null);
    };

    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (mode !== 'edit') {
            const name = [data.get('firstname'), data.get('lastname')].filter(Boolean).join(' ') || 'this user';
            const ok = await confirm({
                title: `Create an account for ${name}?`,
                description: `They can sign in as ${data.get('username') || 'the new username'}${role ? ` with the ${role} role` : ''}.`,
                confirmLabel: 'Create user',
            });
            if (!ok) return;
        }
        if (!data.get('password')) data.delete('password');
        if (!(data.get('avatar') as File | null)?.size) data.delete('avatar');
        if (mode === 'edit') data.append('_method', 'PUT');
        setProcessing(true);
        setSubmitted(true);
        router.post(mode === 'edit' ? `${USERS_URL}/${user!.id}` : USERS_URL, data, {
            preserveScroll: true,
            preserveState: true,
            forceFormData: true,
            onFinish: () => setProcessing(false),
            onSuccess: () => onDone(),
            onError: () => toast.error('Please fix the highlighted fields.'),
        });
    };

    const field = (name: string, label: string, props: React.ComponentProps<typeof Input> & { hint?: string; required?: boolean } = {}) => {
        const { hint, required, className, ...rest } = props;
        return (
            <div className={cn('space-y-1.5', className)}>
                <Label htmlFor={`user-${name}`}>
                    {label}
                    {required && <span className="text-destructive"> *</span>}
                </Label>
                <Input id={`user-${name}`} name={name} aria-invalid={!!errs[name]} className={cn(errs[name] && 'border-destructive')} {...rest} />
                {hint && !errs[name] && <p className="text-xs text-muted-foreground">{hint}</p>}
                <InputError message={errs[name]} />
            </div>
        );
    };

    return (
        <form id="user-form" onSubmit={submit} encType="multipart/form-data" className="flex min-h-0 flex-1 flex-col">
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
                {/* Details */}
                <div className="space-y-5 p-5 lg:overflow-y-auto lg:border-r lg:p-6">
                    {errorKeys.length > 0 && (
                        <div className="flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                            <AlertCircle className="mt-0.5 size-4 shrink-0" />
                            <span>
                                Please check {errorKeys.length === 1 ? 'this field' : 'these fields'}: {errorKeys.map((k) => FIELD_LABELS[k.split('.')[0]] ?? k).join(', ')}.
                            </span>
                        </div>
                    )}

                    <div className="flex gap-4">
                        <div className="flex shrink-0 flex-col items-center gap-1.5">
                            <button type="button" onClick={() => fileRef.current?.click()} className="group relative rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={preview || user?.avatar ? 'Change photo' : 'Upload photo'}>
                                <UserAvatar user={user} src={preview} className="size-[4.5rem] text-lg" />
                                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    <Camera className="size-5" />
                                </span>
                            </button>
                            {preview ? (
                                <button type="button" onClick={clearFile} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                                    <RotateCcw className="size-3" /> Undo
                                </button>
                            ) : (
                                <button type="button" onClick={() => fileRef.current?.click()} className="text-[11px] text-muted-foreground hover:text-foreground" title="JPG, PNG, GIF or WebP, up to 2 MB">
                                    {user?.avatar ? 'Change photo' : 'Add photo'}
                                </button>
                            )}
                            <input ref={fileRef} type="file" name="avatar" accept="image/*" className="sr-only" onChange={onFile} tabIndex={-1} aria-label="Photo" />
                        </div>
                        <div className="grid flex-1 content-start gap-3 sm:grid-cols-3">
                            {field('firstname', 'First name', { defaultValue: user?.firstname ?? '', required: true, autoFocus: mode === 'create' })}
                            {field('middlename', 'Middle name', { defaultValue: user?.middlename ?? '' })}
                            {field('lastname', 'Last name', { defaultValue: user?.lastname ?? '', required: true })}
                            <InputError message={errs.avatar} className="sm:col-span-3" />
                        </div>
                    </div>

                    <Group title="Sign-in">
                        {field('username', 'Username', { defaultValue: user?.username ?? '', autoComplete: 'off', required: true })}
                        {field('email', 'Email', { type: 'email', defaultValue: user?.email ?? '', autoComplete: 'off', placeholder: 'name@example.com', required: true })}
                        <div className="space-y-1.5">
                            <Label htmlFor="user-password">
                                {mode === 'edit' ? 'New password' : 'Password'}
                                {mode === 'create' && <span className="text-destructive"> *</span>}
                            </Label>
                            <div className="relative">
                                <Input
                                    id="user-password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="new-password"
                                    placeholder={mode === 'edit' ? 'Keep current' : 'Min. 8 characters'}
                                    aria-invalid={!!errs.password}
                                    className={cn('pr-16 font-mono', errs.password && 'border-destructive')}
                                />
                                <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-0.5">
                                    <button type="button" onClick={() => setShowPassword((s) => !s)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide' : 'Show'}>
                                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next = generatePassword();
                                            setPassword(next);
                                            setShowPassword(true);
                                            navigator.clipboard?.writeText(next).then(() => toast.success('Password generated and copied'), () => toast.success('Password generated'));
                                        }}
                                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        aria-label="Generate password"
                                        title="Generate a strong password"
                                    >
                                        <Wand2 className="size-4" />
                                    </button>
                                </span>
                            </div>
                            <InputError message={errs.password} />
                        </div>
                    </Group>

                    <Group title="Personal details">
                        <div className="space-y-1.5">
                            <Label htmlFor="user-sex">
                                Sex<span className="text-destructive"> *</span>
                            </Label>
                            <input type="hidden" name="sex" value={sex} />
                            <Select value={sex} onValueChange={setSex}>
                                <SelectTrigger id="user-sex" className={cn('w-full', errs.sex && 'border-destructive')}>
                                    <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                    {[...SEX_OPTIONS, ...(sex && !SEX_OPTIONS.includes(sex) ? [sex] : [])].map((o) => (
                                        <SelectItem key={o} value={o}>
                                            {o}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <InputError message={errs.sex} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="user-birthdate">
                                Birthdate<span className="text-destructive"> *</span>
                            </Label>
                            <input type="hidden" name="birthdate" value={birthdate} />
                            <DatePicker id="user-birthdate" value={birthdate} onChange={setBirthdate} placeholder="Pick a date" className={cn(errs.birthdate && 'border-destructive')} />
                            <InputError message={errs.birthdate} />
                        </div>
                        {field('contact_number', 'Contact number', { defaultValue: user?.contact_number ?? '', type: 'tel', placeholder: '09XX XXX XXXX', required: true })}
                        {field('address', 'Address', { defaultValue: user?.address ?? '', className: 'sm:col-span-3', required: true })}
                    </Group>

                    <Group title="Employment">
                        {field('position', 'Position', { defaultValue: user?.position ?? '', placeholder: 'e.g. Accountant', required: true, className: 'sm:col-span-2' })}
                        <div className="space-y-1.5">
                            <Label htmlFor="user-date-started">
                                Date started<span className="text-destructive"> *</span>
                            </Label>
                            <input type="hidden" name="date_started" value={dateStarted} />
                            <DatePicker id="user-date-started" value={dateStarted} onChange={setDateStarted} placeholder="Pick a date" className={cn(errs.date_started && 'border-destructive')} />
                            <InputError message={errs.date_started} />
                        </div>
                    </Group>
                </div>

                {/* Access */}
                <div className="flex min-h-[28rem] flex-col border-t bg-muted/20 p-5 lg:min-h-0 lg:border-t-0 lg:p-6">
                    <AccessFields roles={roles} permissions={permissions} modules={modules} role={role} onRoleChange={setRole} extras={extras} onExtrasChange={setExtras} errors={errs} asFormFields />
                </div>
            </div>

            <DialogFooter className="items-center border-t bg-muted/30 px-5 py-3 sm:justify-between">
                <span className="hidden text-xs text-muted-foreground sm:block">
                    <span className="text-destructive">*</span> Required
                </span>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={processing || !role}>
                        {processing ? (mode === 'create' ? 'Creating…' : 'Saving…') : mode === 'create' ? 'Create user' : 'Save changes'}
                    </Button>
                </div>
            </DialogFooter>
        </form>
    );
}

/** Small labelled group of fields on a 3-column grid. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <fieldset>
            <legend className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</legend>
            <div className="grid gap-3 sm:grid-cols-3">{children}</div>
        </fieldset>
    );
}
