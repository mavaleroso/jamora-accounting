import { useForm } from '@inertiajs/react';
import { Info, Loader2, Search } from 'lucide-react';
import * as React from 'react';
import InputError from '@/components/input-error';
import { PersonAvatar } from '@/components/person-avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
    BENEFITS_URL,
    CATEGORY_LABEL,
    defaultShares,
    fmtDate,
    isOpen,
    MODE,
    peso,
    programAmounts,
    TONE,
    type EmployeeRow,
    type Enrollment,
    type PayrollMode,
    type Program,
} from './lib';

export function ModeBadge({ mode, className }: { mode: PayrollMode; className?: string }) {
    return <span className={cn('inline-flex items-center rounded border px-1.5 py-px text-[10px] font-semibold', TONE[MODE[mode].tone], className)}>{MODE[mode].label}</span>;
}

const Field = ({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor?: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) => (
    <div className={cn('space-y-1.5', className)}>
        <Label htmlFor={htmlFor}>{label}</Label>
        {children}
        {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        <InputError message={error} />
    </div>
);

function MoneyInput({ id, value, onChange, suffix = '/ mo' }: { id: string; value: string; onChange: (v: string) => void; suffix?: string }) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">₱</span>
            <Input id={id} type="number" min="0" step="0.01" inputMode="decimal" className="pr-12 pl-6 font-mono" value={value} onChange={(e) => onChange(e.target.value)} />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
        </div>
    );
}

