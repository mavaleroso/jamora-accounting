import { useConfirm } from '@/components/confirm-dialog';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TextCombobox } from '@/components/ui/text-combobox';
import { formatPhpCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import { useForm } from '@inertiajs/react';
import { Briefcase, Camera, Copy, CreditCard, Info, KeyRound, Loader2, Palmtree, RefreshCw, Trash2, UserRound } from 'lucide-react';
import * as React from 'react';
import { generatePassword } from '../../../admin/users/lib';
import {
    addMonths,
    age,
    CIVIL_STATUSES,
    CONTRIBUTION_MODES,
    CONTRIBUTIONS,
    EMERGENCY_RELATIONSHIPS,
    EMPLOYMENT_STATUSES,
    EMPLOYMENT_TYPES,
    formatDate,
    fullName,
    MIN_WORKING_AGE,
    PAY_TYPES,
    payEquivalents,
    PRESET_POSITIONS,
    PROBATION_MONTHS,
    restDayLabel,
    shiftRange,
    statutoryEstimate,
    toDateInput,
    WEEKDAYS,
    type Company,
    type ContributionAgency,
    type ContributionMode,
    type Employee,
    type LeaveTypeOption,
    type LinkableUser,
    type Policy,
    type ShiftTemplate,
} from '../lib';
import { EmployeeAvatar } from './employee-avatar';

type FormData = {
    /** The company (employer); chosen when the employee is added and fixed after. */
    entity_id: string;
    employee_code: string;
    firstname: string;
    middlename: string;
    lastname: string;
    gender: string;
    civil_status: string;
    birth_date: string;
    dependents: string;
    email: string;
    phone: string;
    address: string;
    emergency_contact_name: string;
    emergency_contact_relationship: string;
    emergency_contact_phone: string;
    position: string;
    employment_type: string;
    employment_status: string;
    hire_date: string;
    regularization_date: string;
    separation_date: string;
    default_shift_template_id: string;
    rest_days: number[];
    leave_type_ids: number[];
    is_active: boolean;
    pay_type: string;
    basic_pay: string;
    vacation_leave_credits: string;
    sick_leave_credits: string;
    bank_name: string;
    bank_account_name: string;
    bank_account_no: string;
    sss_number: string;
    philhealth_number: string;
    pagibig_number: string;
    tin: string;
    avatar: File | null;
    remove_avatar: boolean;
    /** SSS / PhilHealth / Pag-IBIG deduction, per agency. Amounts are monthly, as typed. */
    contributions: Record<ContributionAgency, { mode: ContributionMode }>;
    /** Login: required when adding; offered when editing a record that has none. */
    account: 'new' | 'existing' | 'none';
    username: string;
    password: string;
    link_user_id: string;
};

const TABS = [
    {
        id: 'profile',
        label: 'Profile',
        description: 'Photo, name, contact and emergency contact',
        icon: UserRound,
        fields: [
            'entity_id',
            'avatar',
            'employee_code',
            'firstname',
            'middlename',
            'lastname',
            'gender',
            'civil_status',
            'birth_date',
            'dependents',
            'email',
            'phone',
            'address',
            'emergency_contact_name',
            'emergency_contact_relationship',
            'emergency_contact_phone',
        ],
    },
    {
        id: 'employment',
        label: 'Employment & schedule',
        description: 'Role, status, shift and rest days',
        icon: Briefcase,
        fields: [
            'position',
            'employment_type',
            'employment_status',
            'hire_date',
            'regularization_date',
            'separation_date',
            'default_shift_template_id',
            'rest_days',
            'is_active',
        ],
    },
    {
        id: 'pay',
        label: 'Pay & contributions',
        description: 'Rate, bank, SSS, PhilHealth, Pag-IBIG',
        icon: CreditCard,
        fields: [
            'pay_type',
            'basic_pay',
            'bank_name',
            'bank_account_name',
            'bank_account_no',
            'sss_number',
            'philhealth_number',
            'pagibig_number',
            'tin',
            'contribution_settings',
        ],
    },
    {
        id: 'leave',
        label: 'Leave',
        description: 'Leave types and opening credits',
        icon: Palmtree,
        fields: ['leave_type_ids', 'leave_type_scope', 'vacation_leave_credits', 'sick_leave_credits'],
    },
    {
        id: 'login',
        label: 'Login',
        description: 'Employee portal sign-in',
        icon: KeyRound,
        fields: ['account', 'username', 'password', 'link_user_id'],
    },
] as const;

type TabId = (typeof TABS)[number]['id'];

const NONE = 'none';

const PAYROLL_BANKS = ['BDO Unibank', 'BPI', 'Metrobank', 'UnionBank', 'Landbank', 'Security Bank', 'China Bank', 'RCBC', 'PNB', 'GCash', 'Maya'];

function initialData(employee: Employee | null, policy: Policy, leaveTypes: LeaveTypeOption[], currentCompanyId: number | null): FormData {
    return {
        entity_id: String(employee?.entity_id ?? currentCompanyId ?? ''),
        employee_code: employee?.employee_code ?? '',
        firstname: employee?.firstname ?? '',
        middlename: employee?.middlename ?? '',
        lastname: employee?.lastname ?? '',
        gender: employee?.gender ?? '',
        civil_status: employee?.civil_status ?? '',
        birth_date: toDateInput(employee?.birth_date),
        dependents: employee?.dependents != null ? String(employee.dependents) : '',
        email: employee?.email ?? '',
        phone: employee?.phone ?? '',
        address: employee?.address ?? '',
        emergency_contact_name: employee?.emergency_contact_name ?? '',
        emergency_contact_relationship: employee?.emergency_contact_relationship ?? '',
        emergency_contact_phone: employee?.emergency_contact_phone ?? '',
        position: employee?.position ?? '',
        employment_type: employee?.employment_type ?? 'probationary',
        employment_status: employee?.employment_status ?? 'active',
        hire_date: toDateInput(employee?.hire_date) || (employee ? '' : new Date().toISOString().slice(0, 10)),
        regularization_date: toDateInput(employee?.regularization_date),
        separation_date: toDateInput(employee?.separation_date),
        default_shift_template_id: employee?.default_shift_template_id ? String(employee.default_shift_template_id) : '',
        rest_days: employee ? (employee.rest_days ?? []) : policy.defaultRestDays,
        // Default: every leave type selected.
        leave_type_ids: employee?.leave_type_ids ?? leaveTypes.map((t) => t.id),
        is_active: employee?.is_active ?? true,
        pay_type: employee?.pay_type ?? 'monthly',
        basic_pay: employee ? String(employee.basic_pay ?? '') : '',
        vacation_leave_credits: employee ? String(employee.vacation_leave_credits ?? 0) : '',
        sick_leave_credits: employee ? String(employee.sick_leave_credits ?? 0) : '',
        bank_name: employee?.bank_name ?? '',
        bank_account_name: employee?.bank_account_name ?? '',
        bank_account_no: employee?.bank_account_no ?? '',
        sss_number: employee?.sss_number ?? '',
        philhealth_number: employee?.philhealth_number ?? '',
        pagibig_number: employee?.pagibig_number ?? '',
        tin: employee?.tin ?? '',
        avatar: null,
        remove_avatar: false,
        contributions: Object.fromEntries(
            CONTRIBUTIONS.map(({ key }) => {
                // Anything other than "not deducted" (e.g. an older stored setting) is automatic.
                return [key, { mode: employee?.contribution_settings?.[key]?.mode === 'none' ? 'none' : 'auto' }];
            }),
        ) as FormData['contributions'],
        account: employee ? 'none' : 'new',
        username: '',
        password: employee ? '' : generatePassword(),
        link_user_id: '',
    };
}

/** "Maria Clara Santos" -> "maria.santos" */
function suggestUsername(first: string, last: string): string {
    const clean = (v: string) =>
        v
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .split(/\s+/)[0]
            ?.replace(/[^a-z0-9]/g, '') ?? '';
    return [clean(first), clean(last)].filter(Boolean).join('.');
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
                {required && <span className="text-destructive ml-0.5">*</span>}
            </Label>
            {children}
            {error ? <InputError message={error} /> : hint ? <p className="text-muted-foreground text-[11px]">{hint}</p> : null}
        </div>
    );
}

