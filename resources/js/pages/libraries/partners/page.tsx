import type { Paginated } from '@/components/finance/paginator';
import { PartyDirectory, type Party } from '@/components/finance/party-directory';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';

type Props = {
    parties: Paginated<Party>;
    filters: Record<string, string | null>;
    summary: { total: number; active: number; withBalance: number; outstanding: number };
};

export default function PartnersPage(props: Props) {
    return (
        <AppLayout breadcrumbs={[{ title: 'Customers & Patients', href: '/libraries/partners' }]}>
            <Head title="Customers & Patients" />
            <PartyDirectory
                {...props}
                config={{
                    noun: 'customer',
                    title: 'Customers & Patients',
                    description: 'Retail customers, wholesale accounts and clinic patients billed by this entity.',
                    baseUrl: '/libraries/partners',
                    documentsUrl: (p) => `/billing/invoices?search=${encodeURIComponent(p.name)}`,
                    documentNoun: 'invoice',
                    balanceLabel: 'Receivable',
                    types: [
                        { value: 'customer', label: 'Retail customer' },
                        { value: 'wholesale', label: 'Wholesale' },
                        { value: 'patient', label: 'Patient' },
                    ],
                }}
            />
        </AppLayout>
    );
}