function PayrollEffect({ program }: { program: Program }) {
    const m = MODE[program.payroll_mode];
    return (
        <div className={cn('flex gap-2 rounded-lg border px-3 py-2 text-xs', TONE[m.tone])}>
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <div>
                <p className="font-semibold">
                    {m.label}
                    {program.payroll_mode === 'earning' && (program.is_taxable ? ' · taxable' : ' · non-taxable')} — {programAmounts(program)}
                </p>
                <p className="opacity-90">
                    {m.effect}
                    {program.payroll_mode !== 'none' && ' Semi-monthly payrolls apply half the monthly amount per cut-off.'}
                </p>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Enroll employees                                                                                */
/* ---------------------------------------------------------------------------------------------- */

export function EnrollDialog({
    open,
    onOpenChange,
    programs,
    employees,
    enrollments,
    programId,
    today,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    programs: Program[];
    employees: EmployeeRow[];
    enrollments: Enrollment[];
    programId: number | null;
    today: string;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
                {open && (
                    <EnrollForm
                        programs={programs.filter((p) => p.is_active && p.payroll_mode !== 'statutory')}
                        employees={employees}
                        enrollments={enrollments}
                        programId={programId}
                        today={today}
                        onDone={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function EnrollForm({
    programs,
    employees,
    enrollments,
    programId,
    today,
    onDone,
}: {
    programs: Program[];
    employees: EmployeeRow[];
    enrollments: Enrollment[];
    programId: number | null;
    today: string;
    onDone: () => void;
}) {
    const form = useForm({
        benefit_program_id: programId ? String(programId) : programs[0] ? String(programs[0].id) : '',
        employee_ids: [] as number[],
        custom: false,
        employee_share: '',
        employer_share: '',
        participation_status: 'active',
        effective_date: today,
        end_date: '',
        notes: '',
    });
    const { data, setData, errors, processing } = form;
    const [query, setQuery] = React.useState('');

    const program = programs.find((p) => String(p.id) === data.benefit_program_id);
    const isEarning = program?.payroll_mode === 'earning';
    const enrolled = React.useMemo(
        () => new Set(enrollments.filter((e) => String(e.program_id) === data.benefit_program_id && isOpen(e)).map((e) => e.employee_id)),
        [enrollments, data.benefit_program_id],
    );

    const shown = employees.filter((e) => {
        const q = query.trim().toLowerCase();
        return !q || [e.name, e.employee_code, e.position, e.department].some((v) => v?.toLowerCase().includes(q));
    });
    const selectable = shown.filter((e) => !enrolled.has(e.id));
    const allShownSelected = selectable.length > 0 && selectable.every((e) => data.employee_ids.includes(e.id));

    const toggle = (id: number, on: boolean) => setData('employee_ids', on ? [...data.employee_ids, id] : data.employee_ids.filter((x) => x !== id));
    const toggleAll = (on: boolean) => {
        const ids = selectable.map((e) => e.id);
        setData('employee_ids', on ? [...new Set([...data.employee_ids, ...ids])] : data.employee_ids.filter((x) => !ids.includes(x)));
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({
            benefit_program_id: d.benefit_program_id,
            employee_ids: d.employee_ids,
            employee_share: d.custom && !isEarning ? d.employee_share || 0 : null,
            employer_share: d.custom ? d.employer_share || 0 : null,
            participation_status: d.participation_status,
            effective_date: d.effective_date || null,
            end_date: d.end_date || null,
            notes: d.notes || null,
        }));
        form.post(`${BENEFITS_URL}/enroll`, { preserveScroll: true, onSuccess: onDone });
    };

    if (programs.length === 0) {
        return (
            <>
                <DialogHeader>
                    <DialogTitle>Enroll employees</DialogTitle>
                    <DialogDescription>There are no active company programs yet. Create one first.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={onDone}>
                        Close
                    </Button>
                </DialogFooter>
            </>
        );
    }

    const n = data.employee_ids.length;

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Enroll employees</DialogTitle>
                <DialogDescription>Pick a program and the employees to enroll. Active enrollments are applied the next time a payroll is computed.</DialogDescription>
            </DialogHeader>

            <Field label="Program" htmlFor="program" error={errors.benefit_program_id}>
                <Select value={data.benefit_program_id} onValueChange={(v) => setData((d) => ({ ...d, benefit_program_id: v, employee_ids: [] }))}>
                    <SelectTrigger id="program">
                        <SelectValue placeholder="Select a program" />
                    </SelectTrigger>
                    <SelectContent>
                        {programs.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                                {p.name} <span className="text-muted-foreground">· {MODE[p.payroll_mode].label}</span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            {program && <PayrollEffect program={program} />}

            {/* Employees */}
            <div className="space-y-1.5">
                <div className="flex items-end justify-between gap-2">
                    <Label>Employees</Label>
                    <span className="text-xs text-muted-foreground">{n > 0 ? `${n} selected` : 'None selected'}</span>
                </div>
                <div className="rounded-lg border">
                    <div className="flex items-center gap-2 border-b px-2.5 py-2">
                        <Checkbox checked={allShownSelected} disabled={selectable.length === 0} onCheckedChange={(v) => toggleAll(v === true)} aria-label="Select all shown" />
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, code, position, department" className="h-8 pl-7 text-sm" />
                        </div>
                    </div>
                    <ul className="max-h-64 divide-y overflow-y-auto">
                        {shown.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">No employees match “{query}”.</li>}
                        {shown.map((e) => {
                            const already = enrolled.has(e.id);
                            const checked = data.employee_ids.includes(e.id);
                            const preview = program ? defaultShares(program, e) : null;
                            return (
                                <li key={e.id}>
                                    <label className={cn('flex items-center gap-2.5 px-2.5 py-2', already ? 'opacity-60' : 'cursor-pointer hover:bg-muted/40', checked && 'bg-primary/5')}>
                                        <Checkbox checked={checked} disabled={already} onCheckedChange={(v) => toggle(e.id, v === true)} />
                                        <PersonAvatar src={e.avatar_url} seed={e.employee_code} name={e.name} className="size-7" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{e.name}</span>
                                            <span className="block truncate text-[11px] text-muted-foreground">
                                                {e.employee_code} · {e.position ?? '—'}
                                                {e.department && ` · ${e.department}`}
                                            </span>
                                        </span>
                                        {already ? (
                                            <span className={cn('rounded border px-1.5 text-[10px] font-medium', TONE.emerald)}>Enrolled</span>
                                        ) : (
                                            preview &&
                                            !data.custom && (
                                                <span className="text-right font-mono text-[11px] text-muted-foreground tabular-nums">
                                                    {isEarning ? peso(preview.employer) : `${peso(preview.employee)} / ${peso(preview.employer)}`}
                                                </span>
                                            )
                                        )}
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                </div>
                <InputError message={errors.employee_ids ?? (errors as Record<string, string>)['employee_ids.0']} />
            </div>

            {/* Amounts */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium">{isEarning ? 'Monthly allowance' : 'Monthly shares'}</p>
                        <p className="text-[11px] text-muted-foreground">
                            {data.custom
                                ? 'The same amount for every selected employee.'
                                : program?.contribution_basis === 'percent_of_basic'
                                  ? 'Program default, computed from each employee’s monthly rate (shown beside each name).'
                                  : 'Program default (shown beside each name).'}
                        </p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs font-medium">
                        Custom amount
                        <Switch checked={data.custom} onCheckedChange={(v) => setData('custom', v)} />
                    </label>
                </div>
                {data.custom && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {!isEarning && (
                            <Field label="Employee share" htmlFor="ee" error={errors.employee_share} hint="Deducted from pay">
                                <MoneyInput id="ee" value={data.employee_share} onChange={(v) => setData('employee_share', v)} />
                            </Field>
                        )}
                        <Field label={isEarning ? 'Allowance' : 'Employer share'} htmlFor="er" error={errors.employer_share} hint={isEarning ? 'Paid on the payslip' : 'Company-paid premium'}>
                            <MoneyInput id="er" value={data.employer_share} onChange={(v) => setData('employer_share', v)} />
                        </Field>
                    </div>
                )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Starts" error={errors.effective_date}>
                    <DatePicker value={data.effective_date} onChange={(v) => setData('effective_date', v)} />
                </Field>
                <Field label="Ends (optional)" error={errors.end_date}>
                    <DatePicker value={data.end_date} onChange={(v) => setData('end_date', v)} placeholder="Open-ended" />
                </Field>
                <Field label="Status" htmlFor="status" error={errors.participation_status}>
                    <Select value={data.participation_status} onValueChange={(v) => setData('participation_status', v)}>
                        <SelectTrigger id="status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">Active — apply to payroll</SelectItem>
                            <SelectItem value="pending">Pending — hold for now</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
            </div>

            <Field label="Notes (optional)" htmlFor="notes" error={errors.notes}>
                <Input id="notes" value={data.notes} onChange={(e) => setData('notes', e.target.value)} placeholder="e.g. Policy no., dependents covered" />
            </Field>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone} disabled={processing}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing || n === 0}>
                    {processing && <Loader2 className="size-4 animate-spin" />}
                    {n === 0 ? 'Enroll' : `Enroll ${n} employee${n === 1 ? '' : 's'}`}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Edit / end an enrollment                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export function EnrollmentDialog({
    enrollment,
    program,
    employee,
    onClose,
}: {
    enrollment: Enrollment | null;
    program: Program | undefined;
    employee: EmployeeRow | undefined;
    onClose: () => void;
}) {
    return (
        <Dialog open={enrollment !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                {enrollment && program && employee && <EnrollmentForm enrollment={enrollment} program={program} employee={employee} onDone={onClose} />}
            </DialogContent>
        </Dialog>
    );
}

function EnrollmentForm({ enrollment, program, employee, onDone }: { enrollment: Enrollment; program: Program; employee: EmployeeRow; onDone: () => void }) {
    const form = useForm({
        employee_share: String(enrollment.employee_share),
        employer_share: String(enrollment.employer_share),
        participation_status: enrollment.participation_status,
        effective_date: enrollment.effective_date ?? '',
        end_date: enrollment.end_date ?? '',
        notes: enrollment.notes ?? '',
    });
    const { data, setData, errors, processing } = form;
    const isEarning = program.payroll_mode === 'earning';
    const defaults = defaultShares(program, employee);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({ ...d, effective_date: d.effective_date || null, end_date: d.end_date || null, notes: d.notes || null }));
        form.put(`${BENEFITS_URL}/enrollments/${enrollment.id}`, { preserveScroll: true, onSuccess: onDone });
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>Edit enrollment</DialogTitle>
                <DialogDescription>
                    {employee.name} · {program.name}
                </DialogDescription>
            </DialogHeader>

            <PayrollEffect program={program} />

            <div className="grid gap-3 sm:grid-cols-2">
                {!isEarning && (
                    <Field label="Employee share" htmlFor="ee" error={errors.employee_share} hint={`Default ${peso(defaults.employee)}`}>
                        <MoneyInput id="ee" value={data.employee_share} onChange={(v) => setData('employee_share', v)} />
                    </Field>
                )}
                <Field label={isEarning ? 'Allowance' : 'Employer share'} htmlFor="er" error={errors.employer_share} hint={`Default ${peso(defaults.employer)}`}>
                    <MoneyInput id="er" value={data.employer_share} onChange={(v) => setData('employer_share', v)} />
                </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Starts" error={errors.effective_date}>
                    <DatePicker value={data.effective_date} onChange={(v) => setData('effective_date', v)} />
                </Field>
                <Field label="Ends" error={errors.end_date}>
                    <DatePicker value={data.end_date} onChange={(v) => setData('end_date', v)} placeholder="Open-ended" />
                </Field>
                <Field label="Status" htmlFor="status" error={errors.participation_status}>
                    <Select value={data.participation_status} onValueChange={(v) => setData('participation_status', v as Enrollment['participation_status'])}>
                        <SelectTrigger id="status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="waived">Waived</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
            </div>

            <Field label="Notes" htmlFor="notes" error={errors.notes}>
                <Input id="notes" value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
            </Field>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone} disabled={processing}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing}>
                    {processing && <Loader2 className="size-4 animate-spin" />} Save changes
                </Button>
            </DialogFooter>
        </form>
    );
}

export function EndEnrollmentDialog({ enrollment, label, today, onClose }: { enrollment: Enrollment | null; label: string; today: string; onClose: () => void }) {
    const form = useForm({ end_date: today });
    React.useEffect(() => {
        if (enrollment) form.setData('end_date', today);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enrollment?.id]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.post(`${BENEFITS_URL}/enrollments/${enrollment!.id}/end`, { preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Dialog open={enrollment !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-sm">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>End enrollment</DialogTitle>
                        <DialogDescription>{label}. It stays on record and stops applying to payrolls after this date.</DialogDescription>
                    </DialogHeader>
                    <Field label="Last day covered" error={form.errors.end_date}>
                        <DatePicker value={form.data.end_date} onChange={(v) => form.setData('end_date', v)} />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={form.processing}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={form.processing || !form.data.end_date}>
                            {form.processing && <Loader2 className="size-4 animate-spin" />} End on {form.data.end_date ? fmtDate(form.data.end_date, { month: 'short', day: 'numeric', year: 'numeric' }) : '…'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Program                                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export function ProgramDialog({ open, program, categories, onClose }: { open: boolean; program: Program | null; categories: string[]; onClose: () => void }) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">{open && <ProgramForm program={program} categories={categories} onDone={onClose} />}</DialogContent>
        </Dialog>
    );
}

const MODE_CHOICES: { mode: Exclude<PayrollMode, 'statutory'>; title: string; example: string }[] = [
    { mode: 'earning', title: 'Allowance', example: 'Meal, transport, rice subsidy' },
    { mode: 'contribution', title: 'Contribution', example: 'HMO, group life, retirement plan' },
    { mode: 'none', title: 'Tracked only', example: 'Annual eyewear subsidy, gym pass' },
];

function ProgramForm({ program, categories, onDone }: { program: Program | null; categories: string[]; onDone: () => void }) {
    const form = useForm({
        name: program?.name ?? '',
        code: program?.code ?? '',
        category: program?.category && program.category !== 'statutory' ? program.category : 'allowance',
        payroll_mode: (program?.payroll_mode !== 'statutory' ? program?.payroll_mode : undefined) ?? 'earning',
        contribution_basis: program?.contribution_basis === 'percent_of_basic' ? 'percent_of_basic' : 'fixed',
        default_employee_share: String(program?.default_employee_share ?? ''),
        default_employer_share: String(program?.default_employer_share ?? ''),
        employee_rate: String(program?.employee_rate ?? ''),
        employer_rate: String(program?.employer_rate ?? ''),
        is_taxable: program?.is_taxable ?? false,
        description: program?.description ?? '',
    });
    const { data, setData, errors, processing } = form;
    const isEarning = data.payroll_mode === 'earning';
    const percent = data.contribution_basis === 'percent_of_basic';
    const codeTouched = React.useRef(Boolean(program));

    const setName = (name: string) =>
        setData((d) => ({
            ...d,
            name,
            code: codeTouched.current
                ? d.code
                : name
                      .toUpperCase()
                      .replace(/[^A-Z0-9]+/g, '_')
                      .replace(/^_|_$/g, '')
                      .slice(0, 30),
        }));

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: onDone };
        if (program) form.put(`${BENEFITS_URL}/programs/${program.id}`, opts);
        else form.post(`${BENEFITS_URL}/programs`, opts);
    };

    const rateInput = (key: 'employee_rate' | 'employer_rate', id: string) => (
        <div className="relative">
            <Input id={id} type="number" min="0" max="100" step="0.01" className="pr-24 font-mono" value={data[key]} onChange={(e) => setData(key, e.target.value)} />
            <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">% of monthly</span>
        </div>
    );

    return (
        <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{program ? `Edit ${program.name}` : 'New benefit program'}</DialogTitle>
                <DialogDescription>
                    {program ? 'Changes apply to new enrollments. Existing enrollments keep their amounts — edit them individually if needed.' : 'Define the benefit once, then enroll employees in it.'}
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                <Field label="Name" htmlFor="name" error={errors.name}>
                    <Input id="name" value={data.name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HMO — Maxicare Gold" required />
                </Field>
                <Field label="Code" htmlFor="code" error={errors.code}>
                    <Input
                        id="code"
                        value={data.code}
                        onChange={(e) => {
                            codeTouched.current = true;
                            setData('code', e.target.value.toUpperCase());
                        }}
                        className="font-mono"
                        required
                    />
                </Field>
            </div>

            <Field label="Category" htmlFor="category" error={errors.category}>
                <Select value={data.category} onValueChange={(v) => setData('category', v)}>
                    <SelectTrigger id="category">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {categories.map((c) => (
                            <SelectItem key={c} value={c}>
                                {CATEGORY_LABEL[c] ?? c}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Field>

            <div className="space-y-1.5">
                <Label>How it reaches payroll</Label>
                <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
                    {MODE_CHOICES.map((c) => {
                        const active = data.payroll_mode === c.mode;
                        return (
                            <button
                                key={c.mode}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => setData('payroll_mode', c.mode)}
                                className={cn(
                                    'rounded-lg border-2 p-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                    active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                                )}
                            >
                                <p className="text-sm font-semibold">{c.title}</p>
                                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{MODE[c.mode].effect}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground/80 italic">{c.example}</p>
                            </button>
                        );
                    })}
                </div>
                <InputError message={errors.payroll_mode} />
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{isEarning ? 'Default allowance' : 'Default monthly shares'}</p>
                    <Select value={data.contribution_basis} onValueChange={(v) => setData('contribution_basis', v as 'fixed' | 'percent_of_basic')}>
                        <SelectTrigger className="h-8 w-auto text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="fixed">Fixed amount</SelectItem>
                            <SelectItem value="percent_of_basic">% of monthly rate</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    {!isEarning && (
                        <Field label="Employee share" htmlFor="ee" error={percent ? errors.employee_rate : errors.default_employee_share}>
                            {percent ? rateInput('employee_rate', 'ee') : <MoneyInput id="ee" value={data.default_employee_share} onChange={(v) => setData('default_employee_share', v)} />}
                        </Field>
                    )}
                    <Field label={isEarning ? 'Allowance' : 'Employer share'} htmlFor="er" error={percent ? errors.employer_rate : errors.default_employer_share}>
                        {percent ? rateInput('employer_rate', 'er') : <MoneyInput id="er" value={data.default_employer_share} onChange={(v) => setData('default_employer_share', v)} />}
                    </Field>
                </div>
                {isEarning && (
                    <label className="flex items-start justify-between gap-3 text-sm">
                        <span>
                            <span className="font-medium">Taxable</span>
                            <span className="block text-[11px] text-muted-foreground">Off for de minimis benefits within BIR limits (e.g. rice subsidy up to ₱2,000/mo).</span>
                        </span>
                        <Switch checked={data.is_taxable} onCheckedChange={(v) => setData('is_taxable', v)} />
                    </label>
                )}
            </div>

            <Field label="Description / eligibility (optional)" htmlFor="desc" error={errors.description}>
                <Textarea id="desc" rows={2} value={data.description} onChange={(e) => setData('description', e.target.value)} placeholder="Who qualifies, provider, coverage…" />
            </Field>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone} disabled={processing}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing}>
                    {processing && <Loader2 className="size-4 animate-spin" />} {program ? 'Save program' : 'Create program'}
                </Button>
            </DialogFooter>
        </form>
    );
}
