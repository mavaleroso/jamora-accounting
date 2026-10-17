import { useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Loader2, Undo2 } from 'lucide-react';
import * as React from 'react';
import { useConfirm } from '@/components/confirm-dialog';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { CATEGORY, COMPLIANCE_URL, daysUntil, fmtDate, fmtStamp, peso, STEPS, TONE, type Item } from './lib';

const Field = ({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor?: string; error?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) => (
    <div className={cn('space-y-1.5', className)}>
        <Label htmlFor={htmlFor}>{label}</Label>
        {children}
        {hint && !error && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        <InputError message={error} />
    </div>
);

function Callout({ tone, icon: Icon = Info, children }: { tone: keyof typeof TONE; icon?: React.ElementType; children: React.ReactNode }) {
    return (
        <div className={cn('flex gap-2 rounded-lg border px-3 py-2 text-xs', TONE[tone])}>
            <Icon className="mt-0.5 size-3.5 shrink-0" />
            <div>{children}</div>
        </div>
    );
}

function ItemSummary({ item }: { item: Item }) {
    return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
            <div>
                <p className="text-muted-foreground">Covers</p>
                <p className="font-medium">{item.period}</p>
            </div>
            <div>
                <p className="text-muted-foreground">Due</p>
                <p className="font-medium">{fmtDate(item.due_date)}</p>
            </div>
            <div>
                <p className="text-muted-foreground">Agency · form</p>
                <p className="font-medium">
                    {item.agency ?? '—'} · {item.form_code ?? '—'}
                </p>
            </div>
            <div>
                <p className="text-muted-foreground">Owner</p>
                <p className="font-medium">{item.owner_role}</p>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Prepare / record filing / verify                                                                */
/* ---------------------------------------------------------------------------------------------- */

export type Step = 'prepare' | 'submit' | 'verify';

export function StepDialog({ item, step, today, currentUserId, onClose }: { item: Item | null; step: Step | null; today: string; currentUserId: number | null; onClose: () => void }) {
    return (
        <Dialog open={item !== null && step !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                {item && step === 'verify' && <VerifyForm item={item} currentUserId={currentUserId} onDone={onClose} />}
                {item && (step === 'prepare' || step === 'submit') && <FileForm item={item} step={step} today={today} onDone={onClose} />}
            </DialogContent>
        </Dialog>
    );
}

function FileForm({ item, step, today, onDone }: { item: Item; step: 'prepare' | 'submit'; today: string; onDone: () => void }) {
    const submit = step === 'submit';
    const form = useForm({
        status: submit ? 'submitted' : 'prepared',
        amount: item.amount !== null ? String(item.amount) : item.payroll ? String(item.payroll.amount) : '',
        reference_no: item.reference_no ?? '',
        filed_on: today,
        notes: '',
        evidence: null as File | null,
    });
    const { data, setData, errors, processing } = form;
    const late = submit && item.due_date && data.filed_on ? daysUntil(data.filed_on, item.due_date) : 0;
    const amountDiffers = item.payroll && data.amount !== '' && Math.abs(Number(data.amount) - item.payroll.amount) > 0.01;

    const send = (e: React.FormEvent) => {
        e.preventDefault();
        form.transform((d) => ({ ...d, amount: d.amount === '' ? null : Number(d.amount) }));
        form.post(`${COMPLIANCE_URL}/${item.id}/status`, { forceFormData: true, preserveScroll: true, onSuccess: onDone });
    };

    return (
        <form onSubmit={send} className="space-y-4">
            <DialogHeader>
                <DialogTitle>{submit ? 'Record filing' : 'Prepare filing'}</DialogTitle>
                <DialogDescription>{item.title}</DialogDescription>
            </DialogHeader>

            <ItemSummary item={item} />

            {item.payroll && (
                <Callout tone={item.payroll.unreleased > 0 ? 'amber' : 'sky'}>
                    <p>
                        <span className="font-semibold">Per payroll: {peso(item.payroll.amount)}</span> — {item.payroll.basis.toLowerCase()}, from {item.payroll.runs} posted payroll
                        {item.payroll.runs === 1 ? '' : 's'}.
                    </p>
                    {item.payroll.unreleased > 0 && (
                        <p className="mt-0.5">
                            {item.payroll.unreleased} payroll{item.payroll.unreleased === 1 ? ' for this month is' : 's for this month are'} not posted yet — the amount may still change.
                        </p>
                    )}
                </Callout>
            )}

            {submit && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Filed / paid on" error={errors.filed_on}>
                        <DatePicker value={data.filed_on} onChange={(v) => setData('filed_on', v)} />
                    </Field>
                    <Field label="Reference no." htmlFor="ref" error={errors.reference_no} hint="PRN, eFPS / eBIRForms confirmation, OR no.">
                        <Input id="ref" value={data.reference_no} onChange={(e) => setData('reference_no', e.target.value)} className="font-mono" required />
                    </Field>
                </div>
            )}
            {submit && late > 0 && (
                <Callout tone="rose" icon={AlertTriangle}>
                    Filed {late} day{late === 1 ? '' : 's'} after the due date. It will stay flagged as a late filing (possible surcharge and interest).
                </Callout>
            )}

            <Field
                label="Amount"
                htmlFor="amount"
                error={errors.amount}
                hint={amountDiffers ? <span className="text-amber-700 dark:text-amber-400">Differs from payroll ({peso(item.payroll!.amount)}) — add a note explaining why.</span> : 'Leave blank for filings without a payment.'}
            >
                <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">₱</span>
                    <Input id="amount" type="number" min="0" step="0.01" className="pl-6 font-mono" value={data.amount} onChange={(e) => setData('amount', e.target.value)} />
                </div>
            </Field>

            <Field label={submit ? 'Proof of filing / payment' : 'Working file (optional)'} htmlFor="evidence" error={errors.evidence} hint="PDF or image, up to 10 MB.">
                <Input id="evidence" type="file" accept=".pdf,image/*" onChange={(e) => setData('evidence', e.target.files?.[0] ?? null)} />
                {item.evidence_url && !data.evidence && (
                    <a href={item.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] underline underline-offset-2">
                        Current file <ExternalLink className="size-3" />
                    </a>
                )}
            </Field>

            <Field label="Notes" htmlFor="notes" error={errors.notes}>
                <Textarea id="notes" rows={2} value={data.notes} onChange={(e) => setData('notes', e.target.value)} placeholder={submit ? 'e.g. Paid via BDO online, debit advice attached' : 'e.g. R-3 list generated from October payroll'} />
            </Field>

            <InputError message={errors.status} />

            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone} disabled={processing}>
                    Cancel
                </Button>
                <Button type="submit" disabled={processing}>
                    {processing && <Loader2 className="size-4 animate-spin" />} {submit ? 'Record filing' : 'Mark prepared'}
                </Button>
            </DialogFooter>
        </form>
    );
}

function VerifyForm({ item, currentUserId, onDone }: { item: Item; currentUserId: number | null; onDone: () => void }) {
    const verifyForm = useForm({ notes: '' });
    const returnForm = useForm({ reason: '' });
    const [returning, setReturning] = React.useState(false);
    const confirm = useConfirm();
    const own =[item.prepared?.by_id, item.submitted?.by_id].includes(currentUserId);
    const busy = verifyForm.processing || returnForm.processing;

    return (
        <div className="space-y-4">
            <DialogHeader>
                <DialogTitle>Verify filing</DialogTitle>
                <DialogDescription>{item.title}</DialogDescription>
            </DialogHeader>

            <ItemSummary item={item} />

            <dl className="divide-y rounded-lg border text-sm">
                <Row label="Amount" value={item.amount !== null ? peso(item.amount) : '—'} />
                {item.payroll && <Row label="Per payroll" value={peso(item.payroll.amount)} warn={Math.abs((item.amount ?? 0) - item.payroll.amount) > 0.01} />}
                <Row label="Reference no." value={item.reference_no ?? '—'} mono />
                <Row label="Filed on" value={item.submitted ? fmtStamp(item.submitted.at) : '—'} warn={item.is_late} hint={item.is_late ? `${item.days_late} day(s) late` : undefined} />
                <Row label="Prepared by" value={item.prepared?.by ?? '—'} />
                <Row label="Filed by" value={item.submitted?.by ?? '—'} />
                <Row
                    label="Proof"
                    value={
                        item.evidence_url ? (
                            <a href={item.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                                Open file <ExternalLink className="size-3" />
                            </a>
                        ) : (
                            <span className="text-amber-700 dark:text-amber-400">None attached</span>
                        )
                    }
                />
            </dl>
            {item.notes && <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs whitespace-pre-line text-muted-foreground">{item.notes}</p>}

            {own ? (
                <Callout tone="amber" icon={AlertTriangle}>
                    You prepared or filed this item. Another person with verification rights must sign it off.
                </Callout>
            ) : returning ? (
                <Field label="Why is it being returned?" htmlFor="reason" error={returnForm.errors.reason}>
                    <Textarea id="reason" rows={2} value={returnForm.data.reason} onChange={(e) => returnForm.setData('reason', e.target.value)} placeholder="e.g. Amount doesn’t match the PRN; attach the bank debit advice." autoFocus />
                </Field>
            ) : (
                <Field label="Verification note (optional)" htmlFor="vnote">
                    <Input id="vnote" value={verifyForm.data.notes} onChange={(e) => verifyForm.setData('notes', e.target.value)} placeholder="e.g. Agrees with bank statement Oct 31" />
                </Field>
            )}
            <InputError message={(verifyForm.errors as Record<string, string>).status ?? (returnForm.errors as Record<string, string>).status} />

            <DialogFooter className="gap-2 sm:justify-between">
                {!own && !returning ? (
                    <Button type="button" variant="outline" onClick={() => setReturning(true)} disabled={busy}>
                        <Undo2 className="size-4" /> Return for correction
                    </Button>
                ) : (
                    <span />
                )}
                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={returning ? () => setReturning(false) : onDone} disabled={busy}>
                        {returning ? 'Back' : 'Close'}
                    </Button>
                    {!own &&
                        (returning ? (
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={busy || !returnForm.data.reason.trim()}
                                onClick={() => returnForm.post(`${COMPLIANCE_URL}/${item.id}/return`, { preserveScroll: true, onSuccess: onDone })}
                            >
                                {returnForm.processing && <Loader2 className="size-4 animate-spin" />} Return
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: 'Verify this filing?',
                                        description: `You are signing off "${item.title}" as correctly filed. Verified filings are closed.`,
                                        confirmLabel: 'Verify',
                                    });
                                    if (ok) verifyForm.post(`${COMPLIANCE_URL}/${item.id}/verify`, { preserveScroll: true, onSuccess: onDone });
                                }}
                            >
                                {verifyForm.processing ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Verify
                            </Button>
                        ))}
                </div>
            </DialogFooter>
        </div>
    );
}

function Row({ label, value, mono, warn, hint }: { label: string; value: React.ReactNode; mono?: boolean; warn?: boolean; hint?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn('text-right', mono && 'font-mono text-xs', warn && 'text-rose-600 dark:text-rose-400')}>
                {value}
                {hint && <span className="block text-[11px]">{hint}</span>}
            </dd>
        </div>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Detail (audit trail)                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export function DetailDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
    const stamps = item ? [item.prepared, item.submitted, item.verified] : [];
    return (
        <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                {item && (
                    <>
                        <DialogHeader>
                            <DialogTitle>{item.title}</DialogTitle>
                            <DialogDescription>
                                {CATEGORY[item.category] ?? item.category} · covers {item.period}
                            </DialogDescription>
                        </DialogHeader>
                        <ItemSummary item={item} />
                        <ol className="space-y-3">
                            {STEPS.slice(1).map((s, i) => {
                                const stamp = stamps[i];
                                return (
                                    <li key={s.key} className="flex gap-3">
                                        <span className={cn('mt-0.5 size-2.5 shrink-0 rounded-full', stamp ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                                        <div className="text-sm">
                                            <p className={cn('font-medium', !stamp && 'text-muted-foreground')}>{s.label}</p>
                                            <p className="text-xs text-muted-foreground">{stamp ? `${stamp.by ?? 'Unknown'} · ${fmtStamp(stamp.at)}` : 'Not yet'}</p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                        <dl className="divide-y rounded-lg border text-sm">
                            <Row label="Amount" value={item.amount !== null ? peso(item.amount) : '—'} />
                            {item.payroll && <Row label="Per payroll" value={peso(item.payroll.amount)} />}
                            <Row label="Reference no." value={item.reference_no ?? '—'} mono />
                            {item.is_late && <Row label="Late filing" value={`${item.days_late} day(s) after due date`} warn />}
                            <Row
                                label="Proof"
                                value={
                                    item.evidence_url ? (
                                        <a href={item.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
                                            Open file <ExternalLink className="size-3" />
                                        </a>
                                    ) : (
                                        '—'
                                    )
                                }
                            />
                        </dl>
                        {item.notes && <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs whitespace-pre-line text-muted-foreground">{item.notes}</p>}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

/* ---------------------------------------------------------------------------------------------- */
/* Add obligation / add a month                                                                    */
/* ---------------------------------------------------------------------------------------------- */

const monthName = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export function AddItemDialog({ open, today, categories, onClose }: { open: boolean; today: string; categories: string[]; onClose: () => void }) {
    const form = useForm({
        title: '',
        form_code: '',
        agency: '',
        category: 'regulatory',
        frequency: 'one_time',
        month: today.slice(0, 7),
        due_date: today,
        owner_role: 'HR / Accounting',
        amount: '',
        notes: '',
    });
    const { data, setData, errors, processing } = form;

    const confirm = useConfirm();
    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await confirm({
            title: 'Add this filing to the calendar?',
            description: `${data.title || 'The filing'} is added for ${monthName(data.month)} and tracked through prepare, file and verify.`,
            confirmLabel: 'Add filing',
        });
        if (!ok) return;
        form.transform(({ month, ...d }) => ({ ...d, period: monthName(month), amount: d.amount === '' ? null : Number(d.amount) }));
        form.post(COMPLIANCE_URL, {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                onClose();
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Add obligation</DialogTitle>
                        <DialogDescription>For filings outside the standard calendar — permits, clearances, special reports.</DialogDescription>
                    </DialogHeader>
                    <Field label="Title" htmlFor="title" error={errors.title}>
                        <Input id="title" value={data.title} onChange={(e) => setData('title', e.target.value)} placeholder="e.g. Fire Safety Inspection Certificate renewal" required />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Agency" htmlFor="agency" error={errors.agency}>
                            <Input id="agency" value={data.agency} onChange={(e) => setData('agency', e.target.value)} placeholder="BFP, LGU, DOH…" />
                        </Field>
                        <Field label="Form / code" htmlFor="code" error={errors.form_code}>
                            <Input id="code" value={data.form_code} onChange={(e) => setData('form_code', e.target.value.toUpperCase())} className="font-mono" placeholder="FSIC" />
                        </Field>
                        <Field label="Category" error={errors.category}>
                            <Select value={data.category} onValueChange={(v) => setData('category', v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {CATEGORY[c] ?? c}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Frequency" error={errors.frequency}>
                            <Select value={data.frequency} onValueChange={(v) => setData('frequency', v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="one_time">One-time</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="quarterly">Quarterly</SelectItem>
                                    <SelectItem value="annual">Annual</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="Covers month" htmlFor="month" error={(errors as Record<string, string>).period}>
                            <Input id="month" type="month" value={data.month} onChange={(e) => setData('month', e.target.value)} required />
                        </Field>
                        <Field label="Due date" error={errors.due_date}>
                            <DatePicker value={data.due_date} onChange={(v) => setData('due_date', v)} />
                        </Field>
                        <Field label="Owner" htmlFor="owner" error={errors.owner_role}>
                            <Input id="owner" value={data.owner_role} onChange={(e) => setData('owner_role', e.target.value)} required />
                        </Field>
                        <Field label="Expected amount" htmlFor="amt" error={errors.amount}>
                            <Input id="amt" type="number" min="0" step="0.01" className="font-mono" value={data.amount} onChange={(e) => setData('amount', e.target.value)} />
                        </Field>
                    </div>
                    <Field label="Notes" htmlFor="n" error={errors.notes}>
                        <Textarea id="n" rows={2} value={data.notes} onChange={(e) => setData('notes', e.target.value)} />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={processing}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {processing && <Loader2 className="size-4 animate-spin" />} Add obligation
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function AddMonthDialog({ open, today, onClose }: { open: boolean; today: string; onClose: () => void }) {
    const form = useForm({ month: today.slice(0, 7) });
    const confirm = useConfirm();
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-sm">
                <form
                    onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await confirm({
                            title: `Add ${monthName(form.data.month)} to the calendar?`,
                            description: 'The month’s statutory filings (BIR, SSS, PhilHealth, Pag-IBIG and others) are generated. Filings that already exist are kept.',
                            confirmLabel: 'Add month',
                        });
                        if (!ok) return;
                        form.post(`${COMPLIANCE_URL}/generate-calendar`, { preserveScroll: true, onSuccess: onClose });
                    }}
                    className="space-y-4"
                >
                    <DialogHeader>
                        <DialogTitle>Add a month to the calendar</DialogTitle>
                        <DialogDescription>Creates the standard BIR, SSS, PhilHealth, Pag-IBIG and DOLE obligations for that month. This and last month are added automatically.</DialogDescription>
                    </DialogHeader>
                    <Field label="Covered month" htmlFor="gm" error={form.errors.month ?? (form.errors as Record<string, string>).period}>
                        <Input id="gm" type="month" value={form.data.month} onChange={(e) => form.setData('month', e.target.value)} required />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={form.processing}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing && <Loader2 className="size-4 animate-spin" />} Add {form.data.month ? monthName(form.data.month) : 'month'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
