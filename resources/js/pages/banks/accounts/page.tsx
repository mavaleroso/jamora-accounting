import { Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { TableShell } from '@/components/ui/table-shell';

const breadcrumbs: BreadcrumbItem[] = [{ title: 'Bank accounts', href: '/banks/accounts' }];

type BankAccount = {
    id: number;
    code: string;
    name: string;
    bank_name: string;
    account_number?: string | null;
    is_shared: boolean;
    is_active: boolean;
    gl_account?: { id: number; code: string; name: string } | null;
};

type Props = { bankAccounts: BankAccount[] };

export default function BankAccountsPage({ bankAccounts }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Bank accounts" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <Heading title="Bank accounts" description="Bank accounts available for the current entity" />
                <TableShell>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Bank</TableHead>
                                <TableHead>Account #</TableHead>
                                <TableHead>GL account</TableHead>
                                <TableHead>Shared</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {bankAccounts.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center">No bank accounts for this entity.</TableCell></TableRow>
                            ) : bankAccounts.map((a) => (
                                <TableRow key={a.id}>
                                    <TableCell className="font-mono">{a.code}</TableCell>
                                    <TableCell>{a.name}</TableCell>
                                    <TableCell>{a.bank_name}</TableCell>
                                    <TableCell>{a.account_number ?? '—'}</TableCell>
                                    <TableCell>{a.gl_account ? `${a.gl_account.code} — ${a.gl_account.name}` : '—'}</TableCell>
                                    <TableCell><Badge variant={a.is_shared ? 'default' : 'secondary'}>{a.is_shared ? 'Shared' : 'Dedicated'}</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableShell>
            </div>
        </AppLayout>
    );
}
