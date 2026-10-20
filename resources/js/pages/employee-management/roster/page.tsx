import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Calendar,
    ChevronLeft,
    ChevronRight,
    Clock,
    Coffee,
    FileCheck2,
    Plus,
    UserCheck,
    Users,
} from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { useConfirm } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { hasAnyPermission } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import type { Auth, BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management' },
    { title: 'Shift & Roster', href: '/employee-management/roster' },
];

type DayInfo = {
    date: string;
    dayName: string;
    fullDate: string;
    isToday: boolean;
};

type ShiftData = {
    id: number | null;
    /** The library shift the day was made with, if any. */
    shift_template_id?: number | null;
    break_minutes?: number;
    grace_minutes?: number;
    shift_name: string;
    shift_start: string | null;
    shift_end: string | null;
    is_rest_day: boolean;
    status: string;
    notes: string | null;
};

type EmployeeInfo = {
    id: number;
    code: string;
    name: string;
    position: string;
};

type RosterRow = {
    employee: EmployeeInfo;
    shifts: Record<string, ShiftData>;
};

type Props = {
    days: DayInfo[];
    weekStart: string;
    weekEnd: string;
    employees: Array<{
        id: number;
        employee_code: string;
        firstname: string;
        lastname: string;
        position: string;
    }>;
    rosterMatrix: RosterRow[];
    /** The shift everyone works unless rostered otherwise: the company default in Libraries › Shifts. */
    defaultShift: { id?: number | null; name: string; start: string; end: string; break_minutes?: number; grace_minutes?: number };
    /** The company's active shifts (Libraries › Shifts), the default first: offered as presets. */
    shiftTemplates?: LibraryShift[];
    canManageShifts?: boolean;
};

type LibraryShift = {
    id: number;
    code: string;
    name: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    grace_minutes: number;
    color: string | null;
    is_default: boolean;
};

const REST_PRESET = 'rest';

