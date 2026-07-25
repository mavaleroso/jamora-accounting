import { Head } from '@inertiajs/react';
import * as React from 'react';
import Heading from '@/components/heading';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';
import { PermissionsTab, type PermissionItem } from './components/permissions-tab';
import { RolesTab, type RoleItem } from './components/roles-tab';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Roles & Permissions', href: '/admin/roles' },
];

type TabId = 'roles' | 'permissions';

type Props = {
    roles: RoleItem[];
    permissionOptions: string[];
    permissions: PermissionItem[];
    roleOptions: string[];
    tab?: TabId;
};

function RolesPermissionsTabs({
    tab,
    roleCount,
    permissionCount,
    onTabChange,
}: {
    tab: TabId;
    roleCount: number;
    permissionCount: number;
    onTabChange: (nextTab: TabId) => void;
}) {
    return (
        <div className="inline-flex w-fit gap-1 rounded-lg border bg-muted/40 p-1">
            <button
                type="button"
                onClick={() => onTabChange('roles')}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    tab === 'roles'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                }`}
            >
                <span>Roles</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums ring-1 ring-border">
                    {roleCount.toLocaleString()}
                </span>
            </button>
            <button
                type="button"
                onClick={() => onTabChange('permissions')}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    tab === 'permissions'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                }`}
            >
                <span>Permissions</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-medium tabular-nums ring-1 ring-border">
                    {permissionCount.toLocaleString()}
                </span>
            </button>
        </div>
    );
}

export default function RolesPermissionsPage({
    roles,
    permissionOptions,
    permissions,
    roleOptions,
    tab: initialTab = 'roles',
}: Props) {
    const [activeTab, setActiveTab] = React.useState<TabId>(initialTab);

    React.useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const handleTabChange = (nextTab: TabId) => {
        setActiveTab(nextTab);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Roles & Permissions" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <Heading
                    title="Roles & Permissions"
                    description="Manage role presets and permission keys in one place."
                />

                <RolesPermissionsTabs
                    tab={activeTab}
                    roleCount={roles.length}
                    permissionCount={permissions.length}
                    onTabChange={handleTabChange}
                />

                {activeTab === 'roles' ? (
                    <RolesTab roles={roles} permissionOptions={permissionOptions} />
                ) : (
                    <PermissionsTab permissions={permissions} roleOptions={roleOptions} />
                )}
            </div>
        </AppLayout>
    );
}
