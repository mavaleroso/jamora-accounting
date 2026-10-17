import type { Balance, RequestItem, Status } from '@/pages/employee-management/requests/lib';
import type { PayslipRow, RunStatus } from '@/pages/payroll/runs/lib';
import type { AuditTrail } from '@/types';
import * as React from 'react';

/** GET /libraries/employees/{id}/overview (App\Http\Controllers\Libraries\EmployeeOverviewController). */
export type EmployeeOverview = {
    can: { payroll: boolean; requests: boolean; attendance: boolean; activity: boolean };
    account: { id: number; username: string | null; email: string | null; status: boolean; role: string | null; last_login_at: string | null } | null;
    contributions: {
        sss: { employee: number; employer: number; ec: number; msc: number | null; mode: 'auto' | 'none' };
        philhealth: { employee: number; employer: number; mode: 'auto' | 'none' };
        pagibig: { employee: number; employer: number; mode: 'auto' | 'none' };
    };
    leave: Balance[];
    payroll: {
        year: number;
        ytd: { payslips: number; gross: number; net: number; contributions: number; withholding_tax: number; thirteenth_month: number };
        payslips: ProfilePayslip[];
    } | null;
    requests: { counts: Partial<Record<Status, number>>; items: RequestItem[] } | null;
    attendance: {
        from: string;
        to: string;
        summary: {
            days_worked: number;
            late_days: number;
            late_minutes: number;
            undertime_minutes: number;
            absences: number;
            leave_days: number;
            missing_punches: number;
            hours_worked: number;
            ot_hours: number;
            pending: number;
        };
        days: AttendanceDay[];
    } | null;
    activity: { items: AuditTrail[]; subject: { type: string; id: string }; truncated: boolean } | null;
};

export type ProfilePayslip = PayslipRow & {
    run: { id: number; run_no: string; status: RunStatus; paid_on: string | null };
    period: { code: string; start_date: string; end_date: string; pay_date: string | null };
};

export type AttendanceDay = {
    id: number;
    work_date: string;
    day_type: string | null;
    attendance_status: string | null;
    status: string;
    time_in: string | null;
    break_out: string | null;
    break_in: string | null;
    time_out: string | null;
    regular_hours: number;
    tardiness_minutes: number;
    undertime_minutes: number;
    ot_hours_approved: number;
    source: string | null;
};

/** Loads the profile's history when it opens; reload after an edit. */
export function useEmployeeOverview(employeeId: number | null, open: boolean) {
    const [data, setData] = React.useState<EmployeeOverview | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [nonce, setNonce] = React.useState(0);

    React.useEffect(() => {
        if (!open || !employeeId) return;
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        fetch(`/libraries/employees/${employeeId}/overview`, {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            signal: controller.signal,
        })
            .then(async (res) => {
                if (!res.ok)
                    throw new Error(
                        res.status === 403 ? 'You do not have access to this employee’s history.' : 'Could not load the employee’s history.',
                    );
                setData((await res.json()) as EmployeeOverview);
            })
            .catch((e: Error) => {
                if (e.name !== 'AbortError') setError(e.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [employeeId, open, nonce]);

    // A different employee starts from a clean slate rather than showing the previous one's data.
    React.useEffect(() => setData(null), [employeeId]);

    return { data, loading, error, reload: () => setNonce((n) => n + 1) };
}
