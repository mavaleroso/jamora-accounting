import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { AlertTriangle, Briefcase, CalendarClock, Fingerprint, IdCard, KeyRound, Mail, Palmtree, Phone, UserRound, Wallet } from 'lucide-react';
import * as React from 'react';
import {
    addMonths,
    CIVIL_STATUSES,
    CONTRIBUTIONS,
    EMPLOYMENT_STATUSES,
    EMPLOYMENT_TYPES,
    formatDate,
    formatPay,
    labelOf,
    leaveTypesLabel,
    missingStatutory,
    payEquivalents,
    PROBATION_MONTHS,
    restDayLabel,
    shiftRange,
    tenure,
    type Employee,
    type LeaveTypeOption,
    type Policy,
} from '../../lib';
import type { EmployeeOverview } from './types';

export function Card({
    title,
    icon: Icon,
    action,
    className,
    children,
}: {
    title: string;
    icon: typeof Mail;
    action?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <section className={cn('bg-card flex flex-col rounded-xl border shadow-sm', className)}>
            <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="text-muted-foreground size-4" /> {title}
                </h3>
                {action}
            </header>
            <div className="flex-1 p-4">{children}</div>
        </section>
    );
}

function Item({ label, children, mono, className }: { label: string; children: React.ReactNode; mono?: boolean; className?: string }) {
    return (
        <div className={cn('min-w-0', className)}>
            <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</dt>
            <dd className={cn('mt-0.5 text-sm break-words', mono && 'font-mono')}>{children || <span className="text-muted-foreground">—</span>}</dd>
        </div>
    );
}