/** "13:05:00" → "1:05 PM" */
const clock = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function ShiftRosterPage({
    days,
    weekStart,
    weekEnd,
    employees,
    rosterMatrix,
    defaultShift,
    shiftTemplates = [],
    canManageShifts = false,
}: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canManageRoster = hasAnyPermission(auth, ['roster.manage', 'payroll.manage']);

    const [isShiftModalOpen, setIsShiftModalOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const confirm = useConfirm();

    // Form state
    const [formState, setFormState] = React.useState({
        employee_id: employees[0]?.id ? String(employees[0].id) : '',
        roster_date: days[0]?.date || new Date().toISOString().split('T')[0],
        // The library shift picked, if any; typing other hours makes it a custom shift for the day.
        shift_template_id: defaultShift.id ? String(defaultShift.id) : '',
        shift_name: defaultShift.name,
        shift_start: defaultShift.start.substring(0, 5),
        shift_end: defaultShift.end.substring(0, 5),
        break_minutes: defaultShift.break_minutes ?? 60,
        grace_minutes: defaultShift.grace_minutes ?? 5,
        is_rest_day: false,
        notes: '',
    });

    // The company's shifts from Libraries › Shifts (else its default shift), or a rest day. Other hours for a day can
    // still be typed in.
    const libraryShifts: LibraryShift[] = shiftTemplates.length
        ? shiftTemplates
        : [
              {
                  id: 0,
                  code: 'DEFAULT',
                  name: defaultShift.name,
                  start_time: defaultShift.start,
                  end_time: defaultShift.end,
                  break_minutes: defaultShift.break_minutes ?? 60,
                  grace_minutes: defaultShift.grace_minutes ?? 5,
                  color: null,
                  is_default: true,
              },
          ];
    const shiftPresets = [
        ...libraryShifts.map((s) => ({
            key: String(s.id),
            label: `${s.name} (${clock(s.start_time)} – ${clock(s.end_time)})${s.is_default ? ' · default' : ''}`,
            templateId: s.id ? String(s.id) : '',
            name: s.name,
            start: s.start_time.substring(0, 5),
            end: s.end_time.substring(0, 5),
            breakMinutes: s.break_minutes,
            graceMinutes: s.grace_minutes,
            isRest: false,
        })),
        {
            key: REST_PRESET,
            label: 'Scheduled Rest Day / Day Off',
            templateId: '',
            name: 'Rest Day',
            start: '',
            end: '',
            breakMinutes: 0,
            graceMinutes: 0,
            isRest: true,
        },
    ];
    // The preset matching the form: rest day, the library shift picked, or none (custom hours).
    const presetValue = formState.is_rest_day
        ? REST_PRESET
        : shiftPresets.find((p) => !p.isRest && p.templateId === formState.shift_template_id && p.start === formState.shift_start && p.end === formState.shift_end)?.key ?? '';

    const handleNavigateWeek = (direction: 'prev' | 'next' | 'current') => {
        if (direction === 'current') {
            router.get('/employee-management/roster', {}, { preserveState: true });
            return;
        }

        const currentStart = new Date(weekStart);
        const deltaDays = direction === 'next' ? 7 : -7;
        currentStart.setDate(currentStart.getDate() + deltaDays);
        const newStartStr = currentStart.toISOString().split('T')[0];

        router.get(
            '/employee-management/roster',
            { week_start: newStartStr },
            { preserveState: true }
        );
    };

    const handleOpenCell = (employee: EmployeeInfo, date: string, shift: ShiftData) => {
        setFormState({
            employee_id: String(employee.id),
            roster_date: date,
            shift_template_id: shift.shift_template_id ? String(shift.shift_template_id) : '',
            shift_name: shift.shift_name || defaultShift.name,
            shift_start: (shift.shift_start ?? defaultShift.start).substring(0, 5),
            shift_end: (shift.shift_end ?? defaultShift.end).substring(0, 5),
            break_minutes: shift.break_minutes ?? defaultShift.break_minutes ?? 60,
            grace_minutes: shift.grace_minutes ?? defaultShift.grace_minutes ?? 5,
            is_rest_day: shift.is_rest_day,
            notes: shift.notes || '',
        });
        setIsShiftModalOpen(true);
    };

    const handlePresetChange = (key: string) => {
        const found = shiftPresets.find((p) => p.key === key);
        if (found) {
            setFormState((prev) => ({
                ...prev,
                shift_template_id: found.templateId,
                shift_name: found.name,
                shift_start: found.start,
                shift_end: found.end,
                break_minutes: found.breakMinutes,
                grace_minutes: found.graceMinutes,
                is_rest_day: found.isRest,
            }));
        }
    };

    const handleSaveShift = async (e: React.FormEvent) => {
        e.preventDefault();
        const emp = employees.find((x) => String(x.id) === formState.employee_id);
        const ok = await confirm({
            title: 'Save this schedule?',
            description: `${emp ? `${emp.firstname} ${emp.lastname}` : 'The employee'} is scheduled ${formState.is_rest_day ? 'as a rest day' : `for ${formState.shift_start}–${formState.shift_end}`} on ${formState.roster_date}.`,
            confirmLabel: 'Save schedule',
        });
        if (!ok) return;
        setIsSubmitting(true);

        router.post('/employee-management/roster', formState, {
            onSuccess: () => {
                toast.success('Roster schedule updated.');
                setIsShiftModalOpen(false);
            },
            onError: () => toast.error('Failed to update roster.'),
            onFinish: () => setIsSubmitting(false),
        });
    };

    const handlePublishRoster = async () => {
        const ok = await confirm({
            title: 'Publish this week’s roster?',
            description: `Schedules for ${weekStart} to ${weekEnd} become visible to employees in their portal.`,
            confirmLabel: 'Publish roster',
        });
        if (!ok) return;
        setIsSubmitting(true);
        router.post(
            '/employee-management/roster/publish',
            { week_start: weekStart, week_end: weekEnd },
            {
                onSuccess: () => toast.success('Weekly roster published to employee portal.'),
                onError: () => toast.error('Failed to publish roster.'),
                onFinish: () => setIsSubmitting(false),
            }
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Shift & Roster Management" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <Heading
                            title="Shift & Roster Management"
                            description="Slide 49-50: Weekly roster schedule, clinic operating hours, and rest day assignments."
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => handleNavigateWeek('prev')}
                            size="icon"
                            title="Previous week"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleNavigateWeek('current')}
                            className="text-xs"
                        >
                            Current Week
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleNavigateWeek('next')}
                            size="icon"
                            title="Next week"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>

                        {canManageShifts && (
                            <Button variant="outline" asChild className="gap-1.5">
                                <Link href="/libraries/shifts">
                                    <Clock className="h-4 w-4" />
                                    Shifts
                                </Link>
                            </Button>
                        )}

                        <Button
                            variant="secondary"
                            onClick={handlePublishRoster}
                            disabled={isSubmitting}
                            className="gap-1.5"
                        >
                            <FileCheck2 className="h-4 w-4 text-emerald-600" />
                            Publish Roster
                        </Button>

                        <Button
                            onClick={() => setIsShiftModalOpen(true)}
                            className="gap-1.5 shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            Assign Shift
                        </Button>
                    </div>
                </div>

                {/* Week Label Card */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3 shadow-xs">
                    <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        <span className="font-semibold text-sm">
                            Schedule Week: {days[0]?.fullDate} &mdash; {days[6]?.fullDate}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Active Shift
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> Rest Day
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="h-2.5 w-2.5 rounded-full bg-primary"></span> Today
                        </span>
                    </div>
                </div>

                {/* Schedule Grid Table */}
                <Card className="border-border/80 shadow-xs">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="min-w-[900px]">
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableHead className="w-[200px] sticky left-0 z-10 bg-card border-r border-border">
                                            Employee
                                        </TableHead>
                                        {days.map((d) => (
                                            <TableHead
                                                key={d.date}
                                                className={`text-center font-medium ${
                                                    d.isToday ? 'bg-primary/10 text-primary font-bold' : ''
                                                }`}
                                            >
                                                <div className="text-xs uppercase">{d.dayName}</div>
                                                <div className="text-[11px] font-mono text-muted-foreground">
                                                    {d.date.substring(5)}
                                                </div>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rosterMatrix.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                                No employees found in this entity.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        rosterMatrix.map(({ employee, shifts }) => (
                                            <TableRow key={employee.id} className="hover:bg-muted/20">
                                                <TableCell className="sticky left-0 z-10 bg-card border-r border-border font-medium">
                                                    <div className="font-semibold text-xs">{employee.name}</div>
                                                    <div className="text-[11px] text-muted-foreground">
                                                        {employee.position}
                                                    </div>
                                                </TableCell>

                                                {days.map((day) => {
                                                    const shift = shifts[day.date];
                                                    const isRest = shift?.is_rest_day;

                                                    return (
                                                        <TableCell
                                                            key={day.date}
                                                            onClick={() => handleOpenCell(employee, day.date, shift)}
                                                            className={`p-2 text-center cursor-pointer transition-colors hover:bg-muted/40 ${
                                                                day.isToday ? 'bg-primary/5' : ''
                                                            }`}
                                                        >
                                                            {isRest ? (
                                                                <div className="flex flex-col items-center justify-center rounded-md border border-amber-500/20 bg-amber-500/10 p-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                                                                    <Coffee className="h-3.5 w-3.5 mb-0.5" />
                                                                    <span className="font-semibold">REST DAY</span>
                                                                </div>
                                                            ) : shift?.shift_start ? (
                                                                <div className="flex flex-col items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 p-1.5 text-[11px] text-emerald-800 dark:text-emerald-300">
                                                                    <div className="font-semibold truncate max-w-[100px]">
                                                                        {shift.shift_name}
                                                                    </div>
                                                                    <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                                                                        <Clock className="h-3 w-3" />
                                                                        {shift.shift_start.substring(0, 5)} - {shift.shift_end?.substring(0, 5)}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="rounded-md border border-dashed border-border p-2 text-[11px] text-muted-foreground hover:border-primary/50">
                                                                    + Add Shift
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                    );
                                                })}
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Modal: Assign / Edit Shift */}
            <Dialog open={isShiftModalOpen} onOpenChange={setIsShiftModalOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <form onSubmit={handleSaveShift}>
                        <DialogHeader>
                            <DialogTitle>Assign Shift Schedule</DialogTitle>
                            <DialogDescription>
                                Set roster working hours or mark rest day for this date.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="employee_id">Employee *</Label>
                                <Select
                                    value={formState.employee_id}
                                    onValueChange={(val) => setFormState({ ...formState, employee_id: val })}
                                >
                                    <SelectTrigger id="employee_id">
                                        <SelectValue placeholder="Select employee" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {employees.map((emp) => (
                                            <SelectItem key={emp.id} value={String(emp.id)}>
                                                {emp.firstname} {emp.lastname} ({emp.position})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="roster_date">Date *</Label>
                                <Input
                                    id="roster_date"
                                    type="date"
                                    value={formState.roster_date}
                                    onChange={(e) => setFormState({ ...formState, roster_date: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Shift</Label>
                                <Select value={presetValue} onValueChange={handlePresetChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Custom hours" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {shiftPresets.map((p) => (
                                            <SelectItem key={p.key} value={p.key}>
                                                {p.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {canManageShifts && (
                                    <p className="text-xs text-muted-foreground">
                                        Shifts come from{' '}
                                        <Link href="/libraries/shifts" className="underline underline-offset-2">
                                            Libraries › Shifts
                                        </Link>
                                        .
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-border p-3">
                                <div>
                                    <Label htmlFor="is_rest_day" className="font-semibold">Rest Day</Label>
                                    <p className="text-xs text-muted-foreground">Mark this day as employee's scheduled rest day</p>
                                </div>
                                <Switch
                                    id="is_rest_day"
                                    checked={formState.is_rest_day}
                                    onCheckedChange={(checked) =>
                                        setFormState({
                                            ...formState,
                                            is_rest_day: checked,
                                            shift_name: checked ? 'Rest Day' : formState.shift_name,
                                            shift_template_id: checked ? '' : formState.shift_template_id,
                                        })
                                    }
                                />
                            </div>

                            {!formState.is_rest_day && (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="shift_name">Shift Title *</Label>
                                        <Input
                                            id="shift_name"
                                            value={formState.shift_name}
                                            onChange={(e) => setFormState({ ...formState, shift_name: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="shift_start">Start Time *</Label>
                                            <Input
                                                id="shift_start"
                                                type="time"
                                                value={formState.shift_start}
                                                onChange={(e) => setFormState({ ...formState, shift_start: e.target.value, shift_template_id: '' })}
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="shift_end">End Time *</Label>
                                            <Input
                                                id="shift_end"
                                                type="time"
                                                value={formState.shift_end}
                                                onChange={(e) => setFormState({ ...formState, shift_end: e.target.value, shift_template_id: '' })}
                                                required
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes / Coverage</Label>
                                <Input
                                    id="notes"
                                    placeholder="e.g. Covering for clinic optometrist"
                                    value={formState.notes}
                                    onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsShiftModalOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : 'Save Shift'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}

