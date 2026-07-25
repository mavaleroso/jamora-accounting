import { Head } from '@inertiajs/react';

export default function Welcome() {
    return (
        <>
            <Head title="Welcome" />
            <div className="flex min-h-screen items-center justify-center bg-background p-6">
                <div className="text-center">
                    <h1 className="text-2xl font-semibold text-foreground">Jamora Accounting</h1>
                    <p className="mt-2 text-muted-foreground">Redirecting to login…</p>
                    <a href="/login" className="mt-4 inline-block text-primary underline">
                        Go to login
                    </a>
                </div>
            </div>
        </>
    );
}
