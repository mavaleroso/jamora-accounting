import { useForm } from '@inertiajs/react';
import { Briefcase, CalendarClock, Camera, CreditCard, IdCard, Info, Loader2, Trash2, UserRound } from 'lucide-react';
import * as React from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
    addMonths,
    CIVIL_STATUSES,
    EMPLOYMENT_STATUSES,
    EMPLOYMENT_TYPES,
    formatDate,
    fullName,
    PAY_TYPES,
    payEquivalents,
    PRESET_DEPARTMENTS,
    PRESET_POSITIONS,
    PROBATION_MONTHS,
    restDayLabel,
    shiftRange,
    toDateInput,
    WEEKDAYS,
    type Employee,
    type Policy,
    type ShiftTemplate,
} from '../lib';
import { EmployeeAvatar } from './employee-avatar';

type FormData = {
    employee_code: string;
    firstname: string;
    middlename: string;
    lastname: string;
    gender: string;
    civil_status: string;
    email: string;
    phone: string;
    position: string;
    department: string;
    employment_type: string;
    employment_status: string;
    hire_date: string;
    regularization_date: string;
    separation_date: string;
    biometric_id: string;
    default_shift_template_id: string;
    rest_days: number[];
    is_active: boolean;
    pay_type: string;
    basic_pay: string;
    vacation_leave_credits: string;
    sick_leave_credits: string;
    bank_name: string;
    bank_account_no: string;
    sss_number: string;
    philhealth_number: string;
    pagibig_number: string;
    tin: string;
    avatar: File | null;
    remove_avatar: boolean;
};

const TABS = [
    {
        id: 'personal',
        label: 'Personal',
        icon: UserRound,
        fields: ['avatar', 'employee_code', 'firstname', 'middlename', 'lastname', 'gender', 'civil_status', 'email', 'phone'],
    },
    {
        id: 'employment',
        label: 'Employment',
        icon: Briefcase,
        fields: ['position', 'department', 'employment_type', 'employment_status', 'hire_date', 'regularization_date', 'separation_date'],
    },
    {
        id: 'schedule',
        label: 'Schedule',
        icon: CalendarClock,
        fields: ['biometric_id', 'default_shift_template_id', 'rest_days', 'is_active'],
    },
    {
        id: 'pay',
        label: 'Pay & Bank',
        icon: CreditCard,
        fields: ['pay_type', 'basic_pay', 'vacation_leave_credits', 'sick_leave_credits', 'bank_name', 'bank_account_no'],
    },
    {
        id: 'statutory',
        label: 'Gov’t IDs',
        icon: IdCard,
        fields: ['sss_number', 'philhealth_number', 'pagibig_number', 'tin'],
    },
] as const;

type TabId = (typeof TABS)[number]['id'];

const NONE = 'none';

function initialData(employee: Employee | null, policy: Policy): FormData {
    return {
        employee_code: employee?.employee_code ?? '',
        firstname: employee?.firstname ?? '',
        middlename: employee?.middlename ?? '',
        lastname: employee?.lastname ?? '',
        gender: employee?.gender ?? '',
        civil_status: employee?.civil_status ?? '',
        email: employee?.email ?? '',
        phone: employee?.phone ?? '',
        position: employee?.position ?? '',
        department: employee?.department ?? '',
        employment_type: employee?.employment_type ?? 'probationary',
        employment_status: employee?.employment_status ?? 'active',
        hire_date: toDateInput(employee?.hire_date) || (employee ? '' : new Date().toISOString().slice(0, 10)),
        regularization_date: toDateInput(employee?.regularization_date),
        separation_date: toDateInput(employee?.separation_date),
        biometric_id: employee?.biometric_id ?? '',
        default_shift_template_id: employee?.default_shift_template_id ? String(employee.default_shift_template_id) : '',
        rest_days: employee ? (employee.rest_days ?? []) : policy.defaultRestDays,
        is_active: employee?.is_active ?? true,
        pay_type: employee?.pay_type ?? 'monthly',
        basic_pay: employee ? String(employee.basic_pay ?? '') : '',
        vacation_leave_credits: employee ? String(employee.vacation_leave_credits ?? 0) : '',
        sick_leave_credits: employee ? String(employee.sick_leave_credits ?? 0) : '',
        bank_name: employee?.bank_name ?? '',
        bank_account_no: employee?.bank_account_no ?? '',
        sss_number: employee?.sss_number ?? '',
        philhealth_number: employee?.philhealth_number ?? '',
        pagibig_number: employee?.pagibig_number ?? '',
        tin: employee?.tin ?? '',
        avatar: null,
        remove_avatar: false,
    };
}

