export type User = {
    id: number;
    name: string;
    username: string;
    email: string | null;
    firstname?: string | null;
    middlename?: string | null;
    lastname?: string | null;
    avatar?: string | null;
    address?: string | null;
    sex?: string | null;
    contact_number?: string | null;
    birthdate?: string | null;
    position?: string | null;
    date_started?: string | null;
    status?: boolean;
    email_verified_at: string | null;
    two_factor_enabled?: boolean;
    roles?: string[];
    permissions?: string[];
    /** Linked employee record in the current branch, if any. */
    employee_id?: number | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

/** An Admin who is also an employee uses the system as an admin or as that employee. */
export type ViewMode = 'admin' | 'employee';

export type Auth = {
    user: User;
    /** The view in use, for an Admin who is also an employee; null for everyone else. */
    viewMode?: ViewMode | null;
};

export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

export type TwoFactorSecretKey = {
    secretKey: string;
};
