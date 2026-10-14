import { AlertTriangle, Fingerprint, Mail, Pencil, Phone } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
    addMonths,
    CIVIL_STATUSES,
    EMPLOYMENT_STATUSES,
    EMPLOYMENT_TYPES,
    formatDate,
    formatPay,
    fullName,
    missingStatutory,
    payEquivalents,
    PROBATION_MONTHS,
    restDayLabel,
    shiftRange,
    STATUTORY_FIELDS,
    statusBadgeClass,
    tenure,
    typeBadgeClass,
    labelOf,
    leaveTypesLabel,
    type Employee,
    type LeaveTypeOption,
    type Policy,
} from '../lib';
import { EmployeeAvatar } from './employee-avatar';

function Item({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
            <dd className={cn('mt-0.5 truncate text-sm', mono && 'font-mono')}>{children || <span className="text-muted-foreground">—</span>}</dd>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{children}</dl>
        </section>
    );
}

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: Employee | null;
    policy: Policy;
    leaveTypes: LeaveTypeOption[];
    onEdit: (employee: Employee) => void;
};

export function EmployeeProfileDialog({ open, onOpenChange, employee: e, policy, leaveTypes, onEdit }: Props) {
    if (!e) return null;

    const missing = missingStatutory(e);
    const service = tenure(e.hire_date, e.separation_date);
    const equivalents = payEquivalents(e.pay_type, Number(e.basic_pay), policy);
    const probationEnds =
        e.employment_type === 'probationary' && !e.regularization_date ? addMonths(e.hire_date, PROBATION_MONTHS) : null;
    const shift = e.default_shift_template;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl">
                <DialogHeader className="border-b px-6 pt-6 pb-5">
                    <div className="flex items-start gap-4 pr-6">
                        <EmployeeAvatar employee={e} className="size-16 text-lg" />
                        <div className="min-w-0 flex-1 text-left">
                            <DialogTitle className="text-xl">{fullName(e)}</DialogTitle>
                            <DialogDescription className="mt-1">
                                {[e.position, e.department].filter(Boolean).join(' · ') || 'No position assigned'}
                            </DialogDescription>
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="font-mono">
                                    {e.employee_code}
                                </Badge>
                                <Badge variant="outline" className={statusBadgeClass(e.employment_status)}>
                                    {labelOf(EMPLOYMENT_STATUSES, e.employment_status)}
                                </Badge>
                                <Badge variant="outline" className={typeBadgeClass(e.employment_type)}>
                                    {labelOf(EMPLOYMENT_TYPES, e.employment_type)}
                                </Badge>
                                {!e.is_active && e.employment_status !== 'separated' && (
                                    <Badge variant="outline" className="text-muted-foreground">
                                        Excluded from payroll
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
                    {(missing.length > 0 || probationEnds || !e.biometric_id) && e.employment_status === 'active' && (
                        <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            {missing.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="size-3.5 shrink-0" />
                                    Missing statutory IDs: {missing.map((m) => m.label).join(', ')}
                                </div>
                            )}
                            {!e.biometric_id && (
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="size-3.5 shrink-0" />
                                    No biometric ID — time clock punches can’t be matched.
                                </div>
                            )}
                            {probationEnds && (
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="size-3.5 shrink-0" />
                                    Probation ends {formatDate(probationEnds)} — review for regularization.
                                </div>
                            )}
                        </div>
                    )}

                    <Section title="Contact & personal">
                        <Item label="Email">
                            {e.email && (
                                <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 hover:underline">
                                    <Mail className="size-3.5 text-muted-foreground" />
                                    {e.email}
                                </a>
                            )}
                        </Item>
                        <Item label="Mobile">
                            {e.phone && (
                                <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 hover:underline">
                                    <Phone className="size-3.5 text-muted-foreground" />
                                    {e.phone}
                                </a>
                            )}
                        </Item>
                        <Item label="Sex / civil status">
                            {[e.gender && (e.gender === 'female' ? 'Female' : 'Male'), e.civil_status && labelOf(CIVIL_STATUSES, e.civil_status)]
                                .filter(Boolean)
                                .join(' · ')}
                        </Item>
                    </Section>

                    <Section title="Employment">
                        <Item label="Hire date">
                            {e.hire_date && (
                                <>
                                    {formatDate(e.hire_date)}
                                    {service && <span className="text-muted-foreground"> · {service}</span>}
                                </>
                            )}
                        </Item>
                        <Item label="Regularized">{e.regularization_date && formatDate(e.regularization_date)}</Item>
                        {e.separation_date && <Item label="Separated">{formatDate(e.separation_date)}</Item>}
                        <Item label="Biometric ID" mono>
                            {e.biometric_id && (
                                <span className="inline-flex items-center gap-1">
                                    <Fingerprint className="size-3.5 text-muted-foreground" />
                                    {e.biometric_id}
                                </span>
                            )}
                        </Item>
                        <Item label="Default shift">{shift ? `${shift.name} (${shiftRange(shift)})` : 'Company default'}</Item>
                        <Item label="Rest days">{restDayLabel(e.rest_days, policy.defaultRestDays)}</Item>
                    </Section>

                    <Section title="Compensation">
                        <Item label="Basic rate" mono>
                            {formatPay(e)}
                        </Item>
                        <Item label="Daily / hourly" mono>
                            {formatPhpCurrency(equivalents.daily)} / {formatPhpCurrency(equivalents.hourly)}
                        </Item>
                        <Item label="Monthly equivalent" mono>
                            {formatPhpCurrency(equivalents.monthly)}
                        </Item>
                        <Item label="Payroll bank">{e.bank_name}</Item>
                        <Item label="Account no." mono>
                            {e.bank_account_no}
                        </Item>
                    </Section>

                    <Section title="Leave">
                        <Item label="Can file">{leaveTypesLabel(e.leave_type_ids, leaveTypes)}</Item>
                        <Item label="Opening VL / SL">
                            {Number(e.vacation_leave_credits ?? 0)} / {Number(e.sick_leave_credits ?? 0)} days
                        </Item>
                    </Section>

                    <Section title="Government IDs">
                        {STATUTORY_FIELDS.map((f) => (
                            <Item key={f.key} label={f.label} mono>
                                {e[f.key] || <span className="font-sans text-amber-600 dark:text-amber-400">Missing</span>}
                            </Item>
                        ))}
                    </Section>
                </div>

                <div className="flex justify-end gap-2 border-t px-6 py-4">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button onClick={() => onEdit(e)}>
                        <Pencil className="size-4" />
                        Edit
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