export function OverviewTab({
    employee: e,
    policy,
    leaveTypes,
    data,
    loading,
}: {
    employee: Employee;
    policy: Policy;
    leaveTypes: LeaveTypeOption[];
    data: EmployeeOverview | null;
    loading: boolean;
}) {
    const missing = missingStatutory(e);
    const service = tenure(e.hire_date, e.separation_date);
    const equivalents = payEquivalents(e.pay_type, Number(e.basic_pay), policy);
    const probationEnds = e.employment_type === 'probationary' && !e.regularization_date ? addMonths(e.hire_date, PROBATION_MONTHS) : null;
    const shift = e.default_shift_template;
    const active = e.employment_status === 'active';
    const alerts = [
        active && missing.length > 0 && `Missing government IDs: ${missing.map((m) => m.label).join(', ')}.`,
        active && !e.biometric_id && 'No biometric ID — time clock punches can’t be matched.',
        active && probationEnds && `Probation ends ${formatDate(probationEnds)} — review for regularization.`,
        active && data && !data.account && 'No login yet — the employee can’t use the portal. Add one under Edit › Login.',
    ].filter(Boolean) as string[];

    return (
        <div className="space-y-4">
            {alerts.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    {alerts.map((a) => (
                        <li key={a} className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            {a}
                        </li>
                    ))}
                </ul>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
                <Card title="Contact & personal" icon={UserRound}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Item label="Email" className="col-span-2">
                            {e.email && (
                                <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 hover:underline">
                                    <Mail className="text-muted-foreground size-3.5" />
                                    {e.email}
                                </a>
                            )}
                        </Item>
                        <Item label="Mobile" className="col-span-2">
                            {e.phone && (
                                <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 hover:underline">
                                    <Phone className="text-muted-foreground size-3.5" />
                                    {e.phone}
                                </a>
                            )}
                        </Item>
                        <Item label="Sex">{e.gender && (e.gender === 'female' ? 'Female' : 'Male')}</Item>
                        <Item label="Civil status">{e.civil_status && labelOf(CIVIL_STATUSES, e.civil_status)}</Item>
                    </dl>
                </Card>

                <Card title="Employment" icon={Briefcase}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Item label="Type">{labelOf(EMPLOYMENT_TYPES, e.employment_type)}</Item>
                        <Item label="Status">{labelOf(EMPLOYMENT_STATUSES, e.employment_status)}</Item>
                        <Item label="Hire date" className="col-span-2">
                            {e.hire_date && (
                                <>
                                    {formatDate(e.hire_date)}
                                    {service && <span className="text-muted-foreground"> · {service}</span>}
                                </>
                            )}
                        </Item>
                        <Item label={probationEnds ? 'Probation ends' : 'Regularized'}>
                            {probationEnds ? formatDate(probationEnds) : e.regularization_date && formatDate(e.regularization_date)}
                        </Item>
                        {e.separation_date ? (
                            <Item label="Separated">{formatDate(e.separation_date)}</Item>
                        ) : (
                            <Item label="Payroll">{e.is_active ? 'Included' : 'Excluded'}</Item>
                        )}
                    </dl>
                </Card>

                <Card title="Schedule & time clock" icon={CalendarClock}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Item label="Biometric ID" mono>
                            {e.biometric_id && (
                                <span className="inline-flex items-center gap-1">
                                    <Fingerprint className="text-muted-foreground size-3.5" />
                                    {e.biometric_id}
                                </span>
                            )}
                        </Item>
                        <Item label="Rest days">{restDayLabel(e.rest_days, policy.defaultRestDays)}</Item>
                        <Item label="Default shift" className="col-span-2">
                            {shift ? `${shift.name} (${shiftRange(shift)})` : 'Company default'}
                        </Item>
                    </dl>
                </Card>

                <Card title="Compensation" icon={Wallet}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                        <Item label="Basic rate" mono>
                            {formatPay(e)}
                        </Item>
                        <Item label="Monthly equivalent" mono>
                            {formatPhpCurrency(equivalents.monthly)}
                        </Item>
                        <Item label="Daily / hourly" mono className="col-span-2">
                            {formatPhpCurrency(equivalents.daily)} / {formatPhpCurrency(equivalents.hourly)}
                        </Item>
                        <Item label="Payroll bank">{e.bank_name || 'Cash or cheque'}</Item>
                        <Item label="Account no." mono>
                            {e.bank_account_no}
                        </Item>
                    </dl>
                </Card>

                <Card title="Government contributions" icon={IdCard} className="lg:col-span-2">
                    <div className="-mx-4 -my-4 overflow-x-auto">
                        <table className="w-full min-w-[520px] text-sm">
                            <thead>
                                <tr className="text-muted-foreground border-b text-[11px] tracking-wide uppercase">
                                    <th className="px-4 py-2 text-left font-medium">Agency</th>
                                    <th className="px-4 py-2 text-left font-medium">ID number</th>
                                    <th className="px-4 py-2 text-right font-medium">Deducted / month</th>
                                    <th className="px-4 py-2 text-right font-medium">Company / month</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {CONTRIBUTIONS.map((c) => {
                                    const row = data?.contributions[c.key];
                                    const notDeducted = row?.mode === 'none';
                                    return (
                                        <tr key={c.key}>
                                            <td className="px-4 py-2.5 font-medium">{c.label}</td>
                                            <td className="px-4 py-2.5 font-mono text-xs">
                                                {e[c.idField] ||
                                                    (notDeducted ? (
                                                        '—'
                                                    ) : (
                                                        <span className="font-sans text-amber-600 dark:text-amber-400">Missing</span>
                                                    ))}
                                            </td>
                                            {notDeducted ? (
                                                <td colSpan={2} className="text-muted-foreground px-4 py-2.5 text-right text-xs">
                                                    Not deducted
                                                </td>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-2.5 text-right font-mono">
                                                        {row ? formatPhpCurrency(row.employee) : <Skeleton className="ml-auto h-4 w-16" />}
                                                    </td>
                                                    <td className="text-muted-foreground px-4 py-2.5 text-right font-mono">
                                                        {row ? (
                                                            formatPhpCurrency(row.employer + ('ec' in row ? row.ec : 0))
                                                        ) : (
                                                            <Skeleton className="ml-auto h-4 w-16" />
                                                        )}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                                <tr>
                                    <td className="px-4 py-2.5 font-medium">BIR</td>
                                    <td className="px-4 py-2.5 font-mono text-xs">
                                        {e.tin || <span className="font-sans text-amber-600 dark:text-amber-400">Missing</span>}
                                    </td>
                                    <td colSpan={2} className="text-muted-foreground px-4 py-2.5 text-right text-xs">
                                        Withholding tax computed in payroll
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card title={`Leave balances · ${new Date().getFullYear()}`} icon={Palmtree}>
                    {loading && !data ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ) : (data?.leave ?? []).length === 0 ? (
                        <p className="text-muted-foreground text-sm">No leave types apply.</p>
                    ) : (
                        <ul className="space-y-2.5">
                            {data!.leave.map((b) => {
                                const pct = b.balance_tracked && b.entitled > 0 ? Math.min(100, ((b.available ?? 0) / b.entitled) * 100) : null;
                                return (
                                    <li key={b.leave_type_id}>
                                        <div className="flex items-baseline justify-between gap-2 text-sm">
                                            <span className="truncate">{b.name}</span>
                                            <span className="shrink-0 font-mono text-xs">
                                                {b.balance_tracked ? `${b.available ?? 0} / ${b.entitled}` : `${b.used} used`}
                                            </span>
                                        </div>
                                        {pct !== null && (
                                            <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                                                <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                        )}
                                        {b.service_note && <p className="text-muted-foreground text-[11px]">{b.service_note}</p>}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <p className="text-muted-foreground mt-3 border-t pt-2 text-[11px]">Can file: {leaveTypesLabel(e.leave_type_ids, leaveTypes)}</p>
                </Card>

                <Card title="Login account" icon={KeyRound} className="lg:col-span-2">
                    {loading && !data ? (
                        <Skeleton className="h-10 w-full" />
                    ) : data?.account ? (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                            <Item label="Username" mono>
                                {data.account.username}
                            </Item>
                            <Item label="Role">{data.account.role}</Item>
                            <Item label="Status">
                                <Badge
                                    variant="outline"
                                    className={
                                        data.account.status ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                                    }
                                >
                                    {data.account.status ? 'Active' : 'Disabled'}
                                </Badge>
                            </Item>
                            <Item label="Last sign-in">
                                {data.account.last_login_at
                                    ? new Date(data.account.last_login_at).toLocaleString('en-PH', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                          hour: 'numeric',
                                          minute: '2-digit',
                                      })
                                    : data.can.activity
                                      ? 'Never'
                                      : null}
                            </Item>
                        </dl>
                    ) : (
                        <p className="text-muted-foreground text-sm">
                            No login yet. The employee can’t clock in or see their payslips until one is added under Edit › Login.
                        </p>
                    )}
                </Card>
            </div>
        </div>
    );
}
