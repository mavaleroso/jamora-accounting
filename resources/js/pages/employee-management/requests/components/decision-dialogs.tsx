import { useForm } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fmtDays, fmtHours, fullName, REQUESTS_URL, type RequestItem } from '../lib';
import { fmtRange } from './request-card';

type Open = { open: boolean; onOpenChange: (open: boolean) => void };

/** What approving actually does, so reviewers know the downstream effect. */
function effect(item: RequestItem): string {
    const d = item.details;
    switch (item.kind) {
        case 'leave':
            return `${d.half_day ? 'Half a day' : fmtDays(d.days)} will be deducted from the balance and the dates marked as leave on the time record.`;
        case 'overtime':
            return `Pre-approves ${fmtHours(d.ot_hours)} of overtime. It is paid only for hours actually worked past the shift.`;
        case 'correction':
            return 'The requested times replace the punches on record and hours are recomputed.';
        case 'official_business':
            return 'The time away counts as work; missing punches are filled from the official business window.';
        case 'undertime':
            return 'The early departure is authorised. The undertime is still deducted from pay.';
        case 'schedule_change':
            return 'The roster for this day is replaced and lateness is measured against the new schedule.';
    }
}

const base = (item: RequestItem) => `${REQUESTS_URL}/${item.source}/${item.id}`;

export function DecisionDialog({ open, onOpenChange, item, decision }: Open & { item: RequestItem | null; decision: 'approved' | 'declined' }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">{open && item && <DecisionForm item={item} decision={decision} onDone={() => onOpenChange(false)} />}</DialogContent>
        </Dialog>
    );
}

function DecisionForm({ item, decision, onDone }: { item: RequestItem; decision: 'approved' | 'declined'; onDone: () => void }) {
    const form = useForm({ decision, remarks: '' });
    const decline = decision === 'declined';
    const errors = form.errors as Record<string, string | undefined>;
    const error = errors.remarks ?? errors.status ?? errors.approver ?? errors.leave_type_id ?? Object.values(errors)[0];

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.post(`${base(item)}/review`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle>
                    {decline ? 'Decline' : 'Approve'} {item.title.toLowerCase()}
                </DialogTitle>
                <DialogDescription>
                    {fullName(item.employee)} · {fmtRange(item.date_from, item.date_to)}
                </DialogDescription>
            </DialogHeader>
            {!decline && <p className="text-sm text-muted-foreground">{effect(item)}</p>}
            <div className="space-y-1.5">
                <Label className="text-xs font-medium">{decline ? 'Reason for declining' : 'Note to employee (optional)'}</Label>
                <Textarea
                    value={form.data.remarks}
                    onChange={(e) => form.setData('remarks', e.target.value)}
                    rows={3}
                    maxLength={255}
                    autoFocus
                    placeholder={decline ? 'e.g. Two optometrists are already on leave that week' : ''}
                />
                {error && <InputError message={error} />}
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Back
                </Button>
                <Button type="submit" variant={decline ? 'destructive' : 'default'} disabled={form.processing || (decline && !form.data.remarks.trim())}>
                    {form.processing && <Loader2 className="size-4 animate-spin" />}
                    {decline ? 'Decline' : 'Approve'}
                </Button>
            </DialogFooter>
        </form>
    );
}

export function CancelDialog({ open, onOpenChange, item }: Open & { item: RequestItem | null }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">{open && item && <CancelForm item={item} onDone={() => onOpenChange(false)} />}</DialogContent>
        </Dialog>
    );
}

function CancelForm({ item, onDone }: { item: RequestItem; onDone: () => void }) {
    const form = useForm({ reason: '' });
    const approvedLeave = item.status === 'approved';
    const error = Object.values(form.errors as Record<string, string>)[0];

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.post(`${base(item)}/cancel`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle>{approvedLeave ? 'Cancel approved leave?' : 'Withdraw this request?'}</DialogTitle>
                <DialogDescription>
                    {item.title} · {fmtRange(item.date_from, item.date_to)}
                </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
                {approvedLeave
                    ? 'The credits go back to the balance and the dates are removed from the time record (unless payroll has locked them).'
                    : item.kind === 'leave'
                      ? 'The credits on hold are released.'
                      : 'It disappears from the approver’s inbox.'}
            </p>
            {item.source === 'leave' && (
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Reason (optional)</Label>
                    <Textarea value={form.data.reason} onChange={(e) => form.setData('reason', e.target.value)} rows={2} maxLength={255} />
                </div>
            )}
            {error && <InputError message={error} />}
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Keep it
                </Button>
                <Button type="submit" variant="destructive" disabled={form.processing}>
                    {form.processing && <Loader2 className="size-4 animate-spin" />}
                    {approvedLeave ? 'Cancel leave' : 'Withdraw'}
                </Button>
            </DialogFooter>
        </form>
    );
}
