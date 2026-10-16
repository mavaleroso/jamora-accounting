import InputError from '@/components/input-error';
import { richTextClass, RichTextEditor } from '@/components/rich-text-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableShell } from '@/components/ui/table-shell';
import { cn } from '@/lib/utils';
import { useForm } from '@inertiajs/react';
import { Briefcase, Loader2, Lock, NotebookPen, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import {
    ATTENDANCE_URL,
    fmtDate,
    fmtHours,
    fmtMinutes,
    fmtTime,
    htmlToText,
    periodOptions,
    RECORD_STATUS,
    TONE,
    weekday,
    type AccomplishmentRow,
    type Accomplishments,
    type Filters,
    type PayPeriodOption,
} from '../lib';

type Props = {
    data: Accomplishments;
    periods: PayPeriodOption[];
    filters: Filters;
    today: string;
    onFilter: (changes: Partial<Filters>) => void;
};

/**
 * The employee's accomplishment report: every day of a pay period with what was written. Days in the
 * current pay period that are not yet approved can be written or changed, including official business
 * days, which have no check-out to write them at.
 */
export function AccomplishmentReport({ data, periods, filters, today, onFilter }: Props) {
    const [editing, setEditing] = React.useState<AccomplishmentRow | null>(null);
    const options = React.useMemo(() => periodOptions(periods, today), [periods, today]);
    const active = options.find((p) => p.from === filters.date_from && p.to === filters.date_to)?.id;

    return (
        <div className="space-y-4">
            <div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3 shadow-sm">
                <Select
                    value={active}
                    onValueChange={(v) => {
                        const p = options.find((o) => o.id === v);
                        if (p) onFilter({ date_from: p.from, date_to: p.to });
                    }}
                >
                    <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Pay period">
                        <SelectValue placeholder="Pay period" />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                                {p.label}
                                {p.current && <span className="text-muted-foreground"> · current</span>}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                    You can write or change days from {fmtDate(data.window.from)} to {fmtDate(data.window.to)} until they are approved.
                </p>
                {data.missing > 0 && (
                    <Badge variant="outline" className={cn('ml-auto', TONE.amber)}>
                        {data.missing} day{data.missing > 1 ? 's' : ''} without an accomplishment
                    </Badge>
                )}
            </div>

            <TableShell>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/60 hover:bg-muted/60">
                                <TableHead colSpan={5} className="h-8 text-[11px] font-semibold tracking-wide uppercase">
                                    Daily time record
                                </TableHead>
                                <TableHead colSpan={3} className="h-8 border-l text-[11px] font-semibold tracking-wide uppercase">
                                    Accomplishment report
                                </TableHead>
                            </TableRow>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                <TableHead>Date</TableHead>
                                <TableHead>In</TableHead>
                                <TableHead>Break</TableHead>
                                <TableHead>Out</TableHead>
                                <TableHead className="text-right">Hours</TableHead>
                                <TableHead className="min-w-[320px] border-l">Accomplishment</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-10">
                                    <span className="sr-only">Actions</span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.rows.length === 0 ? (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={8} className="text-muted-foreground h-40 text-center text-sm">
                                        No worked days in this period.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                data.rows.map((r) => <Row key={r.date} row={r} onEdit={() => setEditing(r)} />)
                            )}
                        </TableBody>
                    </Table>
                </div>
            </TableShell>

            <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
                <DialogContent className="sm:max-w-3xl">{editing && <EditForm row={editing} onDone={() => setEditing(null)} />}</DialogContent>
            </Dialog>
        </div>
    );
}

