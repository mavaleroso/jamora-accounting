<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\ShiftRoster;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ShiftRosterController extends Controller
{
    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $weekStartInput = $request->get('week_start');

        $startOfWeek = $weekStartInput
            ? Carbon::parse($weekStartInput)->startOfWeek()
            : Carbon::now()->startOfWeek();

        $endOfWeek = (clone $startOfWeek)->endOfWeek();

        // 7 days of the week
        $days = [];
        for ($i = 0; $i < 7; $i++) {
            $currentDay = (clone $startOfWeek)->addDays($i);
            $days[] = [
                'date' => $currentDay->toDateString(),
                'dayName' => $currentDay->format('D'),
                'fullDate' => $currentDay->format('M d, Y'),
                'isToday' => $currentDay->isToday(),
            ];
        }

        $employees = Employee::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->orderBy('lastname')
            ->get(['id', 'employee_code', 'firstname', 'lastname', 'position', 'department']);

        $rosters = ShiftRoster::query()
            ->where('entity_id', $entityId)
            ->whereBetween('roster_date', [$startOfWeek->toDateString(), $endOfWeek->toDateString()])
            ->get();

        $rosterMatrix = [];
        foreach ($employees as $employee) {
            $empShifts = [];
            foreach ($days as $day) {
                $shift = $rosters->first(function ($r) use ($employee, $day) {
                    return $r->employee_id === $employee->id && $r->roster_date->toDateString() === $day['date'];
                });

                $empShifts[$day['date']] = $shift ? [
                    'id' => $shift->id,
                    'shift_name' => $shift->shift_name,
                    'shift_start' => $shift->shift_start,
                    'shift_end' => $shift->shift_end,
                    'is_rest_day' => (bool) $shift->is_rest_day,
                    'status' => $shift->status,
                    'notes' => $shift->notes,
                ] : [
                    'id' => null,
                    'shift_name' => 'Regular Shift (8:00 AM - 5:00 PM)',
                    'shift_start' => '08:00:00',
                    'shift_end' => '17:00:00',
                    'is_rest_day' => false,
                    'status' => 'draft',
                    'notes' => null,
                ];
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
            'rosterMatrix' => $rosterMatrix,
        ]);
    }

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();

        $validated = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'roster_date' => ['required', 'date'],
            'shift_name' => ['required', 'string', 'max:100'],
            'shift_start' => ['nullable', 'date_format:H:i'],
            'shift_end' => ['nullable', 'date_format:H:i'],
            'is_rest_day' => ['boolean'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $isRestDay = (bool) ($validated['is_rest_day'] ?? false);

        ShiftRoster::updateOrCreate(
            [
                'employee_id' => $validated['employee_id'],
                'roster_date' => $validated['roster_date'],
            ],
            [
                'entity_id' => $entityId,
                'shift_name' => $isRestDay ? 'Rest Day' : $validated['shift_name'],
                'shift_start' => $isRestDay ? null : ($validated['shift_start'] ?? '08:00:00'),
                'shift_end' => $isRestDay ? null : ($validated['shift_end'] ?? '17:00:00'),
                'is_rest_day' => $isRestDay,
                'status' => 'published',
                'notes' => $validated['notes'],
            ]
        );

        return redirect()->back()->with('status', 'Shift updated successfully.');
    }

    public function publish(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $weekStart = $request->get('week_start', Carbon::now()->startOfWeek()->toDateString());
        $endOfWeek = Carbon::parse($weekStart)->endOfWeek()->toDateString();

        ShiftRoster::where('entity_id', $entityId)
            ->whereBetween('roster_date', [$weekStart, $endOfWeek])
            ->update(['status' => 'published']);

        return redirect()->back()->with('status', 'Roster for this week has been published.');
    }
}

