import { useForm } from '@inertiajs/react';
import { CalendarCheck, Crosshair, Loader2, MapPin } from 'lucide-react';
import * as React from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
    ATTENDANCE_URL,
    fmtDate,
    fmtHours,
    fmtMinutes,
    fmtTime,
    fullName,
    toTimeInput,
    type AttendanceRequestRow,
    type BranchLocation,
    type DtrRow,
    type Person,
} from '../lib';
import { useGeofence } from '../use-geofence';

function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('space-y-1.5', className)}>
            <Label className="text-xs font-medium">{label}</Label>
            {children}
            {error ? <InputError message={error} /> : hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
    );
}

type Open = { open: boolean; onOpenChange: (open: boolean) => void };

/** Renders the body only while open, so each opening starts from fresh defaults. */
function Shell({ open, onOpenChange, className, children }: Open & { className?: string; children: React.ReactNode }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className={cn('sm:max-w-lg', className)}>{open && children}</DialogContent>
        </Dialog>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Checkout remark (employee)
 * -------------------------------------------------------------------------------------------- */

export function CheckoutRemarkDialog({ open, onOpenChange, onConfirm, processing }: Open & { onConfirm: (remark: string) => void; processing: boolean }) {
    const [remark, setRemark] = React.useState('');
    return (
        <Shell open={open} onOpenChange={onOpenChange}>
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    onConfirm(remark.trim());
                }}
                className="space-y-4"
            >
                <DialogHeader>
                    <DialogTitle>Check out without a full break?</DialogTitle>
                    <DialogDescription>
                        Your break-out or break-in is missing. Add a short remark for HR — the standard unpaid break will still be deducted.
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="e.g. Took a working lunch with a walk-in patient"
                    autoFocus
                />
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={!remark.trim() || processing}>
                        {processing && <Loader2 className="size-4 animate-spin" />}
                        Check out
                    </Button>
                </DialogFooter>
            </form>
        </Shell>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Manual entry / edit (timekeeper)
 * -------------------------------------------------------------------------------------------- */

export type ManualEntryTarget = { employeeId?: number; date?: string; entry?: Partial<DtrRow> | null } | null;

export function ManualEntryDialog({
    open,
    onOpenChange,
    target,
    employees,
    today,
}: Open & { target: ManualEntryTarget; employees: Person[]; today: string }) {
    return (
        <Shell open={open} onOpenChange={onOpenChange}>
            <ManualEntryForm target={target} employees={employees} today={today} onDone={() => onOpenChange(false)} />
        </Shell>
    );
}

function ManualEntryForm({ target, employees, today, onDone }: { target: ManualEntryTarget; employees: Person[]; today: string; onDone: () => void }) {
    const entry = target?.entry ?? null;
    const isEdit = Boolean(entry);
    const form = useForm({
        employee_id: String(target?.employeeId ?? entry?.employee_id ?? ''),
        work_date: target?.date ?? entry?.work_date ?? today,
        time_in: toTimeInput(entry?.time_in),
        break_out: toTimeInput(entry?.break_out),
        break_in: toTimeInput(entry?.break_in),
        time_out: toTimeInput(entry?.time_out),
        notes: '',
    });
    const { data, setData, errors, processing } = form;
    const employee = employees.find((e) => String(e.id) === data.employee_id) ?? entry?.employee;

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.post(`${ATTENDANCE_URL}/punch`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle>{isEdit ? 'Edit time record' : 'Add time record'}</DialogTitle>
                <DialogDescription>
                    {isEdit
                        ? `${fullName(employee)} · ${fmtDate(data.work_date, { weekday: 'short', month: 'short', day: 'numeric' })}`
                        : 'Record punches on behalf of an employee (e.g. biometric outage or forgotten punch).'}
                </DialogDescription>
            </DialogHeader>

            {!isEdit && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Employee" error={errors.employee_id}>
                        <Select value={data.employee_id} onValueChange={(v) => setData('employee_id', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.map((e) => (
                                    <SelectItem key={e.id} value={String(e.id)}>
                                        {fullName(e)} <span className="text-muted-foreground">· {e.employee_code}</span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                    <Field label="Work date" error={errors.work_date}>
                        <Input type="date" value={data.work_date} max={today} onChange={(e) => setData('work_date', e.target.value)} />
                    </Field>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                    [
                        ['time_in', 'Check-in'],
                        ['break_out', 'Break out'],
                        ['break_in', 'Break in'],
                        ['time_out', 'Check-out'],
                    ] as const
                ).map(([key, label]) => (
                    <Field key={key} label={label} error={errors[key]}>
                        <Input type="time" value={data[key]} onChange={(e) => setData(key, e.target.value)} />
                    </Field>
                ))}
            </div>
            {entry?.scheduled_in && (
                <p className="-mt-2 text-[11px] text-muted-foreground">
                    Scheduled {fmtTime(entry.scheduled_in)} – {fmtTime(entry.scheduled_out)}. Hours, lates and OT are recomputed on save.
                </p>
            )}

            <Field label="Reason" error={errors.notes} hint="Saved to the record’s audit notes.">
                <Textarea
                    value={data.notes}
                    onChange={(e) => setData('notes', e.target.value)}
                    rows={2}
                    placeholder="e.g. Biometric device offline — confirmed with branch manager"
                />
            </Field>

            {entry?.status === 'approved' && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    This record is approved. Saving changes sends it back for review.
                </p>
            )}

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing || !data.employee_id}>
                    {processing && <Loader2 className="size-4 animate-spin" />}
                    Save record
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Time correction request (employee, or HR on behalf). Overtime is pre-filed in Employee Requests.
 * -------------------------------------------------------------------------------------------- */

export type RequestTarget = { employeeId?: number; date?: string; entry?: DtrRow | null; type?: 'correction' } | null;

export function RequestDialog({
    open,
    onOpenChange,
    target,
    employees,
    today,
    canPickEmployee,
}: Open & { target: RequestTarget; employees: Person[]; today: string; canPickEmployee: boolean }) {
    return (
        <Shell open={open} onOpenChange={onOpenChange}>
            <RequestForm target={target} employees={employees} today={today} canPickEmployee={canPickEmployee} onDone={() => onOpenChange(false)} />
        </Shell>
    );
}

function RequestForm({
    target,
    employees,
    today,
    canPickEmployee,
    onDone,
}: {
    target: RequestTarget;
    employees: Person[];
    today: string;
    canPickEmployee: boolean;
    onDone: () => void;
}) {
    const entry = target?.entry ?? null;
    const form = useForm({
        employee_id: String(target?.employeeId ?? entry?.employee_id ?? employees[0]?.id ?? ''),
        request_type: 'correction' as const,
        work_date: entry?.work_date ?? target?.date ?? today,
        requested_time_in: toTimeInput(entry?.time_in),
        requested_break_out: toTimeInput(entry?.break_out),
        requested_break_in: toTimeInput(entry?.break_in),
        requested_time_out: toTimeInput(entry?.time_out),
        reason: '',
    });
    const { data, setData, errors, processing } = form;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((d) => {
            // Only send the times that actually change, so approval doesn't overwrite good punches.
            const keys = ['time_in', 'break_out', 'break_in', 'time_out'] as const;
            const changed = Object.fromEntries(
                keys.map((k) => {
                    const v = d[`requested_${k}`];
                    return [`requested_${k}`, !v || v === toTimeInput(entry?.[k]) ? null : v];
                }),
            );
            return { ...d, ...changed };
        });
        form.post(`${ATTENDANCE_URL}/requests`, { preserveScroll: true, onSuccess: onDone });
    };

    return (
        <form className="space-y-4" onSubmit={submit}>
            <DialogHeader>
                <DialogTitle>Request a time correction</DialogTitle>
                <DialogDescription>
                    Fix a missed or wrong punch. Only the times you change are sent for approval. Overtime is filed in advance under Employee Requests.
                </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
                {canPickEmployee && !entry && (
                    <Field label="Employee" error={errors.employee_id}>
                        <Select value={data.employee_id} onValueChange={(v) => setData('employee_id', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                            <SelectContent>
                                {employees.map((e) => (
                                    <SelectItem key={e.id} value={String(e.id)}>
                                        {fullName(e)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                )}
                <Field label="Work date" error={errors.work_date}>
                    <Input type="date" value={data.work_date} max={today} disabled={Boolean(entry)} onChange={(e) => setData('work_date', e.target.value)} />
                </Field>
            </div>

            {entry && (
                <div className="rounded-md border bg-muted/40 p-2.5 text-xs">
                    <span className="text-muted-foreground">On record: </span>
                    {fmtTime(entry.time_in)} → {fmtTime(entry.time_out)}
                    {entry.break_out && (
                        <span className="text-muted-foreground">
                            {' '}
                            · break {fmtTime(entry.break_out)}–{fmtTime(entry.break_in)}
                        </span>
                    )}
                    {Number(entry.ot_hours) > 0 && <span className="text-muted-foreground"> · OT {fmtHours(entry.ot_hours)} rendered</span>}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                    [
                        ['requested_time_in', 'Check-in'],
                        ['requested_break_out', 'Break out'],
                        ['requested_break_in', 'Break in'],
                        ['requested_time_out', 'Check-out'],
                    ] as const
                ).map(([key, label]) => (
                    <Field key={key} label={label} error={errors[key]}>
                        <Input type="time" value={data[key]} onChange={(e) => setData(key, e.target.value)} />
                    </Field>
                ))}
            </div>

            <Field label="Reason" error={errors.reason}>
                <Textarea
                    value={data.reason}
                    onChange={(e) => setData('reason', e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="e.g. Forgot to check out, left at 6:05 PM"
                />
            </Field>

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing}>
                    {processing && <Loader2 className="size-4 animate-spin" />}
                    Submit request
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Approve a single record (timekeeper) — reviewer sets payable OT
 * -------------------------------------------------------------------------------------------- */

export function ApproveDialog({ open, onOpenChange, entry }: Open & { entry: DtrRow | null }) {
    return (
        <Shell open={open} onOpenChange={onOpenChange}>
            {entry && <ApproveForm entry={entry} onDone={() => onOpenChange(false)} />}
        </Shell>
    );
}

function ApproveForm({ entry, onDone }: { entry: DtrRow; onDone: () => void }) {
    const rendered = Number(entry.ot_hours);
    const payable = Number(entry.ot_hours_approved);
    const unpaid = Math.max(0, rendered - payable);
    const form = useForm({});

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.post(`${ATTENDANCE_URL}/${entry.id}/approve`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle>Approve time record</DialogTitle>
                <DialogDescription>
                    {fullName(entry.employee)} · {fmtDate(entry.work_date, { weekday: 'short', month: 'short', day: 'numeric' })}
                </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-3 gap-3 rounded-lg border p-3 text-sm">
                <div>
                    <dt className="text-[11px] text-muted-foreground uppercase">Punches</dt>
                    <dd className="font-mono">
                        {fmtTime(entry.time_in)} – {fmtTime(entry.time_out)}
                    </dd>
                </div>
                <div>
                    <dt className="text-[11px] text-muted-foreground uppercase">Regular</dt>
                    <dd className="font-mono">{fmtHours(entry.regular_hours)}</dd>
                </div>
                <div>
                    <dt className="text-[11px] text-muted-foreground uppercase">Late / UT</dt>
                    <dd className="font-mono">
                        {fmtMinutes(entry.tardiness_minutes)} / {fmtMinutes(entry.undertime_minutes)}
                    </dd>
                </div>
            </dl>
            {rendered > 0 ? (
                <div
                    className={cn(
                        'rounded-lg border p-3 text-sm',
                        unpaid > 0 ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-muted/40',
                    )}
                >
                    <div className="font-medium">
                        Overtime: {fmtHours(payable)} payable of {fmtHours(rendered)} rendered
                    </div>
                    <p className="mt-0.5 text-xs opacity-90">
                        {unpaid === 0
                            ? 'All overtime on this day is covered by approved OT requests.'
                            : entry.ot_request_pending
                              ? `${fmtHours(unpaid)} has a pending OT pre-approval — approve it in Requests to make it payable.`
                              : `${fmtHours(unpaid)} will not be paid — it was not pre-approved. Overtime must be filed before it is worked.`}
                    </p>
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">No overtime rendered on this day.</p>
            )}
            {(form.errors as Record<string, string>).dtr && <InputError message={(form.errors as Record<string, string>).dtr} />}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={form.processing}>
                    {form.processing && <Loader2 className="size-4 animate-spin" />}
                    Approve
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Review a request (timekeeper)
 * -------------------------------------------------------------------------------------------- */

const REVIEW_COPY: Record<AttendanceRequestRow['request_type'], { label: string; effect: string }> = {
    correction: { label: 'Time correction', effect: 'The requested times replace the punches on record and hours are recomputed.' },
    overtime: { label: 'Overtime', effect: '' },
    official_business: { label: 'Official business', effect: 'The time away counts as work; missing punches are filled from the official business window.' },
    undertime: { label: 'Undertime', effect: 'The early departure is authorised. The undertime is still deducted from pay.' },
    schedule_change: { label: 'Change of schedule', effect: 'The roster for this day is replaced and lateness is measured against the new schedule.' },
};

export function ReviewDialog({ open, onOpenChange, request, decision }: Open & { request: AttendanceRequestRow | null; decision: 'approved' | 'rejected' }) {
    return (
        <Shell open={open} onOpenChange={onOpenChange}>
            {request && <ReviewForm request={request} decision={decision} onDone={() => onOpenChange(false)} />}
        </Shell>
    );
}

function ReviewForm({ request, decision, onDone }: { request: AttendanceRequestRow; decision: 'approved' | 'rejected'; onDone: () => void }) {
    const form = useForm({ status: decision, review_remarks: '' });
    const reject = decision === 'rejected';

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.post(`${ATTENDANCE_URL}/requests/${request.id}/review`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle>{reject ? 'Reject request' : 'Approve request'}</DialogTitle>
                <DialogDescription>
                    {fullName(request.employee)} · {REVIEW_COPY[request.request_type].label} for{' '}
                    {fmtDate(request.work_date, { weekday: 'short', month: 'short', day: 'numeric' })}
                </DialogDescription>
            </DialogHeader>
            {!reject && (
                <p className="text-sm text-muted-foreground">
                    {request.request_type === 'overtime'
                        ? `Pre-approves ${fmtHours(request.requested_ot_hours)} of overtime. It is paid only for hours actually worked past the shift.`
                        : REVIEW_COPY[request.request_type].effect}
                </p>
            )}
            <Field label={reject ? 'Reason for rejecting' : 'Note to employee (optional)'} error={form.errors.review_remarks ?? form.errors.status}>
                <Textarea
                    value={form.data.review_remarks}
                    onChange={(e) => form.setData('review_remarks', e.target.value)}
                    rows={3}
                    maxLength={255}
                    autoFocus
                    placeholder={reject ? 'e.g. CCTV shows arrival at 8:40 AM' : ''}
                />
            </Field>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" variant={reject ? 'destructive' : 'default'} disabled={form.processing || (reject && !form.data.review_remarks.trim())}>
                    {form.processing && <Loader2 className="size-4 animate-spin" />}
                    {reject ? 'Reject' : 'Approve'}
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Daily close (timekeeper)
 * -------------------------------------------------------------------------------------------- */

export function DailyCloseDialog({ open, onOpenChange, today }: Open & { today: string }) {
    return (
        <Shell open={open} onOpenChange={onOpenChange}>
            <DailyCloseForm today={today} onDone={() => onOpenChange(false)} />
        </Shell>
    );
}

function DailyCloseForm({ today, onDone }: { today: string; onDone: () => void }) {
    const yesterday = React.useMemo(() => {
        const [y, m, d] = today.split('-').map(Number);
        const dt = new Date(y, m - 1, d - 1);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }, [today]);
    const form = useForm({ date: yesterday });

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.post(`${ATTENDANCE_URL}/daily-close`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <CalendarCheck className="size-5" /> Close a work day
                </DialogTitle>
                <DialogDescription>Fills in the day for everyone who didn’t punch. Safe to run again — existing punches are never touched.</DialogDescription>
            </DialogHeader>
            <ul className="space-y-1 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                <li>• Scheduled, no punch, no leave → <span className="font-medium text-foreground">Absent</span></li>
                <li>• Approved leave → <span className="font-medium text-foreground">On leave</span></li>
                <li>• Regular holiday not worked → <span className="font-medium text-foreground">Holiday (paid)</span></li>
                <li>• Rest days & special non-working days → no record</li>
            </ul>
            <Field label="Day to close" error={form.errors.date}>
                <Input type="date" value={form.data.date} max={yesterday} onChange={(e) => form.setData('date', e.target.value)} className="w-48" />
            </Field>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={form.processing}>
                    {form.processing && <Loader2 className="size-4 animate-spin" />}
                    Close day
                </Button>
            </DialogFooter>
        </form>
    );
}

/* ----------------------------------------------------------------------------------------------
 * Geofence settings (timekeeper)
 * -------------------------------------------------------------------------------------------- */

export function GeofenceDialog({ open, onOpenChange, branch }: Open & { branch: BranchLocation }) {
    return (
        <Shell open={open} onOpenChange={onOpenChange}>
            <GeofenceForm branch={branch} onDone={() => onOpenChange(false)} />
        </Shell>
    );
}

function GeofenceForm({ branch, onDone }: { branch: BranchLocation; onDone: () => void }) {
    const geo = useGeofence({ ...branch, geofence_enforced: true });
    const form = useForm({
        latitude: String(branch.latitude),
        longitude: String(branch.longitude),
        geofence_radius: String(branch.geofence_radius),
        geofence_enforced: branch.geofence_enforced,
    });
    const { data, setData, errors } = form;

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.transform((d) => ({ ...d, latitude: Number(d.latitude), longitude: Number(d.longitude), geofence_radius: Number(d.geofence_radius) }));
                form.post(`${ATTENDANCE_URL}/geofence`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <MapPin className="size-5" /> Branch location & geofence
                </DialogTitle>
                <DialogDescription>{branch.name} — employees can only clock in within this radius.</DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="min-w-0 text-xs">
                    <div className="font-medium">This device</div>
                    <div className="truncate font-mono text-muted-foreground">
                        {geo.coords
                            ? `${geo.coords.latitude.toFixed(5)}, ${geo.coords.longitude.toFixed(5)} (±${geo.coords.accuracy}m)`
                            : (geo.error ?? 'Locating…')}
                    </div>
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!geo.coords}
                    onClick={() =>
                        geo.coords && setData((d) => ({ ...d, latitude: geo.coords!.latitude.toFixed(6), longitude: geo.coords!.longitude.toFixed(6) }))
                    }
                >
                    <Crosshair className="size-4" /> Use this spot
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Field label="Latitude" error={errors.latitude}>
                    <Input type="number" step="any" value={data.latitude} onChange={(e) => setData('latitude', e.target.value)} />
                </Field>
                <Field label="Longitude" error={errors.longitude}>
                    <Input type="number" step="any" value={data.longitude} onChange={(e) => setData('longitude', e.target.value)} />
                </Field>
            </div>
            <Field label="Allowed radius (meters)" error={errors.geofence_radius} hint="100–300m works for most branches; GPS indoors can drift ±50m.">
                <Input type="number" min="20" max="5000" value={data.geofence_radius} onChange={(e) => setData('geofence_radius', e.target.value)} className="w-32" />
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                    <Label className="text-sm font-medium">Enforce geofence</Label>
                    <p className="text-xs text-muted-foreground">When off, punches still record location but are never blocked.</p>
                </div>
                <Switch checked={data.geofence_enforced} onCheckedChange={(v) => setData('geofence_enforced', v)} />
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={form.processing}>
                    {form.processing && <Loader2 className="size-4 animate-spin" />}
                    Save
                </Button>
            </DialogFooter>
        </form>
    );
}