function Row({ row: r, onEdit }: { row: AccomplishmentRow; onEdit: () => void }) {
    const written = !!htmlToText(r.accomplishment);
    const rec = r.status ? RECORD_STATUS[r.status] : null;
    const ob = r.official_business !== null;

    return (
        <TableRow className="align-top">
            <TableCell className="whitespace-nowrap">
                <div className="text-sm font-medium">{fmtDate(r.date)}</div>
                <div className="text-muted-foreground text-[11px]">{weekday(r.date)}</div>
                {ob && (
                    <Badge variant="outline" className={cn('mt-1 gap-1', TONE.emerald)} title={r.official_business || undefined}>
                        <Briefcase className="size-3" /> Official business
                    </Badge>
                )}
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{fmtTime(r.time_in)}</TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs whitespace-nowrap">
                {r.break_out ? `${fmtTime(r.break_out)} – ${fmtTime(r.break_in)}` : '—'}
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">{fmtTime(r.time_out)}</TableCell>
            <TableCell className="text-right font-mono text-xs whitespace-nowrap tabular-nums">
                {r.regular_hours !== null ? (
                    <>
                        <div className="font-semibold">{fmtHours(r.regular_hours)}</div>
                        {Number(r.ot_hours_approved) > 0 && (
                            <div className="text-[11px] text-emerald-600 dark:text-emerald-400">+{fmtHours(r.ot_hours_approved)} OT</div>
                        )}
                        {r.tardiness_minutes > 0 && (
                            <div className="text-[11px] text-rose-600 dark:text-rose-400">Late {fmtMinutes(r.tardiness_minutes)}</div>
                        )}
                        {r.undertime_minutes > 0 && (
                            <div className="text-[11px] text-rose-600 dark:text-rose-400">UT {fmtMinutes(r.undertime_minutes)}</div>
                        )}
                    </>
                ) : (
                    '—'
                )}
            </TableCell>
            <TableCell className="max-w-[520px] border-l whitespace-normal">
                {written ? (
                    <div className={cn(richTextClass, 'line-clamp-4')} dangerouslySetInnerHTML={{ __html: r.accomplishment! }} />
                ) : (
                    <span className={cn('text-sm', r.editable ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                        {r.editable ? 'Not written yet' : '—'}
                    </span>
                )}
            </TableCell>
            <TableCell className="whitespace-nowrap">
                {rec ? (
                    <Badge variant="outline" className={TONE[rec.tone]}>
                        {rec.label}
                    </Badge>
                ) : (
                    <span className="text-muted-foreground text-xs">No record yet</span>
                )}
                {!r.editable && r.locked_reason && (
                    <div className="text-muted-foreground mt-1 flex items-center gap-1 text-[11px]">
                        <Lock className="size-3" /> {r.locked_reason}
                    </div>
                )}
            </TableCell>
            <TableCell className="text-right">
                {r.editable && (
                    <Button size="sm" variant="outline" className="h-7 gap-1 px-2" onClick={onEdit}>
                        {written ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                        {written ? 'Edit' : 'Write'}
                    </Button>
                )}
            </TableCell>
        </TableRow>
    );
}

function EditForm({ row, onDone }: { row: AccomplishmentRow; onDone: () => void }) {
    const form = useForm({ work_date: row.date, accomplishment: row.accomplishment ?? '' });
    const errors = form.errors as Record<string, string | undefined>;

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                form.post(`${ATTENDANCE_URL}/accomplishments`, { preserveScroll: true, onSuccess: onDone });
            }}
        >
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <NotebookPen className="size-4" /> Accomplishment for {fmtDate(row.date, { weekday: 'long', month: 'long', day: 'numeric' })}
                </DialogTitle>
                <DialogDescription>
                    {row.official_business !== null
                        ? `Official business${row.official_business ? ` · ${row.official_business}` : ''}. Note what you got done while away.`
                        : 'Note what you got done that day. You can change it until your timekeeper approves the day.'}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
                <RichTextEditor
                    value={form.data.accomplishment}
                    onChange={(html) => form.setData('accomplishment', html)}
                    contentClassName="min-h-56 max-h-[50vh] overflow-y-auto"
                    placeholder="e.g. Fitted 6 walk-in patients, encoded lens orders, reconciled the cash drawer"
                    autoFocus
                />
                <InputError message={errors.accomplishment ?? errors.work_date} />
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!htmlToText(form.data.accomplishment) || form.processing}>
                    {form.processing && <Loader2 className="size-4 animate-spin" />}
                    Save
                </Button>
            </DialogFooter>
        </form>
    );
}
