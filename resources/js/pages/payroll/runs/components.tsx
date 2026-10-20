import { useConfirm } from '@/components/confirm-dialog';
import InputError from '@/components/input-error';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Link, useForm } from '@inertiajs/react';
import { AlertTriangle, Loader2, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import {
    DAY_TYPE_LABEL,
    fmtRange,
    PAY_TYPE,
    PAYROLL_URL,
    peso,
    TONE,
    type AdjustmentCategory,
    type CompanyBankAccount,
    type PayslipRow,
} from './lib';

/* ---------------------------------------------------------------------------------------------- */
/* Payslip                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

function Line({ label, value, note, negative, strong }: { label: string; value: number; note?: string; negative?: boolean; strong?: boolean }) {
    if (!strong && !value) return null;
    return (
        <div className={cn('flex items-baseline justify-between gap-4 py-0.5 text-sm', strong && 'mt-1 border-t pt-1.5 font-semibold')}>
            <span className={cn(!strong && 'text-muted-foreground')}>
                {label}
                {note && <span className="text-muted-foreground/80 ml-1 text-[11px]">({note})</span>}
            </span>
            <span className={cn('font-mono tabular-nums', negative && value && 'text-rose-600 dark:text-rose-400')}>
                {negative && value ? '−' : ''}
                {peso(value)}
            </span>
        </div>
    );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
        <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wider uppercase">{title}</p>
        {children}
    </div>
);

export function PayslipDialog({
    payslip: p,
    period,
    editable,
    selfService = false,
    onClose,
    onAdd,
    onRemoveAdjustment,
}: {
    payslip: PayslipRow | null;
    period: { start_date: string; end_date: string; pay_date: string | null };
    editable: boolean;
    /** The employee viewing their own payslip: no payroll-team warnings or admin hints. */
    selfService?: boolean;
    onClose: () => void;
    onAdd?: (employeeId: number) => void;
    onRemoveAdjustment?: (id: number) => void;
}) {
    const m = p?.meta ?? {};
    const days = m.days;
    const rates = m.rates;
    const adjustments = m.adjustments ?? [];
    const benefits = m.benefits ?? [];

    return (
        <Dialog open={p !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                {p && (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-3">
                                <PersonAvatar
                                    src={p.employee?.avatar_url}
                                    seed={p.employee?.employee_code ?? String(p.id)}
                                    name={p.employee?.name}
                                    className="size-10"
                                />
                                <div>
                                    <DialogTitle>{p.employee?.name}</DialogTitle>
                                    <DialogDescription>
                                        {p.employee?.employee_code} · {p.employee?.position ?? '—'} · {fmtRange(period.start_date, period.end_date)}
                                    </DialogDescription>
                                </div>
                            </div>
                        </DialogHeader>

                        {/* Basis */}
                        <div className="bg-muted/30 grid grid-cols-2 gap-2 rounded-lg border p-3 text-xs sm:grid-cols-4">
                            <div>
                                <p className="text-muted-foreground">{PAY_TYPE[p.employee?.pay_type ?? 'monthly']}</p>
                                <p className="font-mono font-medium">{peso(p.employee?.basic_rate)}</p>
                            </div>
                            {rates && (
                                <>
                                    <div>
                                        <p className="text-muted-foreground">Daily rate</p>
                                        <p className="font-mono font-medium">{peso(rates.daily)}</p>
                                    </div>
                                    <div>
                                        <p className="text-muted-foreground">Hourly rate</p>
                                        <p className="font-mono font-medium">{peso(rates.hourly)}</p>
                                    </div>
                                </>
                            )}
                            {days && (
                                <div>
                                    <p className="text-muted-foreground">Attendance</p>
                                    <p className="font-medium">
                                        {days.worked}d worked
                                        {days.paid_leave > 0 && ` · ${days.paid_leave}d leave`}
                                        {days.absent > 0 && ` · ${days.absent}d absent`}
                                    </p>
                                </div>
                            )}
                        </div>

                        {!selfService && (m.warnings ?? []).length > 0 && (
                            <ul className={cn('space-y-0.5 rounded-md border px-3 py-2 text-xs', p.net_pay < 0 ? TONE.rose : TONE.amber)}>
                                {m.warnings!.map((w) => (
                                    <li key={w} className="flex gap-1.5">
                                        <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {w}
                                    </li>
                                ))}
                            </ul>
                        )}

                        <div className="grid gap-5 sm:grid-cols-2">
                            <div className="space-y-4">
                                <Section title="Earnings">
                                    <Line label="Basic pay" value={p.basic_pay} />
                                    <Line
                                        label="Absences"
                                        value={p.absences}
                                        note={days ? `${days.absent + days.not_employed}d` : undefined}
                                        negative
                                    />
                                    <Line
                                        label="Late & undertime"
                                        value={p.tardiness}
                                        note={
                                            m.late_minutes || m.undertime_minutes
                                                ? `${(m.late_minutes ?? 0) + (m.undertime_minutes ?? 0)} min`
                                                : undefined
                                        }
                                        negative
                                    />
                                    <Line label="Unpaid leave" value={p.unpaid_leave} note={days ? `${days.unpaid_leave}d` : undefined} negative />
                                    <Line label="Overtime" value={p.ot_pay} note={m.ot_hours ? `${m.ot_hours}h approved` : undefined} />
                                    {Object.entries(m.premiums ?? {}).map(([type, amount]) => (
                                        <Line key={type} label={DAY_TYPE_LABEL[type] ?? type} value={amount} />
                                    ))}
                                    {days && days.unworked_holiday > 0 && p.employee?.pay_type !== 'monthly' && (
                                        <Line
                                            label="Regular holiday pay"
                                            value={days.unworked_holiday * (rates?.daily ?? 0)}
                                            note={`${days.unworked_holiday}d`}
                                        />
                                    )}
                                    <Line
                                        label="Night differential"
                                        value={p.night_diff_pay}
                                        note={m.night_diff_hours ? `${m.night_diff_hours}h` : undefined}
                                    />
                                    <Line label="Taxable allowances" value={p.taxable_allowances} />
                                    <Line label="Non-taxable allowances" value={p.non_taxable_allowances} />
                                    <Line label="Gross pay" value={p.gross_pay} strong />
                                </Section>

                                <Section title="Employer share (not deducted)">
                                    <Line label="SSS" value={p.sss_er} />
                                    <Line label="SSS EC" value={p.sss_ec} />
                                    <Line label="PhilHealth" value={p.philhealth_er} />
                                    <Line label="Pag-IBIG" value={p.pagibig_er} />
                                    <Line label="Benefit programs" value={p.employer_benefits} />
                                    <Line label="Total employer cost" value={p.gross_pay + p.employer_contributions} strong />
                                </Section>
                            </div>

                            <div className="space-y-4">
                                <Section title="Deductions">
                                    <Line label="SSS" value={p.sss} note={m.sss_msc ? `MSC ${peso(m.sss_msc)}` : undefined} />
                                    <Line label="PhilHealth" value={p.philhealth} />
                                    <Line label="Pag-IBIG" value={p.pagibig} />
                                    <Line
                                        label="Withholding tax"
                                        value={p.withholding_tax}
                                        note={p.is_mwe ? 'MWE — exempt' : `on ${peso(p.taxable_income)}`}
                                    />
                                    {adjustments
                                        .filter((a) => a.kind === 'deduction')
                                        .map((a) => (
                                            <Line key={a.id} label={a.description} value={a.amount} />
                                        ))}
                                    {benefits.map((b) => (
                                        <Line key={`b${b.id}`} label={b.name} value={b.employee} note="benefit" />
                                    ))}
                                    <Line label="Total deductions" value={p.total_deductions} strong />
                                </Section>

                                <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/40">
                                    <span className="text-sm font-semibold">Net pay</span>
                                    <span
                                        className={cn(
                                            'font-mono text-lg font-semibold',
                                            p.net_pay < 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400',
                                        )}
                                    >
                                        {peso(p.net_pay)}
                                    </span>
                                </div>
                                <p className="text-muted-foreground text-[11px]">
                                    {p.employee?.bank_name
                                        ? `Credited to ${p.employee.bank_name} ${p.employee.bank_account_hint ?? ''}`
                                        : 'No payroll bank account — pay by cash or cheque.'}
                                    {' · '}13th month accrual {peso(p.thirteenth_month_accrual)}
                                </p>

                                {benefits.length > 0 && (
                                    <Section title="Benefit programs">
                                        <ul className="space-y-1">
                                            {benefits.map((b) => (
                                                <li key={b.id} className="flex items-center gap-2 text-sm">
                                                    <span
                                                        className={cn(
                                                            'rounded px-1.5 text-[10px] font-medium',
                                                            b.mode === 'earning' ? TONE.emerald : TONE.violet,
                                                        )}
                                                    >
                                                        {b.mode === 'earning' ? (b.taxable ? 'Taxable' : 'Non-taxable') : 'Contribution'}
                                                    </span>
                                                    <span className="min-w-0 flex-1 truncate">
                                                        {b.name}
                                                        {b.days !== undefined && (
                                                            <span className="text-muted-foreground">
                                                                {' '}
                                                                · {b.days} day{b.days === 1 ? '' : 's'} worked
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span className="font-mono text-xs">
                                                        {b.mode === 'earning' ? peso(b.earning) : `${peso(b.employee)} / ER ${peso(b.employer)}`}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                        {!selfService && (
                                            <p className="text-muted-foreground mt-1 text-[11px]">
                                                From enrollments in{' '}
                                                <Link href="/employee-management/benefits" className="underline underline-offset-2">
                                                    Benefits Admin
                                                </Link>
                                                . Recompute the draft after changing them.
                                            </p>
                                        )}
                                    </Section>
                                )}

                                <Section title="Adjustments">
                                    {adjustments.length === 0 ? (
                                        <p className="text-muted-foreground text-xs">None on this payroll.</p>
                                    ) : (
                                        <ul className="space-y-1">
                                            {adjustments.map((a) => (
                                                <li key={a.id} className="flex items-center gap-2 text-sm">
                                                    <span
                                                        className={cn(
                                                            'rounded px-1.5 text-[10px] font-medium',
                                                            a.kind === 'earning' ? TONE.emerald : TONE.rose,
                                                        )}
                                                    >
                                                        {a.kind === 'earning' ? (a.taxable ? 'Taxable' : 'Non-taxable') : 'Deduction'}
                                                    </span>
                                                    <span className="min-w-0 flex-1 truncate">{a.description}</span>
                                                    <span className="font-mono text-xs">{peso(a.amount)}</span>
                                                    {editable && (
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="text-muted-foreground size-7"
                                                            aria-label={`Remove ${a.description}`}
                                                            onClick={() => onRemoveAdjustment?.(a.id)}
                                                        >
                                                            <Trash2 className="size-3.5" />
                                                        </Button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {editable && p.employee && (
                                        <Button size="sm" variant="outline" className="mt-2" onClick={() => onAdd?.(p.employee!.id)}>
                                            <Plus className="size-3.5" /> Add adjustment
                                        </Button>
                                    )}
                                </Section>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Adjustment                                                                                      */
/* ---------------------------------------------------------------------------------------------- */

export function AdjustmentDialog({
    open,
    onOpenChange,
    runId,
    employeeId,
    payslips,
    categories,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    runId: number;
    employeeId: number | null;
    payslips: PayslipRow[];
    categories: AdjustmentCategory[];
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {open && (
                    <AdjustmentForm
                        runId={runId}
                        employeeId={employeeId}
                        payslips={payslips}
                        categories={categories}
                        onDone={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function AdjustmentForm({
    runId,
    employeeId,
    payslips,
    categories,
    onDone,
}: {
    runId: number;
    employeeId: number | null;
    payslips: PayslipRow[];
    categories: AdjustmentCategory[];
    onDone: () => void;
}) {
    const form = useForm({ employee_id: employeeId ? String(employeeId) : '', category: 'allowance', description: '', amount: '', taxable: true });
    const { data, setData, errors, processing } = form;
    const category = categories.find((c) => c.key === data.category);
    const isEarning = category?.kind === 'earning';
    const confirm = useConfirm();

    return (
        <form
            className="space-y-4"
            onSubmit={async (e) => {
                e.preventDefault();
                const person = payslips.find((p) => String(p.employee?.id) === data.employee_id)?.employee?.name;
                const ok = await confirm({
                    title: `Add this ${isEarning ? 'earning' : 'deduction'}?`,
                    description: `${peso(Number(data.amount) || 0)} ${category?.label ? `(${category.label}) ` : ''}is added to ${person ?? 'the employee'}'s payslip and the draft is recomputed.`,
                    confirmLabel: 'Add adjustment',
                });
                if (!ok) return;
                form.transform((d) => ({ ...d, taxable: isEarning ? d.taxable : false }));
                form.post(`${PAYROLL_URL}/${runId}/adjustments`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle>Add adjustment</DialogTitle>
                <DialogDescription>One-off earning or deduction on this payroll only. The draft is recomputed right away.</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
                <Label className="text-xs">Employee</Label>
                <Select value={data.employee_id} onValueChange={(v) => setData('employee_id', v)}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                        {payslips
                            .filter((p) => p.employee)
                            .map((p) => (
                                <SelectItem key={p.employee!.id} value={String(p.employee!.id)}>
                                    {p.employee!.name} <span className="text-muted-foreground">· {p.employee!.employee_code}</span>
                                </SelectItem>
                            ))}
                    </SelectContent>
                </Select>
                <InputError message={errors.employee_id} />
            </div>

            <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                    value={data.category}
                    onValueChange={(v) => {
                        const c = categories.find((x) => x.key === v);
                        setData((d) => ({ ...d, category: v, taxable: c?.taxable ?? true }));
                    }}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(['earning', 'deduction'] as const).map((kind) => (
                            <SelectGroup key={kind}>
                                <SelectLabel>{kind === 'earning' ? 'Earnings' : 'Deductions'}</SelectLabel>
                                {categories
                                    .filter((c) => c.kind === kind)
                                    .map((c) => (
                                        <SelectItem key={c.key} value={c.key}>
                                            {c.label}
                                        </SelectItem>
                                    ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-[1fr_140px] gap-3">
                <div className="space-y-1.5">
                    <Label className="text-xs">Description (optional)</Label>
                    <Input
                        value={data.description}
                        onChange={(e) => setData('description', e.target.value)}
                        placeholder={category?.label}
                        maxLength={255}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Amount (₱)</Label>
                    <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={data.amount}
                        onChange={(e) => setData('amount', e.target.value)}
                        className="text-right font-mono"
                    />
                </div>
            </div>
            <InputError message={errors.amount ?? (errors as Record<string, string>).status} />

            {isEarning && (
                <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div>
                        <Label className="text-sm">Taxable</Label>
                        <p className="text-muted-foreground text-[11px]">
                            De minimis benefits within BIR ceilings and reimbursements are not taxable (RR 11-2018). Everything else is.
                        </p>
                    </div>
                    <Switch checked={data.taxable} onCheckedChange={(v) => setData('taxable', v)} />
                </div>
            )}

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing || !data.employee_id || !data.amount}>
                    {processing && <Loader2 className="size-4 animate-spin" />} Add & recompute
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Release                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

/** "Payroll Account · BDO ••1234" */
const bankLabel = (b: CompanyBankAccount) =>
    [b.name, [b.bank_name, b.account_number ? `••${b.account_number.slice(-4)}` : null].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

/**
 * Release pay after a review: every employee is paid from their payroll bank (a registered bank account of the company,
 * set in their directory record), shown with the totals per account. Employees without one (cash or cheque) are paid
 * from the registered account picked here.
 */
export function ReleaseDialog({
    open,
    onOpenChange,
    runId,
    net,
    payDate,
    payslips,
    bankAccounts,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    runId: number;
    net: number;
    payDate: string | null;
    payslips: PayslipRow[];
    bankAccounts: CompanyBankAccount[];
}) {
    const active = bankAccounts.filter((b) => b.is_active);
    const form = useForm({
        paid_on: payDate ?? new Date().toISOString().slice(0, 10),
        // Only for employees without a payroll bank (cash or cheque).
        bank_account_id: active[0] ? String(active[0].id) : '',
    });
    const { data, setData, errors, processing } = form;
    const confirm = useConfirm();

    const byId = new Map(bankAccounts.map((b) => [b.id, b]));
    const fallback = (data.bank_account_id && byId.get(Number(data.bank_account_id))) || null;
    const rows = payslips
        .map((p) => {
            const preset = (p.charge_bank_account_id && byId.get(p.charge_bank_account_id)) || null;
            const bank = preset ?? fallback;
            return { p, preset: !!preset, key: bank?.id ?? 0, label: bank ? bankLabel(bank) : 'No account chosen' };
        })
        .sort((a, b) => a.label.localeCompare(b.label) || (a.p.employee?.name ?? '').localeCompare(b.p.employee?.name ?? ''));
    const unset = rows.filter((r) => !r.preset).length;
    const blocked = unset > 0 && !fallback;
    const groups = [
        ...rows
            .reduce((acc, r) => {
                const g = acc.get(r.key) ?? { label: r.label, count: 0, total: 0 };
                acc.set(r.key, { ...g, count: g.count + 1, total: g.total + Number(r.p.net_pay) });
                return acc;
            }, new Map<number, { label: string; count: number; total: number }>())
            .values(),
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl">
                <form
                    className="flex min-h-0 flex-1 flex-col"
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await confirm({
                            title: `Release ${peso(net)} net pay?`,
                            description: `${groups.map((g) => `${g.label}: ${peso(g.total)} (${g.count})`).join('; ')}. The payout is posted to the books and the run is marked paid. This cannot be undone.`,
                            confirmLabel: 'Release pay',
                        });
                        if (!ok) return;
                        form.transform((d) => ({ ...d, bank_account_id: d.bank_account_id || null }));
                        form.post(`${PAYROLL_URL}/${runId}/pay`, { preserveScroll: true, onSuccess: () => onOpenChange(false) });
                    }}
                >
                    <DialogHeader className="border-b px-6 pt-6 pb-4">
                        <DialogTitle>Review and release pay</DialogTitle>
                        <DialogDescription>
                            Each employee is paid from their payroll bank, one of the company’s registered bank accounts set in their Employee
                            Directory record. Check who is paid from which account, then release. Upload each account’s disbursement list to that bank
                            first.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Paid on</Label>
                                <Input type="date" value={data.paid_on} onChange={(e) => setData('paid_on', e.target.value)} />
                                <InputError message={errors.paid_on} />
                            </div>
                            {unset > 0 &&
                                (active.length === 0 ? (
                                    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                        {unset} {unset === 1 ? 'employee has' : 'employees have'} no payroll bank, and this company has no registered
                                        bank account to pay them from. Register one in Banks first.
                                    </p>
                                ) : (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">
                                            Paid from, for the {unset} {unset === 1 ? 'employee' : 'employees'} without a payroll bank (cash or
                                            cheque)
                                        </Label>
                                        <Select value={data.bank_account_id} onValueChange={(v) => setData('bank_account_id', v)}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Choose a registered account" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {active.map((b) => (
                                                    <SelectItem key={b.id} value={String(b.id)}>
                                                        {bankLabel(b)}
                                                        {b.company && <span className="text-muted-foreground">— {b.company}</span>}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <InputError message={(errors as Record<string, string>).bank_account_id} />
                                        <p className="text-muted-foreground text-[11px]">
                                            Give them a payroll bank under Employee Directory › Edit › Pay & contributions to make it automatic.
                                        </p>
                                    </div>
                                ))}
                        </div>

                        {/* Totals per account charged */}
                        <div className="grid gap-2 sm:grid-cols-2">
                            {groups.map((g) => (
                                <div key={g.label} className="bg-muted/30 flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium">{g.label}</div>
                                        <div className="text-muted-foreground text-[11px]">
                                            {g.count} {g.count === 1 ? 'employee' : 'employees'}
                                        </div>
                                    </div>
                                    <div className="font-mono text-sm font-semibold tabular-nums">{peso(g.total)}</div>
                                </div>
                            ))}
                        </div>

                        {/* Every employee and the account charged */}
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">Employee</th>
                                        <th className="px-3 py-2 font-medium">Credited to</th>
                                        <th className="px-3 py-2 font-medium">Paid from</th>
                                        <th className="px-3 py-2 text-right font-medium">Net pay</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {rows.map(({ p, preset, label }) => (
                                        <tr key={p.id}>
                                            <td className="px-3 py-2">
                                                <div className="font-medium">{p.employee?.name ?? '—'}</div>
                                                <div className="text-muted-foreground font-mono text-[11px]">{p.employee?.employee_code}</div>
                                            </td>
                                            <td className="text-muted-foreground px-3 py-2 text-xs">
                                                {p.employee?.bank_name && p.employee.bank_name !== '-'
                                                    ? `${p.employee.bank_name} ${p.employee.bank_account_hint ?? ''}`
                                                    : 'Cash / cheque'}
                                            </td>
                                            <td className="px-3 py-2 text-xs">
                                                {label}
                                                {!preset && <span className="ml-1.5 text-amber-700 dark:text-amber-400">(no payroll bank)</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono tabular-nums">{peso(p.net_pay)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="border-t font-semibold">
                                    <tr>
                                        <td className="px-3 py-2" colSpan={3}>
                                            Total · {rows.length} {rows.length === 1 ? 'employee' : 'employees'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono tabular-nums">{peso(net)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <InputError message={(errors as Record<string, string>).status} />
                    </div>

                    <DialogFooter className="border-t px-6 py-4">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing || rows.length === 0 || blocked}>
                            {processing && <Loader2 className="size-4 animate-spin" />} Release {peso(net)}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
