import InputError from '@/components/input-error';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { describeOvertime, type OvertimePolicy } from '@/lib/overtime-policy';
import { cn } from '@/lib/utils';
import { useForm } from '@inertiajs/react';
import { ArrowLeft, Info, Loader2, Paperclip } from 'lucide-react';
import * as React from 'react';
import {
    fmtDate,
    fmtDays,
    fullName,
    KINDS,
    leaveTypesFor,
    REQUESTS_URL,
    TONE,
    type Balance,
    type Kind,
    type LeaveEligibility,
    type LeaveTypeOption,
    type Person,
} from '../lib';
import { KindTile } from './kind-tile';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Preselected request type; null opens the catalogue. */
    kind: Kind | null;
    kinds: Kind[];
    leaveTypes: LeaveTypeOption[];
    /** Signed-in employee, if any (files for themselves by default). */
    self: (Person & LeaveEligibility) | null;
    balances: Balance[];
    /** Employees HR may file for, per request source. Empty = self only. */
    onBehalf: { leave: boolean; attendance: boolean };
    employees: (Person & LeaveEligibility)[];
    today: string;
    /** When approved overtime counts, explained on the overtime form. */
    overtimePolicy: OvertimePolicy;
    /** Pre-fills the request's date(s), e.g. when opened from My Schedule for a specific day. */
    initialDate?: string;
};

export function FileRequestDialog(props: Props) {
    const { open, onOpenChange } = props;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
                {open && <FileRequestBody {...props} onDone={() => onOpenChange(false)} />}
            </DialogContent>
        </Dialog>
    );
}

function FileRequestBody({ kind: initialKind, kinds, onDone, ...rest }: Props & { onDone: () => void }) {
    const [kind, setKind] = React.useState<Kind | null>(initialKind);

    if (!kind) {
        return (
            <div className="space-y-4">
                <DialogHeader>
                    <DialogTitle>What do you need?</DialogTitle>
                    <DialogDescription>Pick a request. You can follow its approval under My requests.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-2 sm:grid-cols-2">
                    {kinds.map((k) => (
                        <KindTile key={k} kind={k} onClick={() => setKind(k)} />
                    ))}
                </div>
            </div>
        );
    }

    return <RequestForm {...rest} kind={kind} onBack={initialKind ? undefined : () => setKind(null)} onDone={onDone} />;
}

function Field({
    label,
    error,
    hint,
    children,
    className,
}: {
    label: string;
    error?: string;
    hint?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label className="text-xs font-medium">{label}</Label>
            {children}
            {error ? <InputError message={error} /> : hint ? <p className="text-muted-foreground text-[11px]">{hint}</p> : null}
        </div>
    );
}

/** A PDF or photo to back a request (medical certificate, travel order...), up to 5 MB. */
function AttachmentField({
    label,
    hint,
    file,
    error,
    onChange,
}: {
    label: string;
    hint: string;
    file: File | null;
    error?: string;
    onChange: (file: File | null) => void;
}) {
    return (
        <Field label={label} error={error} hint={hint}>
            <label className="text-muted-foreground hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
                <Paperclip className="size-4" />
                <span className="truncate">{file ? file.name : 'Attach a file'}</span>
                <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                    onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                />
            </label>
        </Field>
    );
}

/** "2026-10-20" + 5 days -> "2026-10-25" (dates as typed, no time zone shift). */
const addDays = (iso: string, days: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + days));
    return date.toISOString().slice(0, 10);
};

const daysBetween = (from: string, to: string) => {
    if (!from || !to || to < from) return 0;
    return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
};

/** Fields each request sends; everything else is left out of the payload. */
const FIELDS: Record<Kind, string[]> = {
    leave: ['leave_type_id', 'start_date', 'end_date', 'half_day', 'attachment'],
    overtime: ['work_date'],
    correction: ['work_date', 'requested_time_in', 'requested_break_out', 'requested_break_in', 'requested_time_out'],
    official_business: ['work_date', 'destination', 'attachment'],
    undertime: ['work_date', 'requested_time_out'],
    schedule_change: ['work_date', 'requested_rest_day', 'requested_time_in', 'requested_time_out'],
};

const PLACEHOLDER: Record<Kind, string> = {
    leave: 'e.g. Family trip to Iloilo',
    overtime: 'e.g. Rush lens edging order due tomorrow morning',
    correction: 'e.g. Forgot to check out, left at 6:05 PM',
    official_business: 'e.g. Delivering frames to the Makati branch',
    undertime: 'e.g. Medical check-up at 4:00 PM',
    schedule_change: 'e.g. Swapping with Ana to cover the Saturday clinic',
};

