import { AppearanceToggle } from '@/components/appearance-toggle';
import TextLink from '@/components/text-link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { APP_BRAND, ENTITY_VISUALS } from '@/lib/entities';
import { store } from '@/routes/login';
import { request } from '@/routes/password';
import { Form } from '@inertiajs/react';
import { AlertCircle, ArrowRight, Banknote, BookOpen, Eye, EyeOff, Link2, Lock, Receipt, ShieldCheck, User } from 'lucide-react';
import type { ElementType } from 'react';
import * as React from 'react';

type Props = {
    status?: string;
    canResetPassword?: boolean;
};

type Module = {
    icon: ElementType;
    title: string;
    description: string;
};

const MODULES: Module[] = [
    {
        icon: BookOpen,
        title: 'Double-entry books',
        description: 'Journals, general ledger and period closing per entity.',
    },
    {
        icon: Receipt,
        title: 'Billing & payables',
        description: 'Invoices, customer deposits, bills and bank reconciliation.',
    },
    {
        icon: Banknote,
        title: 'People & payroll',
        description: 'Attendance, payroll runs and DOLE statutory compliance.',
    },
    {
        icon: Link2,
        title: 'Optical sync',
        description: 'Clinic sales and inventory posted straight to the ledger.',
    },
];

export default function LoginPage({ status, canResetPassword = true }: Props) {
    const [showPassword, setShowPassword] = React.useState(false);
    const [capsLockOn, setCapsLockOn] = React.useState(false);
    const BrandLogo = APP_BRAND.logo;
    const year = new Date().getFullYear();

    const trackCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => {
        setCapsLockOn(event.getModifierState?.('CapsLock') ?? false);
    };

    return (
        <AuthLayout title="Sign in" description="Sign in to Jamora BMS">
            <div className="bg-background grid min-h-svh grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {/* Brand / system context panel */}
                <aside className="relative hidden overflow-hidden bg-zinc-950 text-zinc-100 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 opacity-[0.07]"
                        style={{
                            backgroundImage:
                                'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
                            backgroundSize: '44px 44px',
                        }}
                    />
                    <div aria-hidden className="bg-primary/20 pointer-events-none absolute -top-40 -right-32 size-[28rem] rounded-full blur-3xl" />

                    <div className="relative flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-white/5 p-1 ring-1 ring-white/10">
                            <BrandLogo className="size-full" />
                        </div>
                        <div className="leading-tight">
                            <p className="font-semibold">{APP_BRAND.name}</p>
                            <p className="text-xs text-zinc-400">{APP_BRAND.tagline}</p>
                        </div>
                    </div>

                    <div className="relative max-w-xl space-y-10">
                        <div className="space-y-4">
                            <p className="text-primary text-xs font-medium tracking-[0.2em] uppercase">Multi-entity · Optical retail &amp; clinics</p>
                            <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance xl:text-5xl">
                                One set of books for every Jamora branch.
                            </h2>
                            <p className="max-w-md text-base text-pretty text-zinc-400">
                                Accounting, billing, payroll and optical clinic sales — kept separate per entity, reconciled in one place.
                            </p>
                        </div>

                        <ul className="grid grid-cols-2 gap-x-8 gap-y-6">
                            {MODULES.map(({ icon: Icon, title, description }) => (
                                <li key={title} className="flex gap-3">
                                    <div className="bg-primary/10 text-primary ring-primary/20 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ring-1">
                                        <Icon className="size-4" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">{title}</p>
                                        <p className="text-sm text-zinc-400">{description}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <BalancedCard />
                    </div>

                    <div className="relative space-y-3">
                        <p className="text-xs text-zinc-500">Entities on this system</p>
                        <ul className="flex flex-wrap gap-2">
                            {ENTITY_VISUALS.map(({ code, name, plan, logo: Logo }) => (
                                <li key={code} className="flex items-center gap-2 rounded-full bg-white/5 py-1 pr-3 pl-1 ring-1 ring-white/10">
                                    <span className="flex size-6 items-center justify-center overflow-hidden rounded-full bg-white p-0.5">
                                        <Logo className="size-full" />
                                    </span>
                                    <span className="text-xs font-medium">{name}</span>
                                    <span className="text-xs text-zinc-500">· {plan}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </aside>

                {/* Sign-in panel */}
                <main className="flex flex-col p-4 sm:p-6 md:p-8 lg:p-10">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2 lg:invisible">
                            <div className="flex size-8 items-center justify-center overflow-hidden rounded-md">
                                <BrandLogo className="size-full" />
                            </div>
                            <span className="truncate text-sm font-semibold">{APP_BRAND.name}</span>
                        </div>
                        <AppearanceToggle />
                    </div>

                    <div className="flex flex-1 items-center justify-center py-10">
                        <div className="w-full max-w-sm">
                            <div className="mb-8 space-y-2">
                                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back</h1>
                                <p className="text-muted-foreground text-sm text-pretty">
                                    Sign in with the username issued by your administrator. You'll land in the modules your role has access to.
                                </p>
                            </div>

                            <Form {...store.form()} resetOnSuccess={['password']} className="flex flex-col gap-6">
                                {({ processing, errors }) => {
                                    const errorMessage = errors.username ?? errors.password;

                                    return (
                                        <FieldGroup>
                                            {status ? (
                                                <Alert className="border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
                                                    <ShieldCheck />
                                                    <AlertDescription className="text-inherit">{status}</AlertDescription>
                                                </Alert>
                                            ) : null}

                                            {errorMessage ? (
                                                <Alert variant="destructive" role="alert">
                                                    <AlertCircle />
                                                    <AlertDescription>{errorMessage}</AlertDescription>
                                                </Alert>
                                            ) : null}

                                            <Field>
                                                <FieldLabel htmlFor="username">Username</FieldLabel>
                                                <div className="relative">
                                                    <User className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                                                    <Input
                                                        id="username"
                                                        type="text"
                                                        name="username"
                                                        required
                                                        autoFocus
                                                        tabIndex={1}
                                                        autoComplete="username"
                                                        autoCapitalize="none"
                                                        spellCheck={false}
                                                        placeholder="e.g. jdelacruz"
                                                        aria-invalid={errors.username ? true : undefined}
                                                        className="h-10 pl-9"
                                                    />
                                                </div>
                                            </Field>

                                            <Field>
                                                <div className="flex items-center justify-between gap-2">
                                                    <FieldLabel htmlFor="password">Password</FieldLabel>
                                                    {canResetPassword ? (
                                                        <TextLink href={request()} className="text-sm" tabIndex={6}>
                                                            Forgot password?
                                                        </TextLink>
                                                    ) : null}
                                                </div>
                                                <div className="relative">
                                                    <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                                                    <Input
                                                        id="password"
                                                        type={showPassword ? 'text' : 'password'}
                                                        name="password"
                                                        required
                                                        tabIndex={2}
                                                        autoComplete="current-password"
                                                        placeholder="Enter your password"
                                                        aria-invalid={errors.password ? true : undefined}
                                                        aria-describedby={capsLockOn ? 'caps-lock-hint' : undefined}
                                                        onKeyUp={trackCapsLock}
                                                        onKeyDown={trackCapsLock}
                                                        onBlur={() => setCapsLockOn(false)}
                                                        className="h-10 pr-10 pl-9"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword((value) => !value)}
                                                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
                                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                        aria-pressed={showPassword}
                                                        tabIndex={5}
                                                    >
                                                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                                    </button>
                                                </div>
                                                {capsLockOn ? (
                                                    <p id="caps-lock-hint" className="text-xs text-amber-600 dark:text-amber-400">
                                                        Caps Lock is on.
                                                    </p>
                                                ) : null}
                                            </Field>

                                            <div className="flex items-center gap-2">
                                                <Checkbox id="remember" name="remember" tabIndex={3} />
                                                <Label htmlFor="remember" className="text-sm font-normal">
                                                    Keep me signed in on this device
                                                </Label>
                                            </div>

                                            <Button
                                                type="submit"
                                                className="group h-10 w-full"
                                                tabIndex={4}
                                                disabled={processing}
                                                data-test="login-button"
                                            >
                                                {processing ? <Spinner /> : null}
                                                {processing ? 'Signing in…' : 'Sign in'}
                                                {processing ? null : <ArrowRight className="transition-transform group-hover:translate-x-0.5" />}
                                            </Button>
                                        </FieldGroup>
                                    );
                                }}
                            </Form>

                            <p className="text-muted-foreground mt-8 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs">
                                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                                <span>
                                    Accounts are created by an administrator — there is no self sign-up. Every posting and change is recorded in the
                                    audit trail.
                                </span>
                            </p>
                        </div>
                    </div>

                    <p className="text-muted-foreground text-center text-xs">
                        © {year} {APP_BRAND.name}
                    </p>
                </main>
            </div>
        </AuthLayout>
    );
}

function BalancedCard() {
    const rows = [
        { account: '1000 · Cash on Hand', debit: '48,250.00', credit: '' },
        { account: '4000 · Sales Revenue', debit: '', credit: '43,080.36' },
        { account: '2100 · Output VAT', debit: '', credit: '5,169.64' },
    ];

    return (
        <div aria-hidden className="max-w-md rounded-xl bg-white/[0.03] p-4 font-mono text-xs ring-1 ring-white/10">
            <div className="mb-3 flex items-center justify-between font-sans">
                <span className="text-zinc-400">Optical sync · daily sales</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20">
                    Balanced
                </span>
            </div>
            <div className="divide-y divide-white/5">
                {rows.map((row) => (
                    <div key={row.account} className="grid grid-cols-[1fr_auto_auto] gap-4 py-1.5">
                        <span className="truncate text-zinc-300">{row.account}</span>
                        <span className="w-20 text-right text-zinc-300 tabular-nums">{row.debit}</span>
                        <span className="w-20 text-right text-zinc-300 tabular-nums">{row.credit}</span>
                    </div>
                ))}
                <div className="text-primary grid grid-cols-[1fr_auto_auto] gap-4 pt-2 font-semibold">
                    <span>Total</span>
                    <span className="w-20 text-right tabular-nums">48,250.00</span>
                    <span className="w-20 text-right tabular-nums">48,250.00</span>
                </div>
            </div>
        </div>
    );
}
