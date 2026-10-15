import type { Paginated } from '@/components/finance/paginator';
import { PartyDirectory, type Party } from '@/components/finance/party-directory';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';

type Props = {
    parties: Paginated<Party>;
    filters: Record<string, string | null>;
    summary: { total: number; active: number; withBalance: number; outstanding: number };
};

export default function VendorsPage(props: Props) {
    return (
        <AppLayout breadcrumbs={[{ title: 'Suppliers', href: '/libraries/vendors' }]}>
            <Head title="Suppliers" />
            <PartyDirectory
                {...props}
                config={{
                    noun: 'supplier',
                    title: 'Suppliers',
                    description: 'Lens, frame and service suppliers billed through Accounts Payable.',
                    baseUrl: '/libraries/vendors',
                    documentsUrl: (p) => `/ap/bills?search=${encodeURIComponent(p.name)}`,
                    documentNoun: 'bill',
                    balanceLabel: 'Payable',
                }}
            />
        </AppLayout>
    );
}
