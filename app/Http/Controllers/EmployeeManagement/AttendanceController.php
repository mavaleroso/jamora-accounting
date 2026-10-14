<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Services\People\AttendanceCalculator;
use App\Services\People\EmployeeResolver;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttendanceController extends Controller
{
    public function __construct(
        protected AttendanceCalculator $attendanceCalculator,
        protected EmployeeResolver $employeeResolver
    ) {}

    /**
     * Calculate Haversine distance in meters between two lat/long coordinates.
     */
    public static function calculateDistance(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $earthRadius = 6371000;
        $latFrom = deg2rad($lat1);
        $lonFrom = deg2rad($lon1);
        $latTo = deg2rad($lat2);
        $lonTo = deg2rad($lon2);

        $latDelta = $latTo - $latFrom;
        $lonDelta = $lonTo - $lonFrom;

        $angle = 2 * asin(sqrt(pow(sin($latDelta / 2), 2) +
            cos($latFrom) * cos($latTo) * pow(sin($lonDelta / 2), 2)));

        return round($angle * $earthRadius, 2);
    }

    public function index(Request $request, EntityContext $entityContext): Response
    {
        $entityId = $entityContext->id();
        $employeeId = $request->get('employee_id');
        $dateFrom = $request->get('date_from', Carbon::now()->startOfWeek()->toDateString());
        $dateTo = $request->get('date_to', Carbon::now()->endOfWeek()->toDateString());
        $exceptionOnly = $request->boolean('exceptions_only');
        $tab = $request->get('tab', 'records'); // records, requests

        $user = $request->user();
        $isManager = $this->employeeResolver->isHr($user, 'attendance.manage');
        $currentUserEmployee = $this->employeeResolver->forUser($user, $entityId);

        if (! $isManager && $currentUserEmployee) {
            $employeeId = $currentUserEmployee->id;
        }

        $query = DtrEntry::query()
            ->with(['employee:id,employee_code,firstname,lastname,position,department,biometric_id', 'roster', 'approver:id,firstname,lastname'])
            ->where('entity_id', $entityId)
            ->whereBetween('work_date', [$dateFrom, $dateTo])
            ->orderByDesc('work_date')
            ->orderBy('employee_id');

        if ($employeeId) {
            $query->where('employee_id', $employeeId);
        }

        if ($exceptionOnly) {
            $query->where(function ($q) {
                $q->where('tardiness_minutes', '>', 0)
                    ->orWhere('undertime_minutes', '>', 0)
                    ->orWhere('ot_hours', '>', 0)
                    ->orWhere('is_absent', true)
                    ->orWhere('attendance_status', 'incomplete')
                    ->orWhereNull('time_in')
                    ->orWhereNull('time_out');
            });
        }

        $entries = $query->paginate(20)->withQueryString();

        $weekQuery = DtrEntry::where('entity_id', $entityId)
            ->whereBetween('work_date', [$dateFrom, $dateTo]);
        if (! $isManager && $currentUserEmployee) {
            $weekQuery->where('employee_id', $currentUserEmployee->id);
        }
        $allWeekEntries = $weekQuery->get();

        $kpis = [
            'totalRegularHours' => (float) $allWeekEntries->sum('regular_hours'),
            'totalOtHoursRendered' => (float) $allWeekEntries->sum('ot_hours'),
            'totalOtHoursApproved' => (float) $allWeekEntries->sum('ot_hours_approved'),
            'totalTardinessMinutes' => (int) $allWeekEntries->sum('tardiness_minutes'),
            'totalUndertimeMinutes' => (int) $allWeekEntries->sum('undertime_minutes'),
            'exceptionsCount' => $allWeekEntries->filter(fn ($e) => $e->tardiness_minutes > 0 || $e->undertime_minutes > 0 || $e->ot_hours > 0 || $e->is_absent || $e->attendance_status === 'incomplete')->count(),
        ];

        if ($isManager) {
            $employees = Employee::query()
                ->where('entity_id', $entityId)
                ->where('is_active', true)
                ->orderBy('lastname')
                ->get(['id', 'employee_code', 'firstname', 'lastname', 'biometric_id', 'position', 'department']);
        } else {
            $employees = $currentUserEmployee ? collect([$currentUserEmployee]) : collect();
        }

        $currentEntity = $entityContext->current();
        $branchLocation = [
            'id' => $currentEntity?->id,
            'name' => $currentEntity?->name ?? 'Main Clinic Branch',
            'latitude' => $currentEntity?->latitude !== null ? (float) $currentEntity->latitude : 14.5547,
            'longitude' => $currentEntity?->longitude !== null ? (float) $currentEntity->longitude : 121.0244,
            'geofence_radius' => (int) ($currentEntity?->geofence_radius ?? 250),
            'geofence_enforced' => config('attendance.geofence_enabled', true)
                && (bool) ($currentEntity?->geofence_enforced ?? true),
        ];

        $today = Carbon::today()->toDateString();
        $todayEntries = DtrEntry::where('entity_id', $entityId)
            ->where('work_date', $today)
            ->get()
            ->keyBy('employee_id');

        // Attendance correction & OT requests
        $requestsQuery = AttendanceRequest::query()
            ->with(['employee:id,employee_code,firstname,lastname,position,department', 'dtrEntry', 'reviewer:id,firstname,lastname'])
            ->where('entity_id', $entityId)
            ->orderByDesc('created_at');

        if (! $isManager && $currentUserEmployee) {
            $requestsQuery->where('employee_id', $currentUserEmployee->id);
        }

        $attendanceRequests = $requestsQuery->paginate(15, ['*'], 'requests_page')->withQueryString();

        return Inertia::render('employee-management/attendance/page', [
            'entries' => $entries,
            'employees' => $employees,
            'kpis' => $kpis,
            'branchLocation' => $branchLocation,
            'todayEntries' => $todayEntries,
            'currentUserEmployee' => $currentUserEmployee,
            'attendanceRequests' => $attendanceRequests,
            'tab' => $tab,
            'filters' => [
                'employee_id' => $employeeId,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'exceptions_only' => $exceptionOnly,
            ],
        ]);
    }

    public function recordPunch(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $employee = \App\Models\Employee::withoutEntityScope()->find($request->input('employee_id'));
        $entityId = $entityContext->id() ?? $employee?->entity_id;
        $currentEntity = $entityId ? \App\Models\Entity::find($entityId) : null;
        if (! $currentEntity && $entityContext->current()) {
            $currentEntity = $entityContext->current();
        }

        $branchLat = $currentEntity && $currentEntity->latitude !== null ? (float) $currentEntity->latitude : 14.5547;
        $branchLon = $currentEntity && $currentEntity->longitude !== null ? (float) $currentEntity->longitude : 121.0244;
        $geofenceRadius = (int) ($currentEntity?->geofence_radius ?? 250);
        $geofenceEnforced = $currentEntity && $currentEntity->geofence_enforced !== null
            ? (bool) $currentEntity->geofence_enforced
            : (bool) config('attendance.geofence_enabled', true);

        // Web Direct Punch with Coordinates (Check-in, Break-out, Break-in, Check-out)
        if ($request->has('punch_type')) {
            $validated = $request->validate([
                'employee_id' => ['required', 'exists:employees,id'],
                'punch_type' => ['required', 'in:check_in,break_out,break_in,check_out,in,out'],
                'latitude' => ['nullable', 'numeric'],
                'longitude' => ['nullable', 'numeric'],
                'punch_time' => ['nullable', 'string'],
                'notes' => ['nullable', 'string', 'max:500'],
            ]);

            $user = $request->user();
            $isManager = $this->employeeResolver->isHr($user, 'attendance.manage');

            if (! $isManager) {
                $currentUserEmployee = $this->employeeResolver->forUser($user, $entityId);
                if (! $currentUserEmployee) {
                    return redirect()->back()->withErrors([
                        'employee_id' => 'No active employee profile linked to your user account.',
                    ]);
                }
                $validated['employee_id'] = $currentUserEmployee->id;
            }

            $lat = isset($validated['latitude']) ? (float) $validated['latitude'] : null;
            $lon = isset($validated['longitude']) ? (float) $validated['longitude'] : null;

            $distance = null;
            if ($lat !== null && $lon !== null) {
                $distance = self::calculateDistance($lat, $lon, $branchLat, $branchLon);
            }

            // Enforce Geofence Coordinates Check
            if ($geofenceEnforced) {
                if ($lat === null || $lon === null) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'location' => 'GPS coordinates are required to clock attendance. Please allow browser location access.',
                    ]);
                }

                if ($distance > $geofenceRadius) {
                    $branchName = $currentEntity?->name ?? 'Authorized Branch';

                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'location' => "Clocking disabled: You are {$distance}m away from {$branchName}. Allowed perimeter is within {$geofenceRadius}m.",
                    ]);
                }
            }

            $locationStatus = ($distance !== null && $distance <= $geofenceRadius)
                ? 'verified'
                : ($distance === null ? 'manual' : 'out_of_bounds');

            $punchTime = ! empty($validated['punch_time'])
                ? Carbon::parse($validated['punch_time'])
                : Carbon::now();

            $workDate = $punchTime->toDateString();
            $timeStr = $punchTime->format('H:i:s');

            $dtr = DtrEntry::where('employee_id', $validated['employee_id'])
                ->whereDate('work_date', $workDate)
                ->first();

            $this->attendanceCalculator->assertEditable($dtr, 'location');

            if (! $dtr) {
                $dtr = new DtrEntry([
                    'entity_id' => $entityId,
                    'employee_id' => $validated['employee_id'],
                    'work_date' => $workDate,
                ]);
            }

            $punchType = $validated['punch_type'];
            if (in_array($punchType, ['check_out', 'out'], true)
                && (! $dtr->break_out || ! $dtr->break_in)
                && blank(trim((string) ($validated['notes'] ?? '')))) {
                return redirect()->back()->withErrors([
                    'notes' => 'A remark is required when checking out with a missing break-out or break-in punch.',
                ]);
            }

            $statusMsg = 'Attendance punch recorded successfully.';

            if ($punchType === 'check_in' || $punchType === 'in') {
                $dtr->time_in = $timeStr;
                $dtr->in_latitude = $lat;
                $dtr->in_longitude = $lon;
                $dtr->distance_meters = $distance;
                $dtr->location_status = $locationStatus;
                $dtr->source = 'web_geofence';
                $statusMsg = "Check-In recorded at {$timeStr}".($distance !== null ? " ({$distance}m from branch - Verified)." : '.');
            } elseif ($punchType === 'break_out') {
                $dtr->break_out = $timeStr;
                $dtr->source = 'web_geofence';
                $statusMsg = "Break-Out recorded at {$timeStr}.";
            } elseif ($punchType === 'break_in') {
                $dtr->break_in = $timeStr;
                $dtr->source = 'web_geofence';
                $statusMsg = "Break-In recorded at {$timeStr}.";
            } elseif ($punchType === 'check_out' || $punchType === 'out') {
                $dtr->time_out = $timeStr;
                $dtr->out_latitude = $lat;
                $dtr->out_longitude = $lon;
                if ($distance !== null) {
                    $dtr->distance_meters = $distance;
                }
                $dtr->source = 'web_geofence';
                $statusMsg = "Check-Out recorded at {$timeStr}.";
            }

            if (! empty($validated['notes'])) {
                $dtr->notes = trim(($dtr->notes ?? '').' '.$validated['notes']);
            }

            // Centralized calculation with shift roster schedules
            $employee = Employee::findOrFail($validated['employee_id']);
            $this->attendanceCalculator->compute($dtr, $employee)->save();

            return redirect()->back()->with('status', $statusMsg);
        }

        // Direct / Manual Entry
        $workDate = $request->input('work_date', $request->input('entry_date', now()->toDateString()));
        $validated = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'time_in' => ['nullable'],
            'break_out' => ['nullable'],
            'break_in' => ['nullable'],
            'time_out' => ['nullable'],
            'regular_hours' => ['nullable', 'numeric'],
            'ot_hours' => ['nullable', 'numeric'],
            'tardiness_minutes' => ['nullable', 'numeric'],
            'notes' => ['nullable', 'string'],
        ]);

        $dtr = DtrEntry::where('employee_id', $validated['employee_id'])
            ->whereDate('work_date', $workDate)
            ->first();

        $this->attendanceCalculator->assertEditable($dtr, 'employee_id');

        if (! $dtr) {
            $dtr = new DtrEntry([
                'entity_id' => $entityId,
                'employee_id' => $validated['employee_id'],
                'work_date' => $workDate,
            ]);
        }

        $dtr->fill([
            'entity_id' => $entityId,
            'time_in' => ! empty($validated['time_in']) ? Carbon::parse($validated['time_in'])->format('H:i:s') : null,
            'break_out' => ! empty($validated['break_out']) ? Carbon::parse($validated['break_out'])->format('H:i:s') : null,
            'break_in' => ! empty($validated['break_in']) ? Carbon::parse($validated['break_in'])->format('H:i:s') : null,
            'time_out' => ! empty($validated['time_out']) ? Carbon::parse($validated['time_out'])->format('H:i:s') : null,
            'source' => $dtr->source ?: 'manual',
            'location_status' => $dtr->location_status ?: 'manual',
            'notes' => $validated['notes'] ?? $dtr->notes ?? 'Direct attendance entry',
        ]);

        $employee = Employee::findOrFail($validated['employee_id']);
        $this->attendanceCalculator->compute($dtr, $employee);

        // If manual overrides were explicitly provided by HR manager
        if (isset($validated['regular_hours'])) {
            $dtr->regular_hours = (float) $validated['regular_hours'];
        }
        if (isset($validated['ot_hours'])) {
            $dtr->ot_hours = (float) $validated['ot_hours'];
        }
        if (isset($validated['tardiness_minutes'])) {
            $dtr->tardiness_minutes = (float) $validated['tardiness_minutes'];
        }

        $dtr->save();

        return redirect()->back()->with('status', 'Attendance record saved.');
    }

    public function updateGeofence(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $validated = $request->validate([
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'geofence_radius' => ['required', 'integer', 'min:20', 'max:5000'],
            'geofence_enforced' => ['required', 'boolean'],
        ]);

        $entity = $entityContext->current();
        if ($entity) {
            $entity->update($validated);
        }

        return redirect()->back()->with('status', 'Branch GPS geofence configuration updated successfully.');
    }

    public function verifyPunch(Request $request, DtrEntry $dtr): RedirectResponse
    {
        $this->attendanceCalculator->assertEditable($dtr);

        $remark = $request->input('notes', 'Verified by HR');
        $dtr->update([
            'notes' => trim(($dtr->notes ?? '')." [{$remark}]"),
            'location_status' => 'verified',
        ]);

        return redirect()->back()->with('status', 'Attendance punch verified.');
    }

    public function verify(DtrEntry $entry): RedirectResponse
    {
        return $this->verifyPunch(request(), $entry);
    }

    /**
     * Approve DTR entry or approve rendered overtime.
     */
    public function approveDtr(Request $request, DtrEntry $dtr): RedirectResponse
    {
        $this->attendanceCalculator->assertEditable($dtr);

        $otApproved = $request->has('ot_hours_approved')
            ? (float) $request->input('ot_hours_approved')
            : (float) $dtr->ot_hours;

        $dtr->update([
            'status' => DtrEntry::STATUS_APPROVED,
            'ot_hours_approved' => min($otApproved, (float) $dtr->ot_hours),
            'approved_by' => $request->user()?->id,
            'approved_at' => now(),
        ]);

        return redirect()->back()->with('status', 'DTR record approved for payroll processing.');
    }

    /**
     * File an attendance correction or overtime approval request.
     */
    public function storeRequest(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $user = $request->user();
        $isManager = $this->employeeResolver->isHr($user, 'attendance.manage');

        $validated = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'dtr_entry_id' => ['nullable', 'exists:dtr_entries,id'],
            'request_type' => ['required', 'in:correction,overtime'],
            'work_date' => ['required', 'date'],
            'requested_time_in' => ['nullable'],
            'requested_break_out' => ['nullable'],
            'requested_break_in' => ['nullable'],
            'requested_time_out' => ['nullable'],
            'requested_ot_hours' => ['nullable', 'numeric', 'min:0.5', 'max:12'],
            'reason' => ['required', 'string', 'max:500'],
        ]);

        if (! $isManager) {
            $currentUserEmployee = $this->employeeResolver->forUser($user, $entityId);
            if (! $currentUserEmployee) {
                return redirect()->back()->withErrors(['employee_id' => 'No active employee profile linked.']);
            }
            $validated['employee_id'] = $currentUserEmployee->id;
        }

        AttendanceRequest::create([
            'entity_id' => $entityId,
            'employee_id' => $validated['employee_id'],
            'dtr_entry_id' => $validated['dtr_entry_id'] ?? null,
            'request_type' => $validated['request_type'],
            'work_date' => $validated['work_date'],
            'requested_time_in' => $validated['requested_time_in'] ? Carbon::parse($validated['requested_time_in'])->format('H:i:s') : null,
            'requested_break_out' => $validated['requested_break_out'] ? Carbon::parse($validated['requested_break_out'])->format('H:i:s') : null,
            'requested_break_in' => $validated['requested_break_in'] ? Carbon::parse($validated['requested_break_in'])->format('H:i:s') : null,
            'requested_time_out' => $validated['requested_time_out'] ? Carbon::parse($validated['requested_time_out'])->format('H:i:s') : null,
            'requested_ot_hours' => $validated['requested_ot_hours'] ?? null,
            'reason' => $validated['reason'],
            'status' => 'pending',
            'filed_by' => $user?->id,
        ]);

        return redirect()->back()->with('status', 'Attendance request filed successfully.');
    }

    /**
     * Review (Approve or Reject) an attendance request.
     */
    public function reviewRequest(Request $request, AttendanceRequest $attendanceRequest): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
            'review_remarks' => ['nullable', 'string', 'max:255'],
        ]);

        $status = $validated['status'];
        $user = $request->user();

        if ($status === 'approved') {
            $employee = $attendanceRequest->employee;
            $workDate = $attendanceRequest->work_date;

            $dtr = DtrEntry::where('employee_id', $employee->id)
                ->whereDate('work_date', $workDate)
                ->first();

            $this->attendanceCalculator->assertEditable($dtr, 'status');

            if (! $dtr) {
                $dtr = new DtrEntry([
                    'entity_id' => $attendanceRequest->entity_id,
                    'employee_id' => $employee->id,
                    'work_date' => $workDate,
                ]);
            }

            if ($attendanceRequest->request_type === AttendanceRequest::TYPE_CORRECTION) {
                if ($attendanceRequest->requested_time_in) {
                    $dtr->time_in = $attendanceRequest->requested_time_in;
                }
                if ($attendanceRequest->requested_break_out) {
                    $dtr->break_out = $attendanceRequest->requested_break_out;
                }
                if ($attendanceRequest->requested_break_in) {
                    $dtr->break_in = $attendanceRequest->requested_break_in;
                }
                if ($attendanceRequest->requested_time_out) {
                    $dtr->time_out = $attendanceRequest->requested_time_out;
                }
                $dtr->notes = trim(($dtr->notes ?? '')." [Correction Approved: {$attendanceRequest->reason}]");
                $this->attendanceCalculator->compute($dtr, $employee)->save();
            } elseif ($attendanceRequest->request_type === AttendanceRequest::TYPE_OVERTIME) {
                $dtr->ot_hours_approved = (float) $attendanceRequest->requested_ot_hours;
                $dtr->notes = trim(($dtr->notes ?? '')." [OT Approved: {$attendanceRequest->requested_ot_hours} hrs]");
                $dtr->save();
            }
        }

        $attendanceRequest->update([
            'status' => $status,
            'reviewed_by' => $user?->id,
            'reviewed_at' => now(),
            'review_remarks' => $validated['review_remarks'] ?? null,
        ]);

        return redirect()->back()->with('status', "Attendance request marked as {$status}.");
    }

    /**
     * Run daily close for an entity (auto-marks absent or holiday).
     */
    public function runDailyClose(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $date = $request->input('date', Carbon::yesterday()->toDateString());

        $summary = $this->attendanceCalculator->closeDay($entityId, $date);

        return redirect()->back()->with('status', "Daily close completed for {$date}. Absent: {$summary['absent']}, Holiday: {$summary['holiday']}, On Leave: {$summary['on_leave']}, Skipped: {$summary['skipped']}.");
    }
}