function RequestForm({
    kind,
    leaveTypes,
    self,
    balances,
    onBehalf,
    employees,
    today,
    overtimePolicy,
    initialDate,
    onBack,
    onDone,
}: Omit<Props, 'open' | 'onOpenChange' | 'kind' | 'kinds'> & { kind: Kind; onBack?: () => void; onDone: () => void }) {
    const meta = KINDS[kind];
    const canPick = (meta.source === 'leave' ? onBehalf.leave : onBehalf.attendance) && employees.length > 0;

    const firstDay = initialDate || today;
    const form = useForm({
        kind,
        employee_id: String(self?.id ?? ''),
        leave_type_id: '',
        start_date: firstDay,
        end_date: firstDay,
        half_day: '',
        attachment: null as File | null,
        work_date: firstDay,
        requested_time_in: '',
        requested_break_out: '',
        requested_break_in: '',
        requested_time_out: '',
        destination: '',
        requested_rest_day: false,
        reason: '',
    });
    const { data, setData, errors, processing } = form;
    const err = errors as Record<string, string | undefined>;

    const person = canPick ? (employees.find((e) => String(e.id) === data.employee_id) ?? null) : self;
    const forSelf = !!self && person?.id === self.id;
    const types = leaveTypesFor(person, leaveTypes);
    const type = types.find((t) => String(t.id) === data.leave_type_id) ?? null;
    const balance = forSelf && type ? balances.find((b) => b.leave_type_id === type.id) : undefined;
    const span = daysBetween(data.start_date, data.end_date);
    const singleDay = span === 1;

    const confirm = useConfirm();
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await confirm({
            title: `File this ${KINDS[kind].label.toLowerCase()} request?`,
            description: `${forSelf || !person ? 'Your request' : `The request for ${fullName(person)}`} is sent for approval${kind === 'leave' && span > 0 ? ` (${span} day${span === 1 ? '' : 's'})` : ''}. You can cancel it while it is pending.`,
            confirmLabel: 'File request',
        });
        if (!ok) return;
        const keep = new Set(['kind', 'reason', ...(canPick ? ['employee_id'] : []), ...FIELDS[kind]]);
        form.transform((d) => {
            const out = Object.fromEntries(Object.entries(d).filter(([k, v]) => keep.has(k) && v !== '' && v !== null));
            if (kind === 'schedule_change' && d.requested_rest_day) {
                delete out.requested_time_in;
                delete out.requested_time_out;
            }
            if (kind === 'leave' && !singleDay) delete out.half_day;
            return out;
        });
        form.post(REQUESTS_URL, { preserveScroll: true, onSuccess: onDone });
    };

    // Field errors that have no input on this form (e.g. balance or policy checks) go on top.
    const shown = new Set(['employee_id', 'reason', ...FIELDS[kind]]);
    const orphanErrors = Object.entries(err).filter(([k, v]) => v && !shown.has(k));

    return (
        <form className="space-y-4" onSubmit={submit}>
            <DialogHeader>
                <div className="flex items-center gap-2">
                    {onBack && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="-ml-2 size-8"
                            onClick={onBack}
                            aria-label="Back to request types"
                        >
                            <ArrowLeft className="size-4" />
                        </Button>
                    )}
                    <span className={cn('inline-flex size-8 items-center justify-center rounded-md border', TONE[meta.tone])}>
                        <meta.icon className="size-4" />
                    </span>
                    <DialogTitle>File {meta.label.toLowerCase()}</DialogTitle>
                </div>
                <DialogDescription>{meta.description}</DialogDescription>
            </DialogHeader>

            {orphanErrors.length > 0 && (
                <div className={cn('rounded-md border px-3 py-2 text-sm', TONE.rose)}>
                    {orphanErrors.map(([k, v]) => (
                        <p key={k}>{v}</p>
                    ))}
                </div>
            )}

            {canPick && (
                <Field label="Employee" error={err.employee_id}>
                    <Select value={data.employee_id} onValueChange={(v) => setData((d) => ({ ...d, employee_id: v, leave_type_id: '' }))}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select employee" />
                        </SelectTrigger>
                        <SelectContent>
                            {employees.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)}>
                                    {fullName(e)}
                                    {self?.id === e.id ? ' (me)' : ''}
                                    {e.position ? <span className="text-muted-foreground"> · {e.position}</span> : null}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </Field>
            )}

            {kind === 'leave' && (
                <>
                    {person && types.length === 0 && (
                        <div className={cn('rounded-md border px-3 py-2 text-sm', TONE.amber)}>
                            No leave types are enabled for {forSelf ? 'you' : fullName(person)}. HR can enable them on the employee record in the
                            Employee Directory.
                        </div>
                    )}
                    <Field label="Leave type" error={err.leave_type_id}>
                        <Select
                            value={data.leave_type_id}
                            onValueChange={(v) => {
                                // Leave that must be filed ahead can't start before its earliest date.
                                const notice = types.find((t) => String(t.id) === v)?.min_notice_days ?? 0;
                                const first = notice > 0 ? addDays(today, notice) : null;
                                setData((d) => ({
                                    ...d,
                                    leave_type_id: v,
                                    ...(first && d.start_date < first ? { start_date: first, end_date: d.end_date < first ? first : d.end_date } : {}),
                                }));
                            }}
                            disabled={types.length === 0}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select leave type" />
                            </SelectTrigger>
                            <SelectContent>
                                {types.map((t) => {
                                    const b = forSelf ? balances.find((x) => x.leave_type_id === t.id) : undefined;
                                    return (
                                        <SelectItem key={t.id} value={String(t.id)}>
                                            {t.name}
                                            <span className="text-muted-foreground">
                                                {b?.available != null
                                                    ? ` · ${fmtDays(b.available)} left`
                                                    : t.max_days_per_filing
                                                      ? ` · up to ${fmtDays(t.max_days_per_filing)}`
                                                      : ''}
                                                {!t.is_paid ? ' · unpaid' : ''}
                                            </span>
                                        </SelectItem>
                                    );
                                })}
                            </SelectContent>
                        </Select>
                    </Field>

                    {type && <LeavePolicy type={type} balance={balance} />}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                            label="First day"
                            error={err.start_date}
                            hint={type && type.min_notice_days > 0 ? `Earliest: ${fmtDate(addDays(today, type.min_notice_days))}` : undefined}
                        >
                            <Input
                                type="date"
                                value={data.start_date}
                                min={type && type.min_notice_days > 0 ? addDays(today, type.min_notice_days) : undefined}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setData((d) => ({ ...d, start_date: v, end_date: d.end_date < v ? v : d.end_date }));
                                }}
                            />
                        </Field>
                        <Field label="Last day" error={err.end_date}>
                            <Input type="date" value={data.end_date} min={data.start_date} onChange={(e) => setData('end_date', e.target.value)} />
                        </Field>
                    </div>

                    {singleDay && type?.allow_half_day !== false && (
                        <Field label="Duration" error={err.half_day}>
                            <div className="bg-muted grid grid-cols-3 gap-1 rounded-md border p-1">
                                {[
                                    ['', 'Whole day'],
                                    ['am', 'Morning'],
                                    ['pm', 'Afternoon'],
                                ].map(([v, label]) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setData('half_day', v)}
                                        className={cn(
                                            'rounded px-2 py-1.5 text-sm font-medium transition-colors',
                                            data.half_day === v
                                                ? 'bg-background text-foreground shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </Field>
                    )}

                    {span > 1 && (
                        <p className="text-muted-foreground text-xs">
                            {span} calendar days.{' '}
                            {type?.counts_calendar_days ? 'This leave counts calendar days.' : 'Rest days and holidays in between are not deducted.'}
                        </p>
                    )}

                    <AttachmentField
                        label={type && type.attachment_required_after_days !== null ? 'Supporting document' : 'Supporting document (optional)'}
                        hint="PDF or photo, up to 5 MB — e.g. medical certificate, birth or death certificate."
                        file={data.attachment}
                        error={err.attachment}
                        onChange={(file) => setData('attachment', file)}
                    />
                </>
            )}

            {kind !== 'leave' && (
                <Field
                    label={kind === 'schedule_change' ? 'Day to change' : 'Date'}
                    error={err.work_date}
                    hint={
                        kind === 'correction'
                            ? 'Today or an earlier day.'
                            : kind === 'official_business'
                              ? undefined
                              : 'Today or a later day — file before it happens.'
                    }
                >
                    <Input
                        type="date"
                        value={data.work_date}
                        max={kind === 'correction' ? today : undefined}
                        min={kind === 'overtime' || kind === 'undertime' || kind === 'schedule_change' ? today : undefined}
                        onChange={(e) => setData('work_date', e.target.value)}
                        className="sm:w-48"
                    />
                </Field>
            )}

            {kind === 'overtime' && (
                <p className={cn('rounded-md border px-3 py-2 text-xs', TONE.blue)}>
                    No need to estimate hours. Once approved, you are paid for the overtime the time clock records that day.{' '}
                    {describeOvertime(overtimePolicy)}
                </p>
            )}

            {kind === 'correction' && (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {(
                            [
                                ['requested_time_in', 'Check-in'],
                                ['requested_break_out', 'Break out'],
                                ['requested_break_in', 'Break in'],
                                ['requested_time_out', 'Check-out'],
                            ] as const
                        ).map(([key, label]) => (
                            <Field key={key} label={label} error={err[key]}>
                                <Input type="time" value={data[key]} onChange={(e) => setData(key, e.target.value)} />
                            </Field>
                        ))}
                    </div>
                    <p className="text-muted-foreground text-[11px]">Fill only the times that are wrong or missing — the others stay as recorded.</p>
                </>
            )}

            {kind === 'official_business' && (
                <>
                    <Field label="Where" error={err.destination}>
                        <Input
                            value={data.destination}
                            maxLength={255}
                            onChange={(e) => setData('destination', e.target.value)}
                            placeholder="e.g. BIR RDO 47, East Makati"
                        />
                    </Field>
                    <AttachmentField
                        label="Supporting document (optional)"
                        hint="PDF or photo, up to 5 MB — e.g. travel order, invitation, memo or receipt."
                        file={data.attachment}
                        error={err.attachment}
                        onChange={(file) => setData('attachment', file)}
                    />
                    <p className={cn('rounded-md border px-3 py-2 text-xs', TONE.emerald)}>
                        Covers the whole day. Once approved, your full shift counts as worked and you don’t need to check in or out.
                    </p>
                </>
            )}

            {kind === 'undertime' && (
                <Field label="Leaving at" error={err.requested_time_out} hint="Must be before your shift ends. Undertime is not paid.">
                    <Input
                        type="time"
                        value={data.requested_time_out}
                        onChange={(e) => setData('requested_time_out', e.target.value)}
                        className="w-40"
                    />
                </Field>
            )}

            {kind === 'schedule_change' && (
                <>
                    <div className="bg-muted grid grid-cols-2 gap-1 rounded-md border p-1">
                        {[
                            [false, 'Work a different shift'],
                            [true, 'Make it a rest day'],
                        ].map(([v, label]) => (
                            <button
                                key={String(v)}
                                type="button"
                                onClick={() => setData('requested_rest_day', v as boolean)}
                                className={cn(
                                    'rounded px-2 py-1.5 text-sm font-medium transition-colors',
                                    data.requested_rest_day === v
                                        ? 'bg-background text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {label as string}
                            </button>
                        ))}
                    </div>
                    {!data.requested_rest_day && (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="New shift starts" error={err.requested_time_in}>
                                <Input type="time" value={data.requested_time_in} onChange={(e) => setData('requested_time_in', e.target.value)} />
                            </Field>
                            <Field label="New shift ends" error={err.requested_time_out}>
                                <Input type="time" value={data.requested_time_out} onChange={(e) => setData('requested_time_out', e.target.value)} />
                            </Field>
                        </div>
                    )}
                    <p className="text-muted-foreground text-[11px]">
                        Once approved, the roster for this day is updated and lateness is measured against the new shift.
                    </p>
                </>
            )}

            <Field label="Reason" error={err.reason}>
                <Textarea
                    value={data.reason}
                    onChange={(e) => setData('reason', e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder={PLACEHOLDER[kind]}
                />
            </Field>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing || (kind === 'leave' && !data.leave_type_id) || (canPick && !data.employee_id)}>
                    {processing && <Loader2 className="size-4 animate-spin" />}
                    Submit for approval
                </Button>
            </DialogFooter>
        </form>
    );
}

function LeavePolicy({ type, balance }: { type: LeaveTypeOption; balance?: Balance }) {
    const notes = [
        type.legal_basis,
        !type.is_paid && 'Unpaid',
        type.min_notice_days > 0 && `File at least ${type.min_notice_days} days ahead`,
        type.attachment_required_after_days === 0
            ? 'Supporting document required'
            : type.attachment_required_after_days
              ? `Document required beyond ${fmtDays(type.attachment_required_after_days)}`
              : null,
        type.max_days_per_filing && `Up to ${fmtDays(type.max_days_per_filing)} per filing`,
        type.min_service_months > 0 && `After ${type.min_service_months} months of service`,
    ].filter(Boolean);

    return (
        <div className="bg-muted/40 flex gap-2 rounded-md border p-2.5 text-xs">
            <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
            <div className="space-y-1">
                {balance?.available != null && (
                    <p className="font-medium">
                        {fmtDays(balance.available)} available
                        {balance.reserved > 0 && (
                            <span className="text-muted-foreground font-normal"> · {fmtDays(balance.reserved)} on hold for pending requests</span>
                        )}
                    </p>
                )}
                <p className="text-muted-foreground">{notes.join(' · ')}</p>
            </div>
        </div>
    );
}
