import { Form, usePage } from '@inertiajs/react';
import * as React from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { AppearanceToggle } from '@/components/appearance-toggle';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { toast } from '@/lib/toast';
import { store } from '@/routes/login';
import { request } from '@/routes/password';
import type { SharedData } from '@/types';

type Props = {
    status?: string;
};

export default function LoginPage({ status }: Props) {
    const { name, errors: pageErrors } = usePage<SharedData>().props as SharedData & {
        errors?: Record<string, string>;
    };
    const errorMessage = pageErrors ? Object.values(pageErrors).find(Boolean) : null;
    const lastErrorRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!errorMessage || lastErrorRef.current === errorMessage) {
            return;
        }
        toast.error(errorMessage);
        lastErrorRef.current = errorMessage;
    }, [errorMessage]);

    return (
        <AuthLayout
            title="Log in to your account"
            description="Enter your username and password below to log in"
        >
            <div className="grid min-h-svh grid-cols-1 lg:grid-cols-3">
                <div className="order-1 flex flex-col gap-4 p-4 sm:p-6 md:p-8 lg:order-2 lg:p-10">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                        <a href="/" className="flex min-w-0 items-center gap-2 font-medium">
                            <div className="flex size-6 items-center justify-center rounded-md">
                                <AppLogoIcon className="size-4" />
                            </div>
                            <span className="truncate">{name}</span>
                        </a>
                        <AppearanceToggle />
                    </div>

                    <div className="flex min-h-0 flex-1 items-center justify-center py-4 sm:py-6">
                        <div className="w-full max-w-xs">
                            <Form
                                {...store.form()}
                                resetOnSuccess={['password']}
                                className="flex flex-col gap-6"
                            >
                                {({ processing, errors }) => (
                                    <FieldGroup>
                                        <div className="flex flex-col items-center gap-1 text-center">
                                            <h1 className="text-xl font-bold sm:text-2xl">Login to your account</h1>
                                            <p className="text-sm text-balance text-muted-foreground">
                                                Enter your username and password below to login to your account
                                            </p>
                                        </div>

                                        {errorMessage ? (
                                            <Alert variant="destructive">
                                                <AlertDescription>{errorMessage}</AlertDescription>
                                            </Alert>
                                        ) : null}

                                        {status ? (
                                            <div className="mb-4 text-center text-sm font-medium text-green-600">
                                                {status}
                                            </div>
                                        ) : null}

                                        <Field>
                                            <FieldLabel htmlFor="username">Username</FieldLabel>
                                            <Input
                                                id="username"
                                                type="text"
                                                name="username"
                                                required
                                                autoFocus
                                                tabIndex={1}
                                                autoComplete="username"
                                                placeholder="Username"
                                            />
                                            <InputError message={errors.username} />
                                        </Field>

                                        <Field>
                                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                                <FieldLabel htmlFor="password">Password</FieldLabel>
                                                <TextLink href={request()} className="text-sm" tabIndex={5}>
                                                    Forgot your password?
                                                </TextLink>
                                            </div>
                                            <Input
                                                id="password"
                                                type="password"
                                                name="password"
                                                required
                                                tabIndex={2}
                                                autoComplete="current-password"
                                                placeholder="Password"
                                            />
                                            <InputError message={errors.password} />
                                        </Field>

                                        <Field>
                                            <Button
                                                type="submit"
                                                className="mt-4 w-full"
                                                tabIndex={3}
                                                disabled={processing}
                                                data-test="login-button"
                                            >
                                                {processing ? <Spinner /> : null}
                                                Log in
                                            </Button>
                                        </Field>
                                    </FieldGroup>
                                )}
                            </Form>
                        </div>
                    </div>
                </div>

                <div className="relative order-2 col-span-2 bg-secondary p-4 sm:p-6 md:p-10 lg:order-1 lg:p-24 xl:p-36">
                    <img
                        src="/assets/img/media/accounting_login_cover.jpg"
                        alt="Accounting workspace"
                        className="h-full max-h-[200px] w-full rounded-lg object-cover sm:max-h-[280px] md:max-h-[360px] lg:max-h-none dark:brightness-[0.2] dark:grayscale"
                    />
                </div>
            </div>
        </AuthLayout>
    );
}
