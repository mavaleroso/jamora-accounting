import { Head } from '@inertiajs/react';

import AppearanceTabs from '@/components/appearance-tabs';
import HeadingSmall from '@/components/heading-small';
import LayoutToggle, { ContentWidthToggle } from '@/components/layout-toggle';
import { type BreadcrumbItem } from '@/types';

import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Appearance settings',
        href: '/settings/appearance',
    },
];

export default function Appearance() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Appearance settings" />

            <SettingsLayout>
                <div className="space-y-10">
                    <div className="space-y-6">
                        <HeadingSmall title="Appearance settings" description="Update your account's appearance settings" />
                        <AppearanceTabs />
                    </div>

                    <div className="space-y-6">
                        <HeadingSmall title="Layout" description="Choose sidebar navigation or a top navigation bar. Saved for this browser." />
                        <LayoutToggle />
                    </div>

                    <div className="space-y-6">
                        <HeadingSmall title="Content width" description="Keep pages at a centred width, or let them use the full screen." />
                        <ContentWidthToggle />
                    </div>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
