import type { ElementType } from 'react';
import AlJamoraLogoIcon from '@/components/al-jamora-logo-icon';
import AppLogoIcon from '@/components/app-logo-icon';

export const APP_BRAND = {
    name: 'Jamora BMS',
    tagline: 'Business Management System',
    logo: AppLogoIcon,
} as const;

export type AppEntityVisual = {
    code: string;
    name: string;
    plan: string;
    logo: ElementType;
};

export const ENTITY_VISUALS: AppEntityVisual[] = [
    {
        code: 'JAM_OPTICUS',
        name: 'JAM Opticus',
        plan: 'Wholesale & Retail',
        logo: AppLogoIcon,
    },
    {
        code: 'A_JAMORA',
        name: 'A. Jamora Optical',
        plan: 'Optical Clinic',
        logo: AppLogoIcon,
    },
    {
        code: 'AL_JAMORA',
        name: 'AL Jamora Optical',
        plan: 'Family Opticals',
        logo: AlJamoraLogoIcon,
    },
];

export function resolveEntityVisual(
    code: string | null | undefined,
    name?: string | null,
): AppEntityVisual {
    const byCode = ENTITY_VISUALS.find((entity) => entity.code === code);
    if (byCode) {
        return byCode;
    }

    return {
        code: code ?? 'ENTITY',
        name: name ?? 'Entity',
        plan: 'Entity books',
        logo: AppLogoIcon,
    };
}