/** A titled group of fields inside a section. */
function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
            </div>
            {children}
        </section>
    );
}

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: Employee | null;
    shiftTemplates: ShiftTemplate[];
    positions: string[];
    policy: Policy;
    leaveTypes: LeaveTypeOption[];
    linkableUsers?: LinkableUser[];
    companies?: Company[];
    /** Where a new employee goes unless another company is picked. */
    currentCompanyId?: number | null;
};

export function EmployeeFormDialog({ open, onOpenChange, employee, ...rest }: Props) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-5xl md:h-[min(90vh,860px)]">
                {open && <EmployeeForm key={employee?.id ?? 'new'} employee={employee} onDone={() => onOpenChange(false)} {...rest} />}
            </DialogContent>
        </Dialog>
    );
}

function EmployeeForm({
    employee,
    onDone,
    shiftTemplates,
    positions,
    policy,
    leaveTypes,
    linkableUsers = [],
    companies = [],
    currentCompanyId = null,
}: Omit<Props, 'open' | 'onOpenChange'> & { onDone: () => void }) {
    const isEdit = employee !== null;
    const linked = employee?.user ?? null;
    const usernameTouched = React.useRef(false);
    const [copied, setCopied] = React.useState(false);
    const confirm = useConfirm();
    const [tab, setTab] = React.useState<TabId>('profile');
    const form = useForm<FormData>(initialData(employee, policy, leaveTypes, currentCompanyId));
    const { data, setData, errors, processing } = form;
    const err = errors as Record<string, string | undefined>;

    const tabErrorCount = (id: TabId) =>
        (TABS.find((t) => t.id === id)?.fields as readonly string[]).filter((f) => Object.keys(err).some((k) => k === f || k.startsWith(`${f}.`)))
            .length;

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isEdit) {
            const name = [data.firstname, data.lastname].filter(Boolean).join(' ') || 'this employee';
            const linkTo = linkableUsers.find((u) => String(u.id) === data.link_user_id);
            const login =
                data.account === 'existing'
                    ? `It is linked to ${linkTo?.name ?? 'the selected user'}'s login.`
                    : `They can sign in as ${data.username || 'the new username'}.`;
            const ok = await confirm({
                title: `Add ${name}?`,
                description: `A new employee record${data.employee_code ? ` (${data.employee_code})` : ''} is created in ${company?.name ?? 'the selected company'} and included in its attendance and payroll from their start date. ${login}`,
                confirmLabel: 'Add employee',
            });
            if (!ok) return;
        }
        // All selected is saved as "all" so leave types added later are enabled automatically.
        const allLeave = leaveTypes.every((t) => data.leave_type_ids.includes(t.id));
        form.transform(({ avatar, remove_avatar, leave_type_ids, contributions, ...d }) => ({
            ...d,
            contribution_settings: contributions,
            leave_type_scope: allLeave ? 'all' : 'custom',
            leave_type_ids: allLeave ? [] : leave_type_ids,
            ...(isEdit ? { _method: 'put' } : {}),
            ...(avatar ? { avatar } : {}),
            ...(remove_avatar && !avatar ? { remove_avatar: true } : {}),
            default_shift_template_id: d.default_shift_template_id || null,
            dependents: d.dependents === '' ? null : d.dependents,
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
    const company = companies.find((c) => String(c.id) === data.entity_id) ?? employee?.entity ?? null;
    // Shift templates and logins are per company: offer the chosen company's.
    const companyShifts = shiftTemplates.filter((s) => s.entity_id == null || String(s.entity_id) === data.entity_id);
    const selectedShift = companyShifts.find((s) => String(s.id) === data.default_shift_template_id);
    const linkable = linkableUsers.filter((u) => !(u.employee_entity_ids ?? []).includes(Number(data.entity_id)));
    const positionOptions = Array.from(new Set([...PRESET_POSITIONS, ...positions]));
    const tabIndex = TABS.findIndex((t) => t.id === tab);
    const years = age(data.birth_date);
    const latestBirthDate = addMonths(new Date().toISOString().slice(0, 10), -12 * MIN_WORKING_AGE) ?? undefined;

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

    React.useEffect(() => {
        if (data.account === 'new' && !usernameTouched.current) {
            setData('username', suggestUsername(data.firstname, data.lastname));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.firstname, data.lastname, data.account]);

    const copyPassword = async () => {
        try {
            await navigator.clipboard.writeText(data.password);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard can be blocked; the password is visible to copy by hand.
        }
    };

    const statutory = policy.statutory ? statutoryEstimate(equivalents.monthly, policy.statutory) : null;
    const setContribution = (key: ContributionAgency, mode: ContributionMode) => setData('contributions', { ...data.contributions, [key]: { mode } });

    const leaveIds = data.leave_type_ids;
    const allLeaveSelected = leaveTypes.every((t) => leaveIds.includes(t.id));
    const toggleLeaveType = (id: number) => setData('leave_type_ids', leaveIds.includes(id) ? leaveIds.filter((x) => x !== id) : [...leaveIds, id]);

    const toggleRestDay = (day: number) =>
        setData('rest_days', data.rest_days.includes(day) ? data.rest_days.filter((d) => d !== day) : [...data.rest_days, day]);

    return (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="border-b px-6 pt-6 pb-4">
                <DialogTitle>{isEdit ? 'Edit employee' : 'Add employee'}</DialogTitle>
                <DialogDescription>
                    {isEdit
                        ? [fullName(employee), employee.employee_code, employee.entity?.name].filter(Boolean).join(' · ')
                        : 'Fields marked * are required. You can complete the rest later.'}
                </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                {/* Sections: a side rail on wide screens, scrolling tabs on phones */}
                <nav
                    role="tablist"
                    aria-label="Employee sections"
                    className="md:bg-muted/30 flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-2 md:w-64 md:flex-col md:overflow-x-visible md:overflow-y-auto md:border-r md:border-b-0 md:px-3 md:py-4"
                >
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
                                    'flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors md:items-start',
                                    active
                                        ? 'bg-background text-foreground md:ring-border font-medium shadow-sm md:ring-1'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                )}
                            >
                                <Icon className={cn('size-4 shrink-0 md:mt-0.5', active && 'text-primary')} />
                                <span className="min-w-0 flex-1">
                                    <span className="block whitespace-nowrap">{t.label}</span>
                                    <span className="text-muted-foreground hidden text-[11px] font-normal md:block">{t.description}</span>
                                </span>
                                {count > 0 && (
                                    <span className="bg-destructive rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white">{count}</span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                    {tab === 'profile' && (
                        <div className="space-y-8">
                            <FormSection title="Company" description="The employer. The employee is rostered, given leave and paid in this company.">
                                <Field
                                    label="Company"
                                    required
                                    error={err.entity_id}
                                    hint={isEdit ? 'Can’t be changed once the employee is created.' : undefined}
                                    className="sm:w-80"
                                >
                                    <Select
                                        value={data.entity_id}
                                        disabled={isEdit}
                                        onValueChange={(v) =>
                                            setData((d) => ({ ...d, entity_id: v, default_shift_template_id: '', link_user_id: '' }))
                                        }
                                    >
                                        <SelectTrigger aria-label="Company">
                                            <SelectValue placeholder="Choose a company" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {companies.map((c) => (
                                                <SelectItem key={c.id} value={String(c.id)}>
                                                    {c.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </FormSection>
                            <FormSection
                                title="Photo & employee code"
                                description="The code identifies the employee on payslips, reports and attendance imports."
                            >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
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
                                            className="group focus-visible:ring-ring relative shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none"
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
                                                <p className="text-muted-foreground text-[11px]">
                                                    JPG, PNG or WebP, up to 2 MB. Drag & drop works too.
                                                </p>
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
                            </FormSection>
                            <FormSection title="Name & personal details">
                                <div className="grid gap-4 sm:grid-cols-6">
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
                                    <Field label="Civil status" error={err.civil_status} className="sm:col-span-3">
                                        <Select value={data.civil_status || NONE} onValueChange={(v) => setData('civil_status', v === NONE ? '' : v)}>
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
                                    <Field
                                        label="Date of birth"
                                        htmlFor="birth_date"
                                        error={err.birth_date}
                                        hint={years !== null ? `${years} years old` : undefined}
                                        className="sm:col-span-3"
                                    >
                                        <Input
                                            id="birth_date"
                                            type="date"
                                            value={data.birth_date}
                                            max={latestBirthDate}
                                            onChange={(e) => setData('birth_date', e.target.value)}
                                        />
                                    </Field>
                                    <Field
                                        label="Number of dependents"
                                        htmlFor="dependents"
                                        error={err.dependents}
                                        hint="For HR records. Dependents no longer change withholding tax (TRAIN law)."
                                        className="sm:col-span-3"
                                    >
                                        <Input
                                            id="dependents"
                                            type="number"
                                            inputMode="numeric"
                                            min="0"
                                            max="30"
                                            step="1"
                                            value={data.dependents}
                                            onChange={(e) => setData('dependents', e.target.value)}
                                        />
                                    </Field>
                                </div>
                            </FormSection>
                            <FormSection title="Contact" description="A new login uses this email for password resets.">
                                <div className="grid gap-4 sm:grid-cols-6">
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
                                    <Field label="Home address" htmlFor="address" error={err.address} className="sm:col-span-6">
                                        <Input
                                            id="address"
                                            value={data.address}
                                            onChange={(e) => setData('address', e.target.value)}
                                            placeholder="House no., street, barangay, city"
                                        />
                                    </Field>
                                </div>
                            </FormSection>
                            <FormSection title="Emergency contact" description="Who to call if something happens to the employee at work.">
                                <div className="grid gap-4 sm:grid-cols-6">
                                    <Field label="Name" htmlFor="emergency_contact_name" error={err.emergency_contact_name} className="sm:col-span-2">
                                        <Input
                                            id="emergency_contact_name"
                                            value={data.emergency_contact_name}
                                            onChange={(e) => setData('emergency_contact_name', e.target.value)}
                                        />
                                    </Field>
                                    <Field
                                        label="Relationship"
                                        htmlFor="emergency_contact_relationship"
                                        error={err.emergency_contact_relationship}
                                        className="sm:col-span-2"
                                    >
                                        <TextCombobox
                                            id="emergency_contact_relationship"
                                            value={data.emergency_contact_relationship}
                                            onValueChange={(v) => setData('emergency_contact_relationship', v)}
                                            options={EMERGENCY_RELATIONSHIPS}
                                            placeholder="Select or type"
                                            aria-invalid={!!err.emergency_contact_relationship}
                                        />
                                    </Field>
                                    <Field
                                        label="Mobile"
                                        htmlFor="emergency_contact_phone"
                                        error={err.emergency_contact_phone}
                                        className="sm:col-span-2"
                                    >
                                        <Input
                                            id="emergency_contact_phone"
                                            type="tel"
                                            value={data.emergency_contact_phone}
                                            onChange={(e) => setData('emergency_contact_phone', e.target.value)}
                                            placeholder="+63 917 123 4567"
                                        />
                                    </Field>
                                </div>
                            </FormSection>
                        </div>
                    )}

                    {tab === 'employment' && (
                        <div className="space-y-8">
                            <FormSection title="Position & status" description="Probationary employees can be regularized after at most six months.">
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <Field label="Position" htmlFor="position" error={err.position} hint="Pick one or type a new title.">
                                        <TextCombobox
                                            id="position"
                                            value={data.position}
                                            onValueChange={(v) => setData('position', v)}
                                            options={positionOptions}
                                            placeholder="Select a position"
                                            aria-invalid={!!err.position}
                                        />
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
                                        <Input
                                            id="hire_date"
                                            type="date"
                                            value={data.hire_date}
                                            onChange={(e) => setData('hire_date', e.target.value)}
                                        />
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
                                                            className="text-primary font-medium underline-offset-2 hover:underline"
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
                            </FormSection>
                            <FormSection title="Schedule" description="Used by attendance and the roster.">
                                <div className="space-y-5">
                                    <div className="grid gap-4 sm:grid-cols-2">
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
                                                    {companyShifts.map((s) => (
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
                                            <p className="text-muted-foreground mt-0.5 text-xs">
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
                            </FormSection>
                        </div>
                    )}

                    {tab === 'pay' && (
                        <div className="space-y-8">
                            <FormSection title="Basic pay">
                                <div className="space-y-5">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label="Pay basis" required error={err.pay_type}>
                                            <div className="bg-muted grid grid-cols-3 gap-1 rounded-md border p-1">
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
                                        <Field
                                            label={`Basic rate (PHP ${PAY_TYPES.find((p) => p.value === data.pay_type)?.unit})`}
                                            htmlFor="basic_pay"
                                            required
                                            error={err.basic_pay}
                                        >
                                            <div className="relative">
                                                <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                                                    ₱
                                                </span>
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
                                        <div className="bg-muted/40 flex items-start gap-2 rounded-lg border p-3 text-xs">
                                            <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
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
                                                <div className="text-muted-foreground text-[11px] sm:col-span-3">
                                                    Based on {policy.daysPerYear} working days/year and {policy.hoursPerDay} hours/day.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </FormSection>
                            <FormSection title="Payroll bank" description="Where net pay is credited. Leave blank for cash or cheque.">
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <Field label="Payroll bank" htmlFor="bank_name" error={err.bank_name}>
                                        <TextCombobox
                                            id="bank_name"
                                            value={data.bank_name}
                                            onValueChange={(v) => setData('bank_name', v)}
                                            options={PAYROLL_BANKS}
                                            placeholder="Cash or cheque (no bank)"
                                            aria-invalid={!!err.bank_name}
                                        />
                                    </Field>
                                    <Field
                                        label="Account name"
                                        htmlFor="bank_account_name"
                                        error={err.bank_account_name}
                                        hint="As the bank has it, e.g. Juan S. Dela Cruz."
                                    >
                                        <Input
                                            id="bank_account_name"
                                            value={data.bank_account_name}
                                            onChange={(e) => setData('bank_account_name', e.target.value)}
                                        />
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
                            </FormSection>
                            <FormSection
                                title="Government contributions"
                                description="Deducted from pay every month, computed automatically from the contribution tables on the salary. Payroll spreads each month's amount over the month's payrolls."
                            >
                                <div className="space-y-3">
                                    {CONTRIBUTIONS.map((c) => {
                                        const setting = data.contributions[c.key];
                                        const table = statutory?.[c.key];
                                        const ready = !!table && amount > 0;
                                        return (
                                            <div key={c.key} className="space-y-3 rounded-lg border p-4">
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div>
                                                        <p className="text-sm font-semibold">{c.label}</p>
                                                        <p className="text-muted-foreground text-[11px]">{c.agency}</p>
                                                    </div>
                                                    <div
                                                        role="radiogroup"
                                                        aria-label={`${c.label} deduction`}
                                                        className="bg-muted grid grid-cols-2 gap-1 rounded-md border p-1 sm:w-64"
                                                    >
                                                        {CONTRIBUTION_MODES.map((m) => (
                                                            <button
                                                                key={m.value}
                                                                type="button"
                                                                role="radio"
                                                                aria-checked={setting.mode === m.value}
                                                                onClick={() => setContribution(c.key, m.value)}
                                                                className={cn(
                                                                    'rounded px-2 py-1.5 text-xs font-medium transition-colors',
                                                                    setting.mode === m.value
                                                                        ? 'bg-background text-foreground shadow-sm'
                                                                        : 'text-muted-foreground hover:text-foreground',
                                                                )}
                                                            >
                                                                {m.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="grid gap-4 sm:grid-cols-3">
                                                    <Field label={c.idLabel} htmlFor={c.idField} error={err[c.idField]}>
                                                        <Input
                                                            id={c.idField}
                                                            value={data[c.idField]}
                                                            onChange={(e) => setData(c.idField, e.target.value)}
                                                            placeholder={c.idPlaceholder}
                                                            className="font-mono"
                                                        />
                                                    </Field>

                                                    {setting.mode === 'auto' ? (
                                                        <div className="space-y-1.5 sm:col-span-2">
                                                            <p className="text-xs font-medium">Monthly deduction</p>
                                                            <div className="bg-muted/40 flex items-baseline justify-between gap-3 rounded-md border px-3 py-2">
                                                                <span className="font-mono text-sm font-semibold">
                                                                    {ready ? formatPhpCurrency(table.employee) : '—'}
                                                                </span>
                                                                <span className="text-muted-foreground text-[11px]">Computed automatically</span>
                                                            </div>
                                                            <p className="text-muted-foreground text-[11px]">
                                                                {ready ? (
                                                                    <>
                                                                        From the table on {formatPhpCurrency(equivalents.monthly)} a month
                                                                        {c.key === 'sss' &&
                                                                            statutory &&
                                                                            ` (salary credit ${formatPhpCurrency(statutory.sss.msc)})`}
                                                                        . The company adds {formatPhpCurrency(table.employer)}
                                                                        {c.key === 'sss' &&
                                                                            statutory &&
                                                                            ` + EC ${formatPhpCurrency(statutory.sss.ec)}`}{' '}
                                                                        of its own. Daily and hourly pay use actual earnings.
                                                                    </>
                                                                ) : (
                                                                    'Enter the basic rate under Basic pay to see the amount.'
                                                                )}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <p
                                                            className={cn(
                                                                'rounded-md border px-3 py-2.5 text-xs sm:col-span-2',
                                                                'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
                                                            )}
                                                        >
                                                            No {c.label} contribution is deducted from pay or paid by the company. Use only for
                                                            employees the law does not cover, and keep the basis on file.
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <div className="space-y-3 rounded-lg border p-4">
                                        <div>
                                            <p className="text-sm font-semibold">BIR · Withholding tax</p>
                                            <p className="text-muted-foreground text-[11px]">
                                                Computed automatically in payroll from the BIR withholding table; minimum wage earners are exempt.
                                            </p>
                                        </div>
                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <Field label="TIN" htmlFor="tin" error={err.tin} hint="Needed for BIR 2316 and the alphalist.">
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
                                </div>
                            </FormSection>
                        </div>
                    )}

                    {tab === 'leave' && (
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-end justify-between gap-2">
                                    <div>
                                        <Label className="text-sm font-medium">Leave types this employee can file</Label>
                                        <p className="text-muted-foreground mt-0.5 text-xs">
                                            {allLeaveSelected
                                                ? 'All leave types — new types added to the leave catalogue are included automatically.'
                                                : leaveIds.length === 0
                                                  ? 'None — this employee cannot file leave.'
                                                  : `${leaveTypes.filter((t) => leaveIds.includes(t.id)).length} of ${leaveTypes.length} leave types.`}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={allLeaveSelected}
                                            onClick={() =>
                                                setData(
                                                    'leave_type_ids',
                                                    leaveTypes.map((t) => t.id),
                                                )
                                            }
                                        >
                                            Select all
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={leaveIds.length === 0}
                                            onClick={() => setData('leave_type_ids', [])}
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                </div>
                                {leaveTypes.length === 0 ? (
                                    <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                                        No leave types are set up yet.
                                    </p>
                                ) : (
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {leaveTypes.map((t) => {
                                            const checked = leaveIds.includes(t.id);
                                            const genderMismatch = !!t.gender && !!data.gender && t.gender !== data.gender;
                                            return (
                                                <label
                                                    key={t.id}
                                                    className={cn(
                                                        'hover:bg-muted/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                                                        checked && 'border-primary/40 bg-primary/5',
                                                    )}
                                                >
                                                    <Checkbox checked={checked} onCheckedChange={() => toggleLeaveType(t.id)} className="mt-0.5" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                                            {t.name}
                                                            <span className="text-muted-foreground font-mono text-[10px]">{t.code}</span>
                                                            {!t.is_paid && (
                                                                <span className="bg-muted text-muted-foreground rounded px-1 text-[10px]">
                                                                    Unpaid
                                                                </span>
                                                            )}
                                                        </span>
                                                        {t.legal_basis && (
                                                            <span className="text-muted-foreground block text-[11px]">{t.legal_basis}</span>
                                                        )}
                                                        {t.gender && (
                                                            <span
                                                                className={cn(
                                                                    'block text-[11px]',
                                                                    genderMismatch ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                                                                )}
                                                            >
                                                                {t.gender === 'female' ? 'Female' : 'Male'} employees only
                                                                {genderMismatch && ' — not available to this employee'}
                                                            </span>
                                                        )}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                {err.leave_type_ids && <InputError message={err.leave_type_ids} />}
                            </div>

                            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                                <Field
                                    label="Opening VL credits (days)"
                                    htmlFor="vacation_leave_credits"
                                    error={err.vacation_leave_credits}
                                    hint="Seeds this year’s leave balance. Leave blank to use the policy entitlement (pro-rated in the year of hire)."
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
                            </div>
                        </div>
                    )}

                    {tab === 'login' && (
                        <div className="space-y-5">
                            {linked ? (
                                <div className="bg-muted/30 rounded-lg border p-4">
                                    <p className="text-sm font-medium">
                                        Signs in as <span className="font-mono">{linked.username ?? linked.email}</span>
                                    </p>
                                    <p className="text-muted-foreground mt-0.5 text-xs">
                                        {linked.roles?.[0]?.name ?? 'No role'} · {linked.status ? 'Active' : 'Disabled'}
                                        {linked.email ? ` · ${linked.email}` : ''}
                                    </p>
                                    <p className="text-muted-foreground mt-2 text-xs">Passwords, roles and access are managed in Admin › Users.</p>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <Label className="text-sm font-medium">
                                            {isEdit ? 'This employee has no login yet' : 'Login for the employee portal'}
                                        </Label>
                                        <p className="text-muted-foreground mt-0.5 text-xs">
                                            Employees use it to clock in, file requests and see their payslips. A new login gets the Employee role and
                                            access to this branch.
                                        </p>
                                    </div>
                                    <div className={cn('grid gap-2', isEdit ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
                                        {(
                                            [
                                                { value: 'new', label: 'Create a new login', hint: 'Username and password' },
                                                { value: 'existing', label: 'Link an existing user', hint: 'For staff who already sign in' },
                                                ...(isEdit ? [{ value: 'none', label: 'Not now', hint: 'Keep the record without a login' }] : []),
                                            ] as const
                                        ).map((o) => (
                                            <label
                                                key={o.value}
                                                className={cn(
                                                    'hover:bg-muted/40 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                                                    data.account === o.value && 'border-primary/40 bg-primary/5',
                                                )}
                                            >
                                                <input
                                                    type="radio"
                                                    name="account"
                                                    value={o.value}
                                                    checked={data.account === o.value}
                                                    onChange={() => {
                                                        setData((d) => ({
                                                            ...d,
                                                            account: o.value as FormData['account'],
                                                            password: o.value === 'new' && !d.password ? generatePassword() : d.password,
                                                        }));
                                                        form.clearErrors('account');
                                                    }}
                                                    className="accent-primary mt-1"
                                                />
                                                <span>
                                                    <span className="block text-sm font-medium">{o.label}</span>
                                                    <span className="text-muted-foreground block text-[11px]">{o.hint}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                    <InputError message={err.account} />

                                    {data.account === 'new' && (
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <Field
                                                label="Username"
                                                htmlFor="username"
                                                required
                                                error={err.username}
                                                hint="Letters, numbers, dots, dashes, underscores."
                                            >
                                                <Input
                                                    id="username"
                                                    value={data.username}
                                                    autoComplete="off"
                                                    onChange={(e) => {
                                                        usernameTouched.current = true;
                                                        setData('username', e.target.value.trim());
                                                    }}
                                                    placeholder="maria.santos"
                                                    className="font-mono"
                                                />
                                            </Field>
                                            <Field
                                                label="Password"
                                                htmlFor="password"
                                                required
                                                error={err.password}
                                                hint="Share it with the employee now — it is not shown again."
                                            >
                                                <div className="flex gap-1.5">
                                                    <Input
                                                        id="password"
                                                        value={data.password}
                                                        autoComplete="new-password"
                                                        onChange={(e) => setData('password', e.target.value)}
                                                        className="font-mono"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="shrink-0"
                                                        onClick={() => setData('password', generatePassword())}
                                                        aria-label="Generate a new password"
                                                        title="Generate"
                                                    >
                                                        <RefreshCw className="size-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon"
                                                        className="shrink-0"
                                                        onClick={copyPassword}
                                                        aria-label="Copy password"
                                                        title={copied ? 'Copied' : 'Copy'}
                                                    >
                                                        <Copy className={cn('size-4', copied && 'text-emerald-600')} />
                                                    </Button>
                                                </div>
                                            </Field>
                                            {data.email && (
                                                <p className="text-muted-foreground text-xs sm:col-span-2">
                                                    The login uses the email on the Personal tab ({data.email}) for password resets.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {data.account === 'existing' && (
                                        <Field
                                            label="User"
                                            required
                                            error={err.link_user_id}
                                            hint="Their role stays the same; they also get access to this company."
                                        >
                                            {linkable.length === 0 ? (
                                                <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
                                                    Every user is already linked to an employee in this company.
                                                </p>
                                            ) : (
                                                <Select
                                                    value={data.link_user_id || NONE}
                                                    onValueChange={(v) => setData('link_user_id', v === NONE ? '' : v)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Choose a user" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value={NONE} disabled>
                                                            Choose a user
                                                        </SelectItem>
                                                        {linkable.map((u) => (
                                                            <SelectItem key={u.id} value={String(u.id)}>
                                                                {u.name}
                                                                {u.username ? ` (@${u.username})` : ''}
                                                                {u.role ? ` · ${u.role}` : ''}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </Field>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
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
