export type * from './auth';
export type * from './navigation';
export type * from './ui';
export type * from './accounting';

import type { Auth } from './auth';

export type Flash = {
    status?: string | null;
    error?: string | null;
    openListTab?: string | null;
};

export type SharedData = {
    name: string;
    auth: Auth;
    sidebarOpen: boolean;
    flash?: Flash;
    userCount?: number;
    roleCount?: number;
    journalEntryCount?: number;
    syncExceptionCount?: number;
    entity?: {
        current: { id: number; code: string; name: string } | null;
        available: Array<{ id: number; code: string; name: string }>;
    };
    [key: string]: unknown;
};
