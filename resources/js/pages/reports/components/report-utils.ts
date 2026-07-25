import type { AccountingPeriod } from '@/types';

export function getCsrfToken(): string {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

export function formatPeriodLabel(period: {
    period_no: number;
    start_date: string;
    end_date: string;
    status: string;
    fiscal_year?: { code: string } | null;
}): string {
    const fy = period.fiscal_year?.code ? `${period.fiscal_year.code} · ` : '';
    return `${fy}P${period.period_no} (${period.start_date} – ${period.end_date}) [${period.status}]`;
}

export function buildExportUrl(basePath: string, params: Record<string, string | number | undefined>): string {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
            search.set(key, String(value));
        }
    });
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
}

export type ReportPeriodOption = AccountingPeriod & {
    fiscal_year?: { id: number; code: string } | null;
};
