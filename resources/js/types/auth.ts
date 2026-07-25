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
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

export type Auth = {
    user: User;
};

export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

export type TwoFactorSecretKey = {
    secretKey: string;
};
