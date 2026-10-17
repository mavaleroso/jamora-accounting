<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\ShiftRoster;
use App\Models\ShiftTemplate;
use App\Services\People\AttendanceCalculator;
use App\Services\People\EmployeeResolver;
use App\Support\EntityContext;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class ShiftRosterController extends Controller
{
    public function __construct(
        protected AttendanceCalculator $attendanceCalculator,
        protected EmployeeResolver $employeeResolver
    ) {}

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $weekStartInput = $request->get('week_start');

        $startOfWeek = $weekStartInput
            ? Carbon::parse($weekStartInput)->startOfWeek()
            : Carbon::now()->startOfWeek();

        $endOfWeek = (clone $startOfWeek)->endOfWeek();

        // Staff who neither schedule nor pay the team only ever see their own week.
        if (! $request->user()->canAny(['roster.manage', 'payroll.view', 'payroll.manage'])) {
            return $this->mySchedule($request, $entityId, $startOfWeek, $endOfWeek);
        }

        // 7 days of the week with holiday metadata
        $days = [];
        for ($i = 0; $i < 7; $i++) {
            $currentDay = (clone $startOfWeek)->addDays($i);
            $holiday = $this->attendanceCalculator->holidayFor($entityId, $currentDay);
            $days[] = [
                'date' => $currentDay->toDateString(),
                'dayName' => $currentDay->format('D'),
                'fullDate' => $currentDay->format('M d, Y'),
                'isToday' => $currentDay->isToday(),
                'holiday' => $holiday ? [
                    'name' => $holiday->name,
                    'type' => $holiday->type,
                ] : null,
            ];
        }

        $employees = Employee::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->with(['defaultShiftTemplate'])
            ->orderBy('lastname')
            ->get(['id', 'employee_code', 'firstname', 'lastname', 'position', 'department', 'default_shift_template_id', 'rest_days']);

        $shiftTemplates = ShiftTemplate::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->orderBy('name')
            ->get();

        $rosters = ShiftRoster::query()
            ->where('entity_id', $entityId)
            ->whereBetween('roster_date', [$startOfWeek->toDateString(), $endOfWeek->toDateString()])
            ->with('template')
            ->get();

        // Active approved leaves in this period to warn managers of conflicts
        $leaves = LeaveRequest::query()
            ->where('entity_id', $entityId)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->where(function ($q) use ($startOfWeek, $endOfWeek) {
                $q->whereBetween('start_date', [$startOfWeek->toDateString(), $endOfWeek->toDateString()])
                    ->orWhereBetween('end_date', [$startOfWeek->toDateString(), $endOfWeek->toDateString()])
                    ->orWhere(function ($sub) use ($startOfWeek, $endOfWeek) {
                        $sub->where('start_date', '<=', $startOfWeek->toDateString())
                            ->where('end_date', '>=', $endOfWeek->toDateString());
                    });
            })
            ->with('type')
            ->get();

        $rosterMatrix = [];
        $totalShifts = 0;
        $publishedCount = 0;
        $draftCount = 0;

        foreach ($employees as $employee) {
            $empShifts = [];
            $restDays = $employee->restDayNumbers();

            foreach ($days as $day) {
                $dateStr = $day['date'];
                $shift = $rosters->first(function ($r) use ($employee, $dateStr) {
                    return $r->employee_id === $employee->id && $r->roster_date->toDateString() === $dateStr;
                });

                // Check leave conflict
                $leaveConflict = $leaves->first(function ($l) use ($employee, $dateStr) {
                    return $l->employee_id === $employee->id
                        && $l->start_date <= $dateStr
                        && $l->end_date >= $dateStr;
                });

                $isEmployeeRestDay = in_array(Carbon::parse($dateStr)->dayOfWeek, $restDays, true);

                if ($shift) {
                    $totalShifts++;
                    if ($shift->status === ShiftRoster::STATUS_PUBLISHED) {
                        $publishedCount++;
                    } else {
                        $draftCount++;
                    }

                    $empShifts[$dateStr] = [
                        'id' => $shift->id,
                        'shift_template_id' => $shift->shift_template_id,
                        'shift_name' => $shift->shift_name,
                        'shift_start' => $shift->shift_start,
                        'shift_end' => $shift->shift_end,
                        'break_minutes' => $shift->break_minutes,
                        'grace_minutes' => $shift->grace_minutes,
                        'is_rest_day' => (bool) $shift->is_rest_day,
                        'status' => $shift->status,
                        'notes' => $shift->notes,
                        'leave_conflict' => $leaveConflict ? [
                            'type' => $leaveConflict->type?->name ?? 'Leave',
                            'reason' => $leaveConflict->reason,
                        ] : null,
                    ];
                } else {
                    $defaultTpl = $employee->defaultShiftTemplate;
                    $empShifts[$dateStr] = [
                        'id' => null,
                        'shift_template_id' => $defaultTpl?->id,
                        'shift_name' => $isEmployeeRestDay ? 'Rest Day' : ($defaultTpl?->name ?? 'Regular Shift (8:00 AM - 5:00 PM)'),
                        'shift_start' => $isEmployeeRestDay ? null : ($defaultTpl?->start_time ?? '08:00:00'),
                        'shift_end' => $isEmployeeRestDay ? null : ($defaultTpl?->end_time ?? '17:00:00'),
                        'break_minutes' => $defaultTpl?->break_minutes ?? 60,
                        'grace_minutes' => $defaultTpl?->grace_minutes ?? 5,
                        'is_rest_day' => $isEmployeeRestDay,
                        'status' => 'draft',
                        'notes' => null,
                        'leave_conflict' => $leaveConflict ? [
                            'type' => $leaveConflict->type?->name ?? 'Leave',
                            'reason' => $leaveConflict->reason,
                        ] : null,
                    ];
                }
            }

            $rosterMatrix[] = [
                'employee' => [
                    'id' => $employee->id,
                    'code' => $employee->employee_code,
                    'name' => $employee->name,
                    'position' => $employee->position,
                    'department' => $employee->department,
                ],
                'shifts' => $empShifts,
            ];
        }

        return Inertia::render('employee-management/roster/page', [
            'days' => $days,
            'weekStart' => $startOfWeek->toDateString(),
            'weekEnd' => $endOfWeek->toDateString(),
            'employees' => $employees,
            'shiftTemplates' => $shiftTemplates,
            'rosterMatrix' => $rosterMatrix,
            'summary' => [
                'totalShifts' => $totalShifts,
                'publishedCount' => $publishedCount,
                'draftCount' => $draftCount,
            ],
        ]);
    }

    /**
     * "My Schedule": one employee's week as the time clock will see it (published roster > shift
     * template > company default) with their holidays, approved leave and official business. Draft
     * shifts and colleagues' schedules or leave are never sent.
     */
    private function mySchedule(Request $request, int $entityId, Carbon $startOfWeek, Carbon $endOfWeek): Response
    {
        $user = $request->user();
        $today = Carbon::today();
        $employee = $this->employeeResolver->forUser($user, $entityId);

        $shared = [
            'weekStart' => $startOfWeek->toDateString(),
            'weekEnd' => $endOfWeek->toDateString(),
            'today' => $today->toDateString(),
            'can' => [
                'fileLeave' => $user->can('leave.file'),
                'fileAttendance' => $user->canAny(['attendance.view', 'attendance.punch']),
            ],
        ];

        if (! $employee) {
            return Inertia::render('employee-management/roster/my-schedule', [...$shared, 'employee' => null]);
        }

        $from = $startOfWeek->toDateString();
        $to = $endOfWeek->toDateString();

        $rosters = ShiftRoster::query()
            ->where('employee_id', $employee->id)
            ->where('status', ShiftRoster::STATUS_PUBLISHED)
            ->whereBetween('roster_date', [$from, $to])
            ->get(['id', 'roster_date', 'notes', 'published_at'])
            ->keyBy(fn (ShiftRoster $r) => $r->roster_date->toDateString());

        $leaves = LeaveRequest::query()
            ->with('type:id,code,name')
            ->where('employee_id', $employee->id)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->whereDate('start_date', '<=', $to)
            ->whereDate('end_date', '>=', $from)
            ->get();

        $business = AttendanceRequest::query()
            ->where('employee_id', $employee->id)
            ->where('request_type', AttendanceRequest::TYPE_OFFICIAL_BUSINESS)
            ->where('status', 'approved')
            ->whereBetween('work_date', [$from, $to])
            ->get()
            ->keyBy(fn (AttendanceRequest $a) => $a->work_date->toDateString());

        // A shift counts as "updated" when it was (re)published within the last week.
        $recentSince = $today->copy()->subDays(7);

        $days = collect(CarbonPeriod::create($startOfWeek, $endOfWeek))->map(function (Carbon $date) use ($employee, $rosters, $leaves, $business, $recentSince, $today) {
            $d = $date->toDateString();
            $schedule = $this->attendanceCalculator->scheduleFor($employee, $date);
            $holiday = $this->attendanceCalculator->holidayFor($employee->entity_id, $date);
            $leave = $leaves->first(fn (LeaveRequest $l) => $l->start_date->toDateString() <= $d && $l->end_date->toDateString() >= $d);
            $ob = $business->get($d);
            $roster = $rosters->get($d);

            $minutes = 0;
            if (! $schedule->isRestDay && $schedule->start && $schedule->end) {
                $start = Carbon::parse("{$d} {$schedule->start}");
                $end = Carbon::parse("{$d} {$schedule->end}");
                if ($end->lte($start)) {
                    $end->addDay(); // overnight shift
                }
                $minutes = max(0, (int) $start->diffInMinutes($end) - $schedule->breakMinutes);
            }
            if ($leave) {
                $minutes = $leave->half_day ? intdiv($minutes, 2) : 0;
            }

            return [
                'date' => $d,
                'is_today' => $date->isSameDay($today),
                'is_past' => $date->lt($today),
                'shift_name' => $schedule->shiftName,
                'start' => $schedule->start,
                'end' => $schedule->end,
                'break_minutes' => $schedule->isRestDay ? 0 : $schedule->breakMinutes,
                'grace_minutes' => $schedule->isRestDay ? 0 : $schedule->graceMinutes,
                'is_rest_day' => $schedule->isRestDay,
                'source' => $schedule->source,
                'scheduled_minutes' => $minutes,
                'notes' => $roster?->notes,
                'updated_at' => $roster?->published_at?->toIso8601String(),
                'recently_updated' => (bool) $roster?->published_at?->gte($recentSince),
                'holiday' => $holiday ? ['name' => $holiday->name, 'type' => $holiday->type] : null,
                'leave' => $leave ? ['title' => $leave->type?->name ?? 'Leave', 'half_day' => (bool) $leave->half_day] : null,
                'official_business' => $ob ? ['destination' => $ob->destination, 'from' => $ob->requested_time_in, 'to' => $ob->requested_time_out] : null,
            ];
        })->values();

        $workDays = $days->filter(fn (array $day) => $day['scheduled_minutes'] > 0)->count();

        return Inertia::render('employee-management/roster/my-schedule', [
            ...$shared,
            'employee' => $employee->only(['id', 'employee_code', 'name', 'position', 'department']),
            'days' => $days->all(),
            'summary' => [
                'scheduledMinutes' => $days->sum('scheduled_minutes'),
                'workDays' => $workDays,
                'restDays' => $days->where('is_rest_day', true)->whereNull('leave')->count(),
                'leaveDays' => $days->sum(fn (array $day) => $day['leave'] ? ($day['leave']['half_day'] ? 0.5 : 1) : 0),
                'holidays' => $days->whereNotNull('holiday')->count(),
            ],
            'lastUpdated' => $rosters->max('published_at')?->toIso8601String(),
            'recentlyUpdated' => $days->contains('recently_updated', true),
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();

        if ($request->has('date') && ! $request->has('roster_date')) {
            $request->merge(['roster_date' => $request->input('date')]);
        }

        $template = ! empty($request->input('shift_template_id'))
            ? ShiftTemplate::where(function ($q) use ($entityId) {
                $q->where('entity_id', $entityId)->orWhereNull('entity_id');
            })->find($request->input('shift_template_id'))
            : null;

        if ($template && ! $request->filled('shift_name')) {
            $request->merge(['shift_name' => $template->name]);
        }

        $validated = $request->validate([
            'employee_id' => ['required', Rule::exists('employees', 'id')->where('entity_id', $entityId)],
            'roster_date' => ['required', 'date'],
            'shift_template_id' => ['nullable', 'exists:shift_templates,id'],
            'shift_name' => ['required', 'string', 'max:100'],
            'shift_start' => ['nullable', 'date_format:H:i,H:i:s'],
            'shift_end' => ['nullable', 'date_format:H:i,H:i:s'],
            'break_minutes' => ['nullable', 'integer', 'min:0', 'max:240'],
            'grace_minutes' => ['nullable', 'integer', 'min:0', 'max:60'],
            'is_rest_day' => ['boolean'],
            'status' => ['nullable', 'in:draft,published'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $this->assertDayOpen((int) $validated['employee_id'], $validated['roster_date']);

        $isRestDay = (bool) ($validated['is_rest_day'] ?? false);
        $status = $validated['status'] ?? ShiftRoster::STATUS_PUBLISHED;

        $startTime = $isRestDay ? null : ($validated['shift_start'] ?? $template?->start_time ?? '08:00:00');
        $endTime = $isRestDay ? null : ($validated['shift_end'] ?? $template?->end_time ?? '17:00:00');
        $breakMin = $isRestDay ? 0 : ($validated['break_minutes'] ?? $template?->break_minutes ?? 60);
        $graceMin = $isRestDay ? 0 : ($validated['grace_minutes'] ?? $template?->grace_minutes ?? 5);

        ShiftRoster::updateOrCreate(
            [
                'employee_id' => $validated['employee_id'],
                'roster_date' => $validated['roster_date'],
            ],
            [
                'entity_id' => $entityId,
                'shift_template_id' => $template?->id,
                'shift_name' => $isRestDay ? 'Rest Day' : $validated['shift_name'],
                'shift_start' => $startTime ? Carbon::parse($startTime)->format('H:i:s') : null,
                'shift_end' => $endTime ? Carbon::parse($endTime)->format('H:i:s') : null,
                'break_minutes' => $breakMin,
                'grace_minutes' => $graceMin,
                'is_rest_day' => $isRestDay,
                'status' => $status,
                'published_at' => $status === ShiftRoster::STATUS_PUBLISHED ? now() : null,
                'published_by' => $status === ShiftRoster::STATUS_PUBLISHED ? $request->user()?->id : null,
                'notes' => $validated['notes'] ?? null,
            ]
        );
        $this->recomputeDays((int) $validated['employee_id'], $validated['roster_date'], $validated['roster_date']);

        return redirect()->back()->with('status', 'Shift updated successfully.');
    }

    public function publish(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $weekStart = $request->get('week_start', Carbon::now()->startOfWeek()->toDateString());
        $endOfWeek = Carbon::parse($weekStart)->endOfWeek()->toDateString();

        ShiftRoster::where('entity_id', $entityId)
            ->whereBetween('roster_date', [$weekStart, $endOfWeek])
            ->update([
                'status' => ShiftRoster::STATUS_PUBLISHED,
                'published_at' => now(),
                'published_by' => $request->user()?->id,
            ]);
        $this->recomputeDays(null, $weekStart, $endOfWeek);

        return redirect()->back()->with('status', 'Roster for this week has been published.');
    }

    public function destroy(ShiftRoster $roster, EntityContext $entityContext): RedirectResponse
    {
        if ($roster->entity_id !== $entityContext->id()) {
            abort(403);
        }

        $this->assertDayOpen($roster->employee_id, $roster->roster_date->toDateString());
        $roster->delete();
        $this->recomputeDays($roster->employee_id, $roster->roster_date->toDateString(), $roster->roster_date->toDateString());

        return redirect()->back()->with('status', 'Shift assignment removed.');
    }

    /**
     * Copy schedule from the previous week into the current week.
     */
    public function copyPreviousWeek(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $targetWeekStart = Carbon::parse($request->input('week_start', now()->startOfWeek()->toDateString()))->startOfWeek();
        $sourceWeekStart = (clone $targetWeekStart)->subWeek();

        $sourceRosters = ShiftRoster::where('entity_id', $entityId)
            ->whereBetween('roster_date', [$sourceWeekStart->toDateString(), (clone $sourceWeekStart)->endOfWeek()->toDateString()])
            ->get();

        if ($sourceRosters->isEmpty()) {
            return redirect()->back()->withErrors(['week_start' => 'No roster shifts found in the previous week to copy.']);
        }

        foreach ($sourceRosters as $src) {
            // Carbon 3 diffs are signed: measure from the week start forward so the offset is 0–6.
            $dayOffset = (int) $sourceWeekStart->diffInDays(Carbon::parse($src->roster_date));
            $targetDate = (clone $targetWeekStart)->addDays($dayOffset)->toDateString();

            ShiftRoster::updateOrCreate(
                [
                    'employee_id' => $src->employee_id,
                    'roster_date' => $targetDate,
                ],
                [
                    'entity_id' => $entityId,
                    'shift_template_id' => $src->shift_template_id,
                    'shift_name' => $src->shift_name,
                    'shift_start' => $src->shift_start,
                    'shift_end' => $src->shift_end,
                    'break_minutes' => $src->break_minutes,
                    'grace_minutes' => $src->grace_minutes,
                    'is_rest_day' => $src->is_rest_day,
                    'status' => ShiftRoster::STATUS_DRAFT, // pasted as draft so manager can review before publish
                    'notes' => $src->notes ? "Copied: {$src->notes}" : 'Copied from previous week',
                ]
            );
        }

        return redirect()->back()->with('status', 'Previous week roster copied as drafts. Review and publish when ready.');
    }

    /**
     * A day already paid by an approved payroll keeps the schedule it was paid on.
     */
    private function assertDayOpen(int $employeeId, string $date): void
    {
        $locked = DtrEntry::query()
            ->where('employee_id', $employeeId)
            ->whereDate('work_date', $date)
            ->where('status', DtrEntry::STATUS_LOCKED)
            ->exists();

        if ($locked) {
            throw ValidationException::withMessages(['roster_date' => 'Payroll for this day is already approved, so its shift can no longer change.']);
        }
    }

    /**
     * Re-run lateness, undertime and overtime for time records already on these days, against the new schedule.
     */
    private function recomputeDays(?int $employeeId, string $from, string $to): void
    {
        DtrEntry::query()
            ->whereBetween('work_date', [$from, $to])
            ->when($employeeId, fn ($q) => $q->where('employee_id', $employeeId))
            ->where('status', '!=', DtrEntry::STATUS_LOCKED)
            ->get()
            ->each(fn (DtrEntry $dtr) => $this->attendanceCalculator->compute($dtr)->save());
    }

    public function storeTemplate(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:50'],
            'name' => ['required', 'string', 'max:100'],
            'start_time' => ['required', 'string'],
            'end_time' => ['required', 'string'],
            'break_minutes' => ['nullable', 'integer', 'min:0', 'max:300'],
            'grace_minutes' => ['nullable', 'integer', 'min:0', 'max:120'],
            'color' => ['nullable', 'string', 'max:20'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        ShiftTemplate::updateOrCreate(
            [
                'entity_id' => $entityId,
                'code' => $validated['code'],
            ],
            [
                'name' => $validated['name'],
                'start_time' => Carbon::parse($validated['start_time'])->format('H:i:s'),
                'end_time' => Carbon::parse($validated['end_time'])->format('H:i:s'),
                'break_minutes' => $validated['break_minutes'] ?? 60,
                'grace_minutes' => $validated['grace_minutes'] ?? 5,
                'color' => $validated['color'] ?? '#3b82f6',
                'is_active' => $validated['is_active'] ?? true,
            ]
        );

        return redirect()->back()->with('status', 'Shift template saved successfully.');
    }

    public function destroyTemplate(ShiftTemplate $template, EntityContext $entityContext): RedirectResponse
    {
        if ($template->entity_id && $template->entity_id !== $entityContext->id()) {
            abort(403);
        }

        $template->delete();

        return redirect()->back()->with('status', 'Shift template removed.');
    }
}