function Field({
    label,
    htmlFor,
    required,
    error,
    hint,
    className,
    children,
}: {
    label: string;
    htmlFor?: string;
    required?: boolean;
    error?: string;
    hint?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label htmlFor={htmlFor} className="text-xs font-medium">
                {label}
                {required && <span className="ml-0.5 text-destructive">*</span>}
            </Label>
            {children}
            {error ? <InputError message={error} /> : hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: Employee | null;
    shiftTemplates: ShiftTemplate[];
    departments: string[];
    positions: string[];
    policy: Policy;
};

export function EmployeeFormDialog({ open, onOpenChange, employee, ...rest }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl">
                {open && (
                    <EmployeeForm
                        key={employee?.id ?? 'new'}
                        employee={employee}
                        onDone={() => onOpenChange(false)}
                        {...rest}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}

function EmployeeForm({
    employee,
    onDone,
    shiftTemplates,
    departments,
    positions,
    policy,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
    const isEdit = employee !== null;
    const [tab, setTab] = React.useState<TabId>('personal');
    const form = useForm<FormData>(initialData(employee, policy));
    const { data, setData, errors, processing } = form;
    const err = errors as Record<string, string | undefined>;

    const tabErrorCount = (id: TabId) =>
        (TABS.find((t) => t.id === id)?.fields as readonly string[]).filter((f) =>
            Object.keys(err).some((k) => k === f || k.startsWith(`${f}.`)),
        ).length;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform(({ avatar, remove_avatar, ...d }) => ({
            ...d,
            ...(isEdit ? { _method: 'put' } : {}),
            ...(avatar ? { avatar } : {}),
            ...(remove_avatar && !avatar ? { remove_avatar: true } : {}),
            default_shift_template_id: d.default_shift_template_id || null,
            vacation_leave_credits: d.vacation_leave_credits === '' ? null : d.vacation_leave_credits,
            sick_leave_credits: d.sick_leave_credits === '' ? null : d.sick_leave_credits,
        }));
        const options = {
            preserveScroll: true,
            onSuccess: () => onDone(),
            onError: (errs: Record<string, string>) => {
                const first = TABS.find((t) =>
                    (t.fields as readonly string[]).some((f) => Object.keys(errs).some((k) => k === f || k.startsWith(`${f}.`))),
                );
                if (first) setTab(first.id);
            },
        };
        // Multipart uploads must go through POST; Laravel reads the PUT from _method.
        if (isEdit) form.post(`/libraries/employees/${employee.id}`, { ...options, forceFormData: true });
        else form.post('/libraries/employees', { ...options, forceFormData: true });
    };

    const amount = Number(data.basic_pay) || 0;
    const equivalents = payEquivalents(data.pay_type, amount, policy);
    const probationEnds = data.employment_type === 'probationary' ? addMonths(data.hire_date, PROBATION_MONTHS) : null;
    const selectedShift = shiftTemplates.find((s) => String(s.id) === data.default_shift_template_id);
    const positionOptions = Array.from(new Set([...PRESET_POSITIONS, ...positions]));
    const departmentOptions = Array.from(new Set([...PRESET_DEPARTMENTS, ...departments]));
    const tabIndex = TABS.findIndex((t) => t.id === tab);

    const fileInput = React.useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = React.useState(false);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!data.avatar) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(data.avatar);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [data.avatar]);

    // New file preview > stored photo (unless marked for removal) > animated placeholder.
    const avatarSrc = previewUrl ?? (data.remove_avatar ? null : (employee?.avatar_url ?? null));

    const pickAvatar = (file?: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            form.setError('avatar', 'Please choose an image file.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            form.setError('avatar', 'The photo must not be larger than 2 MB.');
            return;
        }
        form.clearErrors('avatar');
        setData((d) => ({ ...d, avatar: file, remove_avatar: false }));
    };

    const toggleRestDay = (day: number) =>
        setData('rest_days', data.rest_days.includes(day) ? data.rest_days.filter((d) => d !== day) : [...data.rest_days, day]);

    return (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="border-b px-6 pt-6 pb-4">
                <DialogTitle>{isEdit ? 'Edit employee' : 'Add employee'}</DialogTitle>
                <DialogDescription>
                    {isEdit
                        ? `${fullName(employee)} · ${employee.employee_code}`
                        : 'Fields marked * are required. You can complete the rest later.'}
                </DialogDescription>
            </DialogHeader>

            {/* Section tabs */}
            <div className="border-b px-6">
                <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto">
                    {TABS.map((t) => {
                        const Icon = t.icon;
                        const count = tabErrorCount(t.id);
                        const active = t.id === tab;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setTab(t.id)}
                                className={cn(
                                    'inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                                    active
                                        ? 'border-primary text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <Icon className="size-4" />
                                {t.label}
                                {count > 0 && (
                                    <span className="rounded-full bg-destructive px-1.5 text-[10px] leading-4 font-semibold text-white">
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                {tab === 'personal' && (
                    <div className="grid gap-4 sm:grid-cols-6">
                        <div className="flex flex-col gap-4 sm:col-span-6 sm:flex-row sm:items-start">
                            <div
                                className={cn(
                                    'flex flex-1 items-center gap-4 rounded-lg border border-dashed p-3 transition-colors',
                                    dragging && 'border-primary bg-primary/5',
                                )}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setDragging(true);
                                }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragging(false);
                                    pickAvatar(e.dataTransfer.files?.[0]);
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => fileInput.current?.click()}
                                    className="group relative shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                    aria-label="Upload photo"
                                >
                                    <EmployeeAvatar
                                        employee={{
                                            firstname: data.firstname,
                                            lastname: data.lastname,
                                            employee_code: employee?.employee_code ?? data.employee_code,
                                            avatar_url: employee?.avatar_url,
                                        }}
                                        src={avatarSrc}
                                        className="size-20 text-xl"
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                        <Camera className="size-5" />
                                    </span>
                                </button>
                                <div className="min-w-0 space-y-1.5">
                                    <div className="text-sm font-medium">Photo</div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                                            <Camera className="size-4" />
                                            {avatarSrc ? 'Change' : 'Upload'}
                                        </Button>
                                        {avatarSrc && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => setData((d) => ({ ...d, avatar: null, remove_avatar: true }))}
                                            >
                                                <Trash2 className="size-4" />
                                                Remove
                                            </Button>
                                        )}
                                    </div>
                                    {err.avatar ? (
                                        <InputError message={err.avatar} />
                                    ) : (
                                        <p className="text-[11px] text-muted-foreground">JPG, PNG or WebP, up to 2 MB. Drag & drop works too.</p>
                                    )}
                                </div>
                                <input
                                    ref={fileInput}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        pickAvatar(e.target.files?.[0]);
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                            <Field label="Employee code" htmlFor="employee_code" required error={err.employee_code} className="sm:w-56">
                                <Input
                                    id="employee_code"
                                    value={data.employee_code}
                                    onChange={(e) => setData('employee_code', e.target.value.toUpperCase())}
                                    placeholder="EMP-001"
                                    className="font-mono"
                                    autoFocus
                                />
                            </Field>
                        </div>
                        <Field label="First name" htmlFor="firstname" required error={err.firstname} className="sm:col-span-2">
                            <Input id="firstname" value={data.firstname} onChange={(e) => setData('firstname', e.target.value)} />
                        </Field>
                        <Field label="Middle name" htmlFor="middlename" error={err.middlename} className="sm:col-span-2">
                            <Input id="middlename" value={data.middlename} onChange={(e) => setData('middlename', e.target.value)} />
                        </Field>
                        <Field label="Last name" htmlFor="lastname" required error={err.lastname} className="sm:col-span-2">
                            <Input id="lastname" value={data.lastname} onChange={(e) => setData('lastname', e.target.value)} />
                        </Field>
                        <Field
                            label="Sex"
                            error={err.gender}
                            hint="Determines eligibility for maternity / paternity leave."
                            className="sm:col-span-3"
                        >
                            <Select value={data.gender || NONE} onValueChange={(v) => setData('gender', v === NONE ? '' : v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Not specified</SelectItem>
                                    <SelectItem value="female">Female</SelectItem>
                                    <SelectItem value="male">Male</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field
                            label="Civil status"
                            error={err.civil_status}
                            hint="Solo parents qualify for RA 11861 leave."
                            className="sm:col-span-3"
                        >
                            <Select
                                value={data.civil_status || NONE}
                                onValueChange={(v) => setData('civil_status', v === NONE ? '' : v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NONE}>Not specified</SelectItem>
                                    {CIVIL_STATUSES.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Email" htmlFor="email" error={err.email} className="sm:col-span-3">
                            <Input
                                id="email"
                                type="email"
                                value={data.email}
                                onChange={(e) => setData('email', e.target.value)}
                                placeholder="name@company.com"
                            />
                        </Field>
                        <Field label="Mobile" htmlFor="phone" error={err.phone} className="sm:col-span-3">
                            <Input
                                id="phone"
                                type="tel"
                                value={data.phone}
                                onChange={(e) => setData('phone', e.target.value)}
                                placeholder="+63 917 123 4567"
                            />
                        </Field>
                    </div>
                )}

                {tab === 'employment' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Position" htmlFor="position" error={err.position} hint="Pick a suggestion or type a new title.">
                            <Input
                                id="position"
                                list="employee-positions"
                                value={data.position}
                                onChange={(e) => setData('position', e.target.value)}
                                placeholder="e.g. Sales Associate & Dispenser"
                            />
                            <datalist id="employee-positions">
                                {positionOptions.map((p) => (
                                    <option key={p} value={p} />
                                ))}
                            </datalist>
                        </Field>
                        <Field label="Department" htmlFor="department" error={err.department}>
                            <Input
                                id="department"
                                list="employee-departments"
                                value={data.department}
                                onChange={(e) => setData('department', e.target.value)}
                                placeholder="e.g. Optical Sales & Lab"
                            />
                            <datalist id="employee-departments">
                                {departmentOptions.map((d) => (
                                    <option key={d} value={d} />
                                ))}
                            </datalist>
                        </Field>
                        <Field label="Employment type" required error={err.employment_type}>
                            <Select value={data.employment_type} onValueChange={(v) => setData('employment_type', v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EMPLOYMENT_TYPES.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Employment status" required error={err.employment_status}>
                            <Select
                                value={data.employment_status}
                                onValueChange={(v) => {
                                    setData((d) => ({ ...d, employment_status: v, is_active: v === 'active' ? true : d.is_active }));
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {EMPLOYMENT_STATUSES.map((o) => (
                                        <SelectItem key={o.value} value={o.value}>
                                            {o.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Hire date" htmlFor="hire_date" error={err.hire_date}>
                            <Input id="hire_date" type="date" value={data.hire_date} onChange={(e) => setData('hire_date', e.target.value)} />
                        </Field>
                        <Field
                            label="Regularization date"
                            htmlFor="regularization_date"
                            error={err.regularization_date}
                            hint={
                                probationEnds ? (
                                    <>
                                        Probation ends {formatDate(probationEnds)} (max {PROBATION_MONTHS} months, Art. 296).{' '}
                                        {!data.regularization_date && (
                                            <button
                                                type="button"
                                                className="font-medium text-primary underline-offset-2 hover:underline"
                                                onClick={() => setData('regularization_date', probationEnds)}
                                            >
                                                Use this date
                                            </button>
                                        )}
                                    </>
                                ) : undefined
                            }
                        >
                            <Input
                                id="regularization_date"
                                type="date"
                                value={data.regularization_date}
                                min={data.hire_date || undefined}
                                onChange={(e) => setData('regularization_date', e.target.value)}
                            />
                        </Field>
                        {data.employment_status === 'separated' && (
                            <Field
                                label="Separation date"
                                htmlFor="separation_date"
                                required
                                error={err.separation_date}
                                hint="Excluded from attendance and payroll after this date."
                            >
                                <Input
                                    id="separation_date"
                                    type="date"
                                    value={data.separation_date}
                                    min={data.hire_date || undefined}
                                    onChange={(e) => setData('separation_date', e.target.value)}
                                />
                            </Field>
                        )}
                    </div>
                )}

                {tab === 'schedule' && (
                    <div className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                label="Biometric ID"
                                htmlFor="biometric_id"
                                error={err.biometric_id}
                                hint="Must match the user ID enrolled on the time clock."
                            >
                                <Input
                                    id="biometric_id"
                                    value={data.biometric_id}
                                    onChange={(e) => setData('biometric_id', e.target.value)}
                                    placeholder="e.g. 101"
                                    className="font-mono"
                                />
                            </Field>
                            <Field
                                label="Default shift"
                                error={err.default_shift_template_id}
                                hint={
                                    selectedShift
                                        ? `${shiftRange(selectedShift)} · ${selectedShift.break_minutes ?? 60} min break`
                                        : 'Used when no roster is published for the day.'
                                }
                            >
                                <Select
                                    value={data.default_shift_template_id || NONE}
                                    onValueChange={(v) => setData('default_shift_template_id', v === NONE ? '' : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE}>Company default shift</SelectItem>
                                        {shiftTemplates.map((s) => (
                                            <SelectItem key={s.id} value={String(s.id)}>
                                                {s.name} ({shiftRange(s)})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </Field>
                        </div>

                        <Field
                            label="Rest days"
                            error={err.rest_days}
                            hint={
                                data.rest_days.length === 0
                                    ? `None selected — company default applies (${restDayLabel(null, policy.defaultRestDays)}).`
                                    : `Off every ${restDayLabel(data.rest_days, policy.defaultRestDays)}. Work on these days is paid at rest-day premium.`
                            }
                        >
                            <div className="flex flex-wrap gap-1.5">
                                {WEEKDAYS.map((label, day) => {
                                    const on = data.rest_days.includes(day);
                                    return (
                                        <button
                                            key={label}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => toggleRestDay(day)}
                                            className={cn(
                                                'h-9 w-12 rounded-md border text-sm font-medium transition-colors',
                                                on
                                                    ? 'border-primary bg-primary text-primary-foreground'
                                                    : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                                            )}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </Field>

                        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                            <div>
                                <Label htmlFor="is_active" className="text-sm font-medium">
                                    Include in scheduling & payroll
                                </Label>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {data.employment_status === 'separated'
                                        ? 'Separated employees are always excluded.'
                                        : 'Turn off to keep the record without rostering or paying this employee.'}
                                </p>
                            </div>
                            <Switch
                                id="is_active"
                                checked={data.employment_status !== 'separated' && data.is_active}
                                disabled={data.employment_status === 'separated'}
                                onCheckedChange={(v) => setData('is_active', v)}
                            />
                        </div>
                    </div>
                )}

                {tab === 'pay' && (
                    <div className="space-y-5">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Pay basis" required error={err.pay_type}>
                                <div className="grid grid-cols-3 gap-1 rounded-md border bg-muted p-1">
                                    {PAY_TYPES.map((p) => (
                                        <button
                                            key={p.value}
                                            type="button"
                                            aria-pressed={data.pay_type === p.value}
                                            onClick={() => setData('pay_type', p.value)}
                                            className={cn(
                                                'rounded px-2 py-1.5 text-sm font-medium transition-colors',
                                                data.pay_type === p.value
                                                    ? 'bg-background text-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                            <Field label={`Basic rate (PHP ${PAY_TYPES.find((p) => p.value === data.pay_type)?.unit})`} htmlFor="basic_pay" required error={err.basic_pay}>
                                <div className="relative">
                                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">₱</span>
                                    <Input
                                        id="basic_pay"
                                        type="number"
                                        inputMode="decimal"
                                        min="0"
                                        step="0.01"
                                        value={data.basic_pay}
                                        onChange={(e) => setData('basic_pay', e.target.value)}
                                        placeholder="0.00"
                                        className="pl-7 text-right font-mono"
                                    />
                                </div>
                            </Field>
                        </div>

                        {amount > 0 && (
                            <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-xs">
                                <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                <div className="grid flex-1 gap-x-6 gap-y-1 sm:grid-cols-3">
                                    <div>
                                        <div className="text-muted-foreground">Daily rate</div>
                                        <div className="font-mono font-semibold">{formatPhpCurrency(equivalents.daily)}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground">Hourly rate</div>
                                        <div className="font-mono font-semibold">{formatPhpCurrency(equivalents.hourly)}</div>
                                    </div>
                                    <div>
                                        <div className="text-muted-foreground">Monthly equivalent</div>
                                        <div className="font-mono font-semibold">{formatPhpCurrency(equivalents.monthly)}</div>
                                    </div>
                                    <div className="text-[11px] text-muted-foreground sm:col-span-3">
                                        Based on {policy.daysPerYear} working days/year and {policy.hoursPerDay} hours/day.
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                label="Opening VL credits (days)"
                                htmlFor="vacation_leave_credits"
                                error={err.vacation_leave_credits}
                                hint="Seeds this year’s leave balance. Leave blank to use the policy entitlement."
                            >
                                <Input
                                    id="vacation_leave_credits"
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={data.vacation_leave_credits}
                                    onChange={(e) => setData('vacation_leave_credits', e.target.value)}
                                />
                            </Field>
                            <Field label="Opening SL credits (days)" htmlFor="sick_leave_credits" error={err.sick_leave_credits}>
                                <Input
                                    id="sick_leave_credits"
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={data.sick_leave_credits}
                                    onChange={(e) => setData('sick_leave_credits', e.target.value)}
                                />
                            </Field>
                            <Field label="Payroll bank" htmlFor="bank_name" error={err.bank_name}>
                                <Input
                                    id="bank_name"
                                    list="employee-banks"
                                    value={data.bank_name}
                                    onChange={(e) => setData('bank_name', e.target.value)}
                                    placeholder="e.g. BDO Unibank"
                                />
                                <datalist id="employee-banks">
                                    {['BDO Unibank', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'Security Bank', 'GCash', 'Maya'].map((b) => (
                                        <option key={b} value={b} />
                                    ))}
                                </datalist>
                            </Field>
                            <Field label="Account number" htmlFor="bank_account_no" error={err.bank_account_no}>
                                <Input
                                    id="bank_account_no"
                                    value={data.bank_account_no}
                                    onChange={(e) => setData('bank_account_no', e.target.value)}
                                    placeholder="0012-3456-7890"
                                    className="font-mono"
                                />
                            </Field>
                        </div>
                    </div>
                )}

                {tab === 'statutory' && (
                    <div className="space-y-4">
                        <p className="text-xs text-muted-foreground">
                            Required for SSS, PhilHealth and Pag-IBIG remittances and BIR 2316 / alphalist filing.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="SSS number" htmlFor="sss_number" error={err.sss_number} hint="Format: 00-0000000-0">
                                <Input
                                    id="sss_number"
                                    value={data.sss_number}
                                    onChange={(e) => setData('sss_number', e.target.value)}
                                    placeholder="00-0000000-0"
                                    className="font-mono"
                                />
                            </Field>
                            <Field label="PhilHealth number (PIN)" htmlFor="philhealth_number" error={err.philhealth_number} hint="Format: 00-000000000-0">
                                <Input
                                    id="philhealth_number"
                                    value={data.philhealth_number}
                                    onChange={(e) => setData('philhealth_number', e.target.value)}
                                    placeholder="00-000000000-0"
                                    className="font-mono"
                                />
                            </Field>
                            <Field label="Pag-IBIG MID number" htmlFor="pagibig_number" error={err.pagibig_number} hint="Format: 0000-0000-0000">
                                <Input
                                    id="pagibig_number"
                                    value={data.pagibig_number}
                                    onChange={(e) => setData('pagibig_number', e.target.value)}
                                    placeholder="0000-0000-0000"
                                    className="font-mono"
                                />
                            </Field>
                            <Field label="TIN" htmlFor="tin" error={err.tin} hint="Format: 000-000-000-000">
                                <Input
                                    id="tin"
                                    value={data.tin}
                                    onChange={(e) => setData('tin', e.target.value)}
                                    placeholder="000-000-000-000"
                                    className="font-mono"
                                />
                            </Field>
                        </div>
                    </div>
                )}
            </div>

            <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between">
                <div className="hidden gap-1 sm:flex">
                    <Button type="button" variant="ghost" size="sm" disabled={tabIndex === 0} onClick={() => setTab(TABS[tabIndex - 1].id)}>
                        Back
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={tabIndex === TABS.length - 1}
                        onClick={() => setTab(TABS[tabIndex + 1].id)}
                    >
                        Next
                    </Button>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                    <Button type="button" variant="outline" onClick={onDone} disabled={processing}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={processing}>
                        {processing && <Loader2 className="size-4 animate-spin" />}
                        {isEdit ? 'Save changes' : 'Create employee'}
                    </Button>
                </div>
            </DialogFooter>
        </form>
    );
}
