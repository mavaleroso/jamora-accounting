import type { InertiaLinkProps } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';

export type BreadcrumbItem = {
    title: string;
    href: string;
};

export type NavItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
    icon?: LucideIcon | null;
    isActive?: boolean;
    /** Optional count to display next to the label (e.g. total patients) */
    count?: number | null;
    /** One line on what the page is for, shown where pages are listed with detail (e.g. Reports). */
    description?: string;
    /** Sub-heading the item is listed under on such a page. */
    section?: string;
};
