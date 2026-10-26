import PasswordController from '@/actions/App/Http/Controllers/Settings/PasswordController';
import InputError from '@/components/input-error';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { SettingsSection } from '@/layouts/settings/section';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { edit } from '@/routes/user-password';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Head, useForm, usePage } from '@inertiajs/react';
import { Check, KeyRound, Lightbulb, Loader2, LockKeyhole, MonitorSmartphone, ShieldCheck, UserRound, X } from 'lucide-react';
import { useRef, type FormEvent } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Password settings',
        href: edit().url,
    },
];

/** Laravel's default password rule (App\Concerns\PasswordValidationRules): at least 8 characters. */
const MIN_LENGTH = 8;

const STRENGTH = [
    { label: 'Too short', bar: 'bg-destructive', text: 'text-destructive' },
    { label: 'Weak', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
    { label: 'Fair', bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
    { label: 'Good', bar: 'bg-lime-500', text: 'text-lime-700 dark:text-lime-400' },
    { label: 'Strong', bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' },
];

/** 0 = below the minimum; 1–4 = how much harder than the minimum it is to guess. */
function strength(password: string): number {
    if (password.length < MIN_LENGTH) return 0;
    const extras = [password.length >= 12, /[a-z]/.test(password) && /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)];
    return Math.min(4, 1 + extras.filter(Boolean).length);
}

export default function Password() {
    const { auth } = usePage<SharedData>().props;
    const passwordInput = useRef<HTMLInputElement>(null);
    const currentPasswordInput = useRef<HTMLInputElement>(null);

    const form = useForm({ current_password: '', password: '', password_confirmation: '' });
    const { data, setData, errors, processing } = form;

    const score = strength(data.password);
    const level = STRENGTH[score];
    const matches = data.password_confirmation !== '' && data.password === data.password_confirmation;
    const checks = [
        { ok: data.password.length >= MIN_LENGTH, label: `At least ${MIN_LENGTH} characters`, required: true },
        { ok: data.password !== '' && data.password !== data.current_password, label: 'Different from your current password' },
        { ok: /[a-z]/.test(data.password) && /[A-Z]/.test(data.password), label: 'Upper- and lowercase letters' },
        { ok: /\d/.test(data.password), label: 'A number' },
        { ok: /[^A-Za-z0-9]/.test(data.password), label: 'A symbol, e.g. ! # $' },
    ];
    const canSubmit = data.current_password !== '' && data.password.length >= MIN_LENGTH && matches && !processing;

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.put(PasswordController.update.url(), {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                toast.success('Password updated. Use the new one next time you sign in.');
            },
            onError: (errs) => {
                if (errs.password) {
                    form.reset('password', 'password_confirmation');
                    passwordInput.current?.focus();
                }
                if (errs.current_password) {
                    form.reset('current_password');
                    currentPasswordInput.current?.focus();
                }
            },
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Password settings" />

            <h1 className="sr-only">Password Settings</h1>

            <SettingsLayout>
                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
                    <form onSubmit={submit} className="min-w-0">
                        <SettingsSection
                            icon={KeyRound}
                            title="Change password"
                            description={`The password you sign in with as @${auth.user.username}.`}
                            footer={
                                <>
                                    {(data.current_password || data.password || data.password_confirmation) && (
                                        <Button type="button" variant="ghost" onClick={() => form.reset()} disabled={processing}>
                                            Clear
                                        </Button>
                                    )}
                                    <Button type="submit" disabled={!canSubmit} data-test="update-password-button">
                                        {processing && <Loader2 className="size-4 animate-spin" />}
                                        {processing ? 'Saving…' : 'Save password'}
                                    </Button>
                                </>
                            }
                        >
                            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
                                <div className="space-y-5">
                                    <div className="grid gap-2">
                                        <Label htmlFor="current_password">Current password</Label>
                                        <PasswordInput
                                            id="current_password"
                                            ref={currentPasswordInput}
                                            name="current_password"
                                            value={data.current_password}
                                            onChange={(e) => setData('current_password', e.target.value)}
                                            autoComplete="current-password"
                                            aria-invalid={!!errors.current_password}
                                        />
                                        <InputError message={errors.current_password} />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="password">New password</Label>
                                        <PasswordInput
                                            id="password"
                                            ref={passwordInput}
                                            name="password"
                                            value={data.password}
                                            onChange={(e) => setData('password', e.target.value)}
                                            autoComplete="new-password"
                                            aria-invalid={!!errors.password}
                                            aria-describedby="password-strength"
                                        />
                                        {data.password && (
                                            <div id="password-strength" className="flex items-center gap-3" aria-live="polite">
                                                <div className="grid flex-1 grid-cols-4 gap-1">
                                                    {[1, 2, 3, 4].map((i) => (
                                                        <span
                                                            key={i}
                                                            className={cn(
                                                                'h-1.5 rounded-full transition-colors',
                                                                score >= i ? level.bar : 'bg-muted',
                                                            )}
                                                        />
                                                    ))}
                                                </div>
                                                <span className={cn('w-16 text-right text-xs font-medium', level.text)}>{level.label}</span>
                                            </div>
                                        )}
                                        <InputError message={errors.password} />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="password_confirmation">Confirm new password</Label>
                                        <PasswordInput
                                            id="password_confirmation"
                                            name="password_confirmation"
                                            value={data.password_confirmation}
                                            onChange={(e) => setData('password_confirmation', e.target.value)}
                                            autoComplete="new-password"
                                            aria-invalid={!!errors.password_confirmation || (data.password_confirmation !== '' && !matches)}
                                        />
                                        {data.password_confirmation !== '' && (
                                            <p
                                                className={cn(
                                                    'flex items-center gap-1 text-xs',
                                                    matches ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                                                )}
                                            >
                                                {matches ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                                                {matches ? 'Passwords match' : 'Passwords don’t match yet'}
                                            </p>
                                        )}
                                        <InputError message={errors.password_confirmation} />
                                    </div>
                                </div>

                                <aside className="bg-muted/30 h-fit rounded-lg border p-4">
                                    <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold">
                                        <Lightbulb className="text-muted-foreground size-3.5" /> A good password has
                                    </p>
                                    <ul className="space-y-2">
                                        {checks.map((c) => (
                                            <li
                                                key={c.label}
                                                className={cn('flex items-start gap-2 text-xs', c.ok ? 'text-foreground' : 'text-muted-foreground')}
                                            >
                                                <span
                                                    className={cn(
                                                        'mt-px flex size-4 shrink-0 items-center justify-center rounded-full border',
                                                        c.ok ? 'border-emerald-500 bg-emerald-500 text-white' : 'bg-background',
                                                    )}
                                                >
                                                    {c.ok && <Check className="size-3" strokeWidth={3} />}
                                                </span>
                                                <span>
                                                    {c.label}
                                                    {c.required && <span className="text-muted-foreground"> (required)</span>}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-muted-foreground mt-3 border-t pt-3 text-[11px] leading-relaxed">
                                        A long passphrase of a few unrelated words is easy to remember and hard to guess.
                                    </p>
                                </aside>
                            </div>
                        </SettingsSection>
                    </form>

                    <SignInSecurity username={auth.user.username} />
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}

const TIPS = [
    { icon: LockKeyhole, text: 'Use a password you don’t use on any other site.' },
    { icon: UserRound, text: 'No one from HR or IT will ever ask for your password.' },
    { icon: MonitorSmartphone, text: 'Sign out when you finish on a shared computer.' },
];

/** Where the account stands, beside the form. */
function SignInSecurity({ username }: { username: string }) {
    return (
        <SettingsSection icon={ShieldCheck} title="Sign-in security" description="Keeping your account safe.">
            <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <span className="text-muted-foreground text-sm">Username</span>
                    <span className="truncate font-mono text-sm">@{username}</span>
                </div>
                <ul className="space-y-2.5 border-t pt-4">
                    {TIPS.map(({ icon: Icon, text }) => (
                        <li key={text} className="text-muted-foreground flex gap-2.5 text-xs">
                            <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
                            {text}
                        </li>
                    ))}
                </ul>
            </div>
        </SettingsSection>
    );
}
