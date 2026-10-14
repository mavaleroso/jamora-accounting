<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Services\People\AttendanceCalculator;
use App\Services\People\EmployeeResolver;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Time & Attendance.
 *
 * One page, three perspectives:
 *  - Employee (linked employee, no attendance.manage): own clock, own timesheet, own requests.
 *  - Timekeeper / HR (attendance.manage or payroll.manage): live team board, review & approval queue,
 *    request inbox, manual entries, daily close and geofence settings.
 *  - Viewer (attendance.view without a linked employee, e.g. Auditor): team board and timesheets, read-only.
 */
class AttendanceController extends Controller
{
    private const VIEWS = ['clock', 'today', 'timesheets', 'requests'];

    private const EMPLOYEE_COLUMNS = 'employee:id,employee_code,firstname,middlename,lastname,avatar,position,department,biometric_id';

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
        $user = $request->user();
        $canManage = $this->employeeResolver->isHr($user, 'attendance.manage');
        $self = $this->employeeResolver->forUser($user, $entityId);
        $canViewTeam = $canManage || ! $self;

        $defaultView = $self && ! $canManage ? 'clock' : 'today';
        $view = in_array($request->query('view'), self::VIEWS, true) ? $request->query('view') : $defaultView;
        if ($view === 'clock' && ! $self) {
            $view = 'today';
        }
        if ($view === 'today' && ! $canViewTeam) {
            $view = 'clock';
        }

        $today = Carbon::today();
        $dateFrom = $this->dateParam($request->query('date_from')) ?? $today->copy()->startOfWeek()->toDateString();
        $dateTo = $this->dateParam($request->query('date_to')) ?? $today->copy()->endOfWeek()->toDateString();
        if ($dateTo < $dateFrom) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        $employeeId = $canViewTeam ? ($request->integer('employee_id') ?: null) : $self?->id;
        $recordStatus = in_array($request->query('status'), [DtrEntry::STATUS_OPEN, DtrEntry::STATUS_APPROVED, DtrEntry::STATUS_LOCKED], true)
            ? $request->query('status') : '';
        $exceptionsOnly = $request->boolean('exceptions_only');
        $requestStatus = in_array($request->query('request_status'), ['pending', 'approved', 'rejected', 'cancelled', 'all'], true)
            ? $request->query('request_status') : ($canManage ? 'pending' : 'all');

        // Period records (timesheets)
        $periodQuery = DtrEntry::query()
            ->where('entity_id', $entityId)
            ->whereBetween('work_date', [$dateFrom, $dateTo])
            ->when($employeeId, fn ($q) => $q->where('employee_id', $employeeId));

        $entries = (clone $periodQuery)
            ->with([self::EMPLOYEE_COLUMNS, 'approver:id,firstname,lastname'])
            ->when($recordStatus !== '', fn ($q) => $q->where('status', $recordStatus))
            ->when($exceptionsOnly, fn ($q) => $this->scopeExceptions($q))
            ->orderByDesc('work_date')
            ->orderBy('employee_id')
            ->paginate(25)
            ->withQueryString();

        // Flag days whose unpaid OT already has a pending request, so the UI can say so.
        $pendingOt = AttendanceRequest::query()
            ->where('request_type', AttendanceRequest::TYPE_OVERTIME)
            ->where('status', 'pending')
            ->whereIn('employee_id', $entries->getCollection()->pluck('employee_id')->unique())
            ->whereBetween('work_date', [$dateFrom, $dateTo])
            ->get(['employee_id', 'work_date'])
            ->map(fn ($r) => $r->employee_id.'|'.$r->work_date->toDateString())
            ->flip();
        $entries->getCollection()->each(fn (DtrEntry $e) => $e->setAttribute(
            'ot_request_pending',
            $pendingOt->has($e->employee_id.'|'.$e->work_date->toDateString())
        ));

        $period = (clone $periodQuery)->get();
        $kpis = [
            'regularHours' => round((float) $period->sum('regular_hours'), 2),
            'otRendered' => round((float) $period->sum('ot_hours'), 2),
            'otApproved' => round((float) $period->sum('ot_hours_approved'), 2),
            'tardinessMinutes' => (int) $period->sum('tardiness_minutes'),
            'undertimeMinutes' => (int) $period->sum('undertime_minutes'),
            'lateDays' => $period->where('tardiness_minutes', '>', 0)->count(),
            'absences' => $period->where('is_absent', true)->count(),
            'incomplete' => $period->where('attendance_status', 'incomplete')->count(),
            'exceptions' => $period->filter(fn (DtrEntry $e) => $this->isException($e))->count(),
            'daysWorked' => $period->whereIn('attendance_status', AttendanceCalculator::WORKED_STATUSES)->count(),
        ];
        $approval = [
            'open' => $period->where('status', DtrEntry::STATUS_OPEN)->count(),
            'approved' => $period->where('status', DtrEntry::STATUS_APPROVED)->count(),
            'locked' => $period->where('status', DtrEntry::STATUS_LOCKED)->count(),
            'readyToApprove' => $period->where('status', DtrEntry::STATUS_OPEN)->where('attendance_status', '!=', 'incomplete')->count(),
        ];

        // Correction / OT requests
        $requestsBase = AttendanceRequest::query()
            ->where('entity_id', $entityId)
            ->when(! $canViewTeam && $self, fn ($q) => $q->where('employee_id', $self->id));

        $attendanceRequests = (clone $requestsBase)
            ->with([self::EMPLOYEE_COLUMNS, 'dtrEntry', 'reviewer:id,firstname,lastname', 'filer:id,firstname,lastname'])
            ->when($requestStatus !== 'all', fn ($q) => $q->where('status', $requestStatus))
            ->orderByRaw("case when status = 'pending' then 0 else 1 end")
            ->orderByDesc('created_at')
            ->paginate(15, ['*'], 'requests_page')
            ->withQueryString();

        $requestCounts = (clone $requestsBase)
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $employees = $canViewTeam
            ? Employee::query()
                ->where('entity_id', $entityId)
                ->where('is_active', true)
                ->orderBy('lastname')
                ->get(['id', 'employee_code', 'firstname', 'middlename', 'lastname', 'avatar', 'biometric_id', 'position', 'department'])
            : collect($self ? [$self] : []);

        return Inertia::render('employee-management/attendance/page', [
            'perspective' => [
                'canManage' => $canManage,
                'canViewTeam' => $canViewTeam,
                'hasSelf' => (bool) $self,
            ],
            'view' => $view,
            'filters' => [
                'employee_id' => $employeeId,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
                'status' => $recordStatus,
                'exceptions_only' => $exceptionsOnly,
                'request_status' => $requestStatus,
            ],
            'entries' => $entries,
            'kpis' => $kpis,
            'approval' => $approval,
            'attendanceRequests' => $attendanceRequests,
            'requestCounts' => [
                'pending' => (int) ($requestCounts['pending'] ?? 0),
                'approved' => (int) ($requestCounts['approved'] ?? 0),
                'rejected' => (int) ($requestCounts['rejected'] ?? 0),
                'cancelled' => (int) ($requestCounts['cancelled'] ?? 0),
            ],
            'employees' => $employees,
            // Built only for the view that shows them; the board refreshes itself via a partial reload.
            'board' => $canViewTeam && $view === 'today' ? $this->todayBoard($entityId) : null,
            'myDay' => $self && $view === 'clock' ? $this->myDay($self) : null,
            'branchLocation' => $this->branchLocation($entityContext->current()),
            'today' => $today->toDateString(),
        ]);
    }

    public function recordPunch(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $employee = Employee::withoutEntityScope()->find($request->input('employee_id'));
        $entityId = $entityContext->id() ?? $employee?->entity_id;
        $currentEntity = $entityId ? Entity::find($entityId) : null;
        if (! $currentEntity && $entityContext->current()) {
            $currentEntity = $entityContext->current();
        }

        $branchLat = $currentEntity && $currentEntity->latitude !== null ? (float) $currentEntity->latitude : 14.5547;
        $branchLon = $currentEntity && $currentEntity->longitude !== null ? (float) $currentEntity->longitude : 121.0244;
        $geofenceRadius = (int) ($currentEntity?->geofence_radius ?? 250);
        $geofenceEnforced = $currentEntity && $currentEntity->geofence_enforced !== null
            ? (bool) $currentEntity->geofence_enforced
            : (bool) config('attendance.geofence_enabled', true);

        $user = $request->user();
        $isManager = $this->employeeResolver->isHr($user, 'attendance.manage');

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

            if (! $isManager) {
                $currentUserEmployee = $this->employeeResolver->forUser($user, $entityId);
                if (! $currentUserEmployee) {
                    return redirect()->back()->withErrors([
                        'employee_id' => 'No active employee profile linked to your user account.',
                    ]);
                }
                $validated['employee_id'] = $currentUserEmployee->id;
                // Employees always punch "now"; only timekeepers may back-date.
                $validated['punch_time'] = null;
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
                    throw ValidationException::withMessages([
                        'location' => 'GPS coordinates are required to clock attendance. Please allow browser location access.',
                    ]);
                }

                if ($distance > $geofenceRadius) {
                    $branchName = $currentEntity?->name ?? 'Authorized Branch';

                    throw ValidationException::withMessages([
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

            $punchType = match ($validated['punch_type']) {
                'in' => 'check_in',
                'out' => 'check_out',
                default => $validated['punch_type'],
            };

            // Enforce the punch sequence: in -> (break out -> break in) -> out.
            $sequenceError = match ($punchType) {
                'check_in' => $dtr->time_in ? 'You have already checked in today.' : null,
                'break_out' => ! $dtr->time_in ? 'Check in before starting a break.' : ($dtr->break_out ? 'Break-out is already recorded.' : ($dtr->time_out ? 'You have already checked out.' : null)),
                'break_in' => ! $dtr->break_out ? 'Record a break-out first.' : ($dtr->break_in ? 'Break-in is already recorded.' : ($dtr->time_out ? 'You have already checked out.' : null)),
                'check_out' => ! $dtr->time_in ? 'Check in before checking out.' : ($dtr->time_out ? 'You have already checked out today.' : null),
            };
            if ($sequenceError) {
                return redirect()->back()->withErrors(['punch_type' => $sequenceError]);
            }

            if ($punchType === 'check_out'
                && (! $dtr->break_out || ! $dtr->break_in)
                && blank(trim((string) ($validated['notes'] ?? '')))) {
                return redirect()->back()->withErrors([
                    'notes' => 'A remark is required when checking out with a missing break-out or break-in punch.',
                ]);
            }

            $display = $punchTime->format('g:i A');
            $statusMsg = 'Attendance punch recorded.';

            if ($punchType === 'check_in') {
                $dtr->time_in = $timeStr;
                $dtr->in_latitude = $lat;
                $dtr->in_longitude = $lon;
                $dtr->distance_meters = $distance;
                $dtr->location_status = $locationStatus;
                $statusMsg = "Checked in at {$display}. Have a good shift!";
            } elseif ($punchType === 'break_out') {
                $dtr->break_out = $timeStr;
                $statusMsg = "Break started at {$display}. Enjoy your break!";
            } elseif ($punchType === 'break_in') {
                $dtr->break_in = $timeStr;
                $statusMsg = "Back from break at {$display}.";
            } else {
                $dtr->time_out = $timeStr;
                $dtr->out_latitude = $lat;
                $dtr->out_longitude = $lon;
                if ($distance !== null) {
                    $dtr->distance_meters = $distance;
                }
                $statusMsg = "Checked out at {$display}. See you next shift!";
            }
            $dtr->source = 'web_geofence';

            if (! empty($validated['notes'])) {
                $dtr->notes = trim(($dtr->notes ?? '').' '.$validated['notes']);
            }

            // Centralized calculation with shift roster schedules
            $employee = Employee::findOrFail($validated['employee_id']);
            $this->attendanceCalculator->compute($dtr, $employee)->save();

            return redirect()->back()->with('status', $statusMsg);
        }

        // Direct / Manual Entry (timekeepers only)
        if (! $isManager) {
            abort(403);
        }

        $validated = $request->validate([
            'employee_id' => ['required', 'exists:employees,id'],
            'work_date' => ['required', 'date', 'before_or_equal:today'],
            'time_in' => ['nullable', 'date_format:H:i'],
            'break_out' => ['nullable', 'date_format:H:i'],
            'break_in' => ['nullable', 'date_format:H:i', 'required_with:break_out'],
            'time_out' => ['nullable', 'date_format:H:i'],
            'notes' => ['required', 'string', 'max:500'],
        ], [
            'notes.required' => 'Give a reason for the manual entry — it is kept in the audit trail.',
            'break_in.required_with' => 'Enter the break-in time to match the break-out.',
        ]);

        $workDate = Carbon::parse($validated['work_date'])->toDateString();
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

        $time = fn (?string $v) => filled($v) ? Carbon::parse($v)->format('H:i:s') : null;
        $editor = trim(($user?->firstname ?? '').' '.($user?->lastname ?? '')) ?: 'HR';

        $dtr->fill([
            'entity_id' => $entityId,
            'time_in' => $time($validated['time_in'] ?? null),
            'break_out' => $time($validated['break_out'] ?? null),
            'break_in' => $time($validated['break_in'] ?? null),
            'time_out' => $time($validated['time_out'] ?? null),
            'source' => $dtr->exists ? $dtr->source : 'manual',
            'location_status' => $dtr->location_status ?: 'manual',
            'notes' => trim(($dtr->notes ?? '')." [Manual entry by {$editor}: {$validated['notes']}]"),
        ]);

        // An edited record has to be reviewed again before payroll.
        if ($dtr->status === DtrEntry::STATUS_APPROVED) {
            $dtr->status = DtrEntry::STATUS_OPEN;
            $dtr->approved_by = null;
            $dtr->approved_at = null;
        }

        $employee = Employee::findOrFail($validated['employee_id']);
        $this->attendanceCalculator->compute($dtr, $employee)->save();

        return redirect()->back()->with('status', 'Time record saved for '.$employee->name.'.');
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

        $remark = $request->input('notes', 'Location verified by HR');
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
     * Approve a single DTR. Approving the day never grants overtime — payable OT comes only
     * from approved overtime requests.
     */
    public function approveDtr(Request $request, DtrEntry $dtr): RedirectResponse
    {
        $this->attendanceCalculator->assertEditable($dtr);

        if ($dtr->attendance_status === 'incomplete') {
            throw ValidationException::withMessages([
                'dtr' => 'This day has a missing punch. Fix the record before approving it.',
            ]);
        }

        $this->attendanceCalculator->syncApprovedOt($dtr);
        $dtr->fill([
            'status' => DtrEntry::STATUS_APPROVED,
            'approved_by' => $request->user()?->id,
            'approved_at' => now(),
        ])->save();

        return redirect()->back()->with('status', 'Time record approved for payroll.');
    }

    /**
     * Approve several open DTRs at once. Incomplete or locked days are skipped, and payable OT
     * stays as already approved (via OT requests or single approval).
     */
    public function approveBulk(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer'],
        ]);

        $entries = DtrEntry::query()->whereIn('id', $validated['ids'])->get();
        $approved = 0;
        $skipped = 0;

        foreach ($entries as $dtr) {
            if ($dtr->status !== DtrEntry::STATUS_OPEN || $dtr->attendance_status === 'incomplete') {
                $skipped++;

                continue;
            }

            $dtr->update([
                'status' => DtrEntry::STATUS_APPROVED,
                'approved_by' => $request->user()?->id,
                'approved_at' => now(),
            ]);
            $approved++;
        }

        $message = "Approved {$approved} time ".str('record')->plural($approved).'.';
        if ($skipped > 0) {
            $message .= " Skipped {$skipped} (incomplete, already approved or locked).";
        }

        return redirect()->back()->with('status', $message);
    }

    /**
     * Send an approved (not yet locked) DTR back for review.
     */
    public function reopenDtr(DtrEntry $dtr): RedirectResponse
    {
        $this->attendanceCalculator->assertEditable($dtr);

        $dtr->update([
            'status' => DtrEntry::STATUS_OPEN,
            'approved_by' => null,
            'approved_at' => null,
        ]);

        return redirect()->back()->with('status', 'Time record reopened for review.');
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
            'work_date' => ['required', 'date', 'before_or_equal:today'],
            'requested_time_in' => ['nullable', 'date_format:H:i'],
            'requested_break_out' => ['nullable', 'date_format:H:i'],
            'requested_break_in' => ['nullable', 'date_format:H:i'],
            'requested_time_out' => ['nullable', 'date_format:H:i'],
            'requested_ot_hours' => ['nullable', 'required_if:request_type,overtime', 'numeric', 'min:0.5', 'max:12'],
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ], [
            'requested_ot_hours.required_if' => 'Enter the overtime hours you rendered.',
            'work_date.before_or_equal' => 'You can only file requests for today or past days.',
        ]);

        if (! $isManager) {
            $currentUserEmployee = $this->employeeResolver->forUser($user, $entityId);
            if (! $currentUserEmployee) {
                return redirect()->back()->withErrors(['employee_id' => 'No active employee profile linked.']);
            }
            $validated['employee_id'] = $currentUserEmployee->id;
        }

        $times = collect(['requested_time_in', 'requested_break_out', 'requested_break_in', 'requested_time_out'])
            ->mapWithKeys(fn ($k) => [$k => filled($validated[$k] ?? null) ? Carbon::parse($validated[$k])->format('H:i:s') : null]);

        if ($validated['request_type'] === AttendanceRequest::TYPE_CORRECTION && $times->filter()->isEmpty()) {
            throw ValidationException::withMessages([
                'requested_time_in' => 'Enter at least one corrected time.',
            ]);
        }

        $dtr = DtrEntry::query()
            ->where('employee_id', $validated['employee_id'])
            ->whereDate('work_date', $validated['work_date'])
            ->first();

        $this->attendanceCalculator->assertEditable($dtr, 'work_date');

        if ($validated['request_type'] === AttendanceRequest::TYPE_OVERTIME) {
            $rendered = (float) ($dtr?->ot_hours ?? 0);
            $remaining = max(0, $rendered - $this->attendanceCalculator->approvedOtHours($validated['employee_id'], $validated['work_date']));

            if ((float) $validated['requested_ot_hours'] > $remaining) {
                throw ValidationException::withMessages([
                    'requested_ot_hours' => $remaining > 0
                        ? "Only {$remaining} OT hours rendered on this day are not yet approved."
                        : ($rendered > 0
                            ? 'All overtime rendered on this day is already approved.'
                            : 'Your time record shows no overtime rendered on this day. File a time correction first if your punches are wrong.'),
                ]);
            }
        }

        $duplicate = AttendanceRequest::query()
            ->where('employee_id', $validated['employee_id'])
            ->whereDate('work_date', $validated['work_date'])
            ->where('request_type', $validated['request_type'])
            ->where('status', 'pending')
            ->exists();

        if ($duplicate) {
            throw ValidationException::withMessages([
                'work_date' => 'There is already a pending '.$validated['request_type'].' request for this day.',
            ]);
        }

        AttendanceRequest::create([
            'entity_id' => $entityId,
            'employee_id' => $validated['employee_id'],
            'dtr_entry_id' => $dtr?->id ?? ($validated['dtr_entry_id'] ?? null),
            'request_type' => $validated['request_type'],
            'work_date' => $validated['work_date'],
            ...$times->all(),
            'requested_ot_hours' => $validated['request_type'] === AttendanceRequest::TYPE_OVERTIME ? $validated['requested_ot_hours'] : null,
            'reason' => $validated['reason'],
            'status' => 'pending',
            'filed_by' => $user?->id,
        ]);

        return redirect()->back()->with('status', 'Request filed. You will see the decision under Requests.');
    }

    /**
     * Review (Approve or Reject) an attendance request.
     */
    public function reviewRequest(Request $request, AttendanceRequest $attendanceRequest): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
            'review_remarks' => ['nullable', 'required_if:status,rejected', 'string', 'max:255'],
        ], [
            'review_remarks.required_if' => 'Tell the employee why the request was rejected.',
        ]);

        if ($attendanceRequest->status !== 'pending') {
            throw ValidationException::withMessages([
                'status' => "This request was already {$attendanceRequest->status}.",
            ]);
        }

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
                foreach (['time_in', 'break_out', 'break_in', 'time_out'] as $field) {
                    if ($attendanceRequest->{'requested_'.$field}) {
                        $dtr->{$field} = $attendanceRequest->{'requested_'.$field};
                    }
                }
                $dtr->source = $dtr->source ?: 'correction';
                $dtr->notes = trim(($dtr->notes ?? '')." [Correction approved: {$attendanceRequest->reason}]");
                $this->attendanceCalculator->compute($dtr, $employee)->save();
            }
        }

        $attendanceRequest->fill([
            'status' => $status,
            'reviewed_by' => $user?->id,
            'reviewed_at' => now(),
            'review_remarks' => $validated['review_remarks'] ?? null,
        ]);
        if (isset($dtr) && $dtr->exists) {
            $attendanceRequest->dtr_entry_id ??= $dtr->id;
        }
        $attendanceRequest->save();

        // The request must be saved as approved first: payable OT is derived from approved requests.
        // (No record yet means no OT rendered, so there is nothing to pay — don't create an empty day.)
        if ($status === 'approved' && $attendanceRequest->request_type === AttendanceRequest::TYPE_OVERTIME && isset($dtr) && $dtr->exists) {
            $this->attendanceCalculator->syncApprovedOt($dtr);
            $dtr->notes = trim(($dtr->notes ?? '')." [OT approved: {$attendanceRequest->requested_ot_hours} hrs]");
            $dtr->save();
        }

        return redirect()->back()->with('status', 'Request '.$status.' for '.$attendanceRequest->employee?->name.'.');
    }

    /**
     * Withdraw a pending request (the employee who filed it, or a timekeeper).
     */
    public function cancelRequest(Request $request, AttendanceRequest $attendanceRequest, EntityContext $entityContext): RedirectResponse
    {
        $user = $request->user();
        $isManager = $this->employeeResolver->isHr($user, 'attendance.manage');
        $self = $this->employeeResolver->forUser($user, $entityContext->id());

        if (! $isManager && $self?->id !== $attendanceRequest->employee_id) {
            abort(403);
        }

        if ($attendanceRequest->status !== 'pending') {
            throw ValidationException::withMessages(['status' => 'Only pending requests can be cancelled.']);
        }

        $attendanceRequest->update(['status' => 'cancelled']);

        return redirect()->back()->with('status', 'Request cancelled.');
    }

    /**
     * Run daily close for an entity (auto-marks absent or holiday).
     */
    public function runDailyClose(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $validated = $request->validate([
            'date' => ['nullable', 'date', 'before:today'],
        ], [
            'date.before' => 'Close a day only after it has ended.',
        ]);

        $entityId = $entityContext->id();
        $date = $validated['date'] ?? Carbon::yesterday()->toDateString();

        $summary = $this->attendanceCalculator->closeDay($entityId, $date);
        $label = Carbon::parse($date)->format('M j, Y');

        return redirect()->back()->with('status', "Day closed for {$label}: {$summary['absent']} absent, {$summary['on_leave']} on leave, {$summary['holiday']} holiday, {$summary['skipped']} already recorded.");
    }

    /**
     * Live status of every active employee today, for the team board.
     *
     * @return array{rows: array<int, array<string, mixed>>, counts: array<string, int>, holiday: ?string}
     */
    private function todayBoard(?int $entityId): array
    {
        $now = Carbon::now();
        $today = $now->toDateString();

        $employees = Employee::query()
            ->where('entity_id', $entityId)
            ->where('is_active', true)
            ->where('employment_status', 'active')
            ->where(fn ($q) => $q->whereNull('hire_date')->orWhereDate('hire_date', '<=', $today))
            ->with('defaultShiftTemplate')
            ->orderBy('lastname')
            ->get();

        $dtrs = DtrEntry::query()
            ->where('entity_id', $entityId)
            ->whereDate('work_date', $today)
            ->get()
            ->keyBy('employee_id');

        $leaves = LeaveRequest::query()
            ->withoutEntityScope()
            ->with('leaveType:id,name,code')
            ->whereIn('employee_id', $employees->pluck('id'))
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->get()
            ->keyBy('employee_id');

        $holiday = $this->attendanceCalculator->holidayFor($entityId, $today);

        $rows = $employees->map(function (Employee $employee) use ($dtrs, $leaves, $holiday, $now, $today) {
            $schedule = $this->attendanceCalculator->scheduleFor($employee, $today);
            $dtr = $dtrs->get($employee->id);
            $leave = $leaves->get($employee->id);
            $start = $schedule->start ? Carbon::parse($today.' '.$schedule->start) : null;
            $lateBy = null;

            if ($dtr?->time_out) {
                $status = 'done';
            } elseif ($dtr?->break_out && ! $dtr->break_in) {
                $status = 'on_break';
            } elseif ($dtr?->time_in) {
                $status = 'working';
            } elseif ($leave) {
                $status = 'on_leave';
            } elseif ($schedule->isRestDay) {
                $status = 'rest_day';
            } elseif ($holiday) {
                $status = 'holiday';
            } elseif ($dtr?->is_absent) {
                $status = 'absent';
            } elseif ($start && $now->gt($start->copy()->addMinutes($schedule->graceMinutes))) {
                $status = 'late';
                $lateBy = (int) $start->diffInMinutes($now);
            } else {
                $status = 'expected';
            }

            return [
                'employee' => $employee->only(['id', 'employee_code', 'firstname', 'lastname', 'position', 'department', 'avatar_url']) + ['name' => $employee->name],
                'status' => $status,
                'late_by' => $lateBy,
                'tardiness_minutes' => (int) ($dtr?->tardiness_minutes ?? 0),
                'schedule' => [
                    'shift_name' => $schedule->shiftName,
                    'start' => $schedule->start,
                    'end' => $schedule->end,
                    'source' => $schedule->source,
                ],
                'leave' => $leave ? ($leave->leaveType?->name ?? $leave->leave_type) : null,
                'dtr' => $dtr?->only(['id', 'time_in', 'break_out', 'break_in', 'time_out', 'location_status', 'distance_meters', 'status']),
            ];
        })->values();

        $order = ['late' => 0, 'expected' => 1, 'working' => 2, 'on_break' => 3, 'done' => 4, 'absent' => 5, 'on_leave' => 6, 'holiday' => 7, 'rest_day' => 8];

        return [
            'rows' => $rows->sortBy(fn ($r) => $order[$r['status']] ?? 9)->values()->all(),
            'counts' => $rows->countBy('status')->all(),
            'holiday' => $holiday?->name,
            'generated_at' => $now->toIso8601String(),
        ];
    }

    /**
     * Personal context for the employee clock: today's schedule, punches and this week.
     *
     * @return array<string, mixed>
     */
    private function myDay(Employee $employee): array
    {
        $today = Carbon::today();
        $schedule = $this->attendanceCalculator->scheduleFor($employee, $today);
        $holiday = $this->attendanceCalculator->holidayFor($employee->entity_id, $today);

        $weekStart = $today->copy()->startOfWeek();
        $weekEntries = DtrEntry::query()
            ->withoutEntityScope()
            ->where('employee_id', $employee->id)
            ->whereBetween('work_date', [$weekStart->toDateString(), $weekStart->copy()->endOfWeek()->toDateString()])
            ->get()
            ->keyBy(fn (DtrEntry $e) => $e->work_date->toDateString());

        $week = collect(range(0, 6))->map(function (int $i) use ($weekStart, $weekEntries, $employee) {
            $date = $weekStart->copy()->addDays($i);
            $entry = $weekEntries->get($date->toDateString());

            return [
                'date' => $date->toDateString(),
                'is_rest_day' => in_array($date->dayOfWeek, $employee->restDayNumbers(), true),
                'entry' => $entry?->only(['id', 'time_in', 'time_out', 'regular_hours', 'ot_hours', 'tardiness_minutes', 'attendance_status', 'status']),
            ];
        });

        $todayEntry = $weekEntries->get($today->toDateString());

        return [
            'employee' => $employee->only(['id', 'employee_code', 'firstname', 'lastname', 'position', 'department', 'avatar_url']) + ['name' => $employee->name],
            'schedule' => $schedule->toArray(),
            'holiday' => $holiday?->only(['name', 'type']),
            'today' => $todayEntry,
            'week' => $week,
            'weekTotals' => [
                'regular_hours' => round((float) $weekEntries->sum('regular_hours'), 2),
                'ot_hours' => round((float) $weekEntries->sum('ot_hours'), 2),
                'tardiness_minutes' => (int) $weekEntries->sum('tardiness_minutes'),
            ],
            'pendingRequests' => AttendanceRequest::query()->where('employee_id', $employee->id)->where('status', 'pending')->count(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function branchLocation(?Entity $entity): array
    {
        return [
            'id' => $entity?->id,
            'name' => $entity?->name ?? 'Main Clinic Branch',
            'latitude' => $entity?->latitude !== null ? (float) $entity->latitude : 14.5547,
            'longitude' => $entity?->longitude !== null ? (float) $entity->longitude : 121.0244,
            'geofence_radius' => (int) ($entity?->geofence_radius ?? 250),
            'geofence_enforced' => config('attendance.geofence_enabled', true)
                && (bool) ($entity?->geofence_enforced ?? true),
        ];
    }

    private function scopeExceptions($query)
    {
        return $query->where(function ($q) {
            $q->where('tardiness_minutes', '>', 0)
                ->orWhere('undertime_minutes', '>', 0)
                ->orWhereColumn('ot_hours', '>', 'ot_hours_approved')
                ->orWhere('is_absent', true)
                ->orWhere('attendance_status', 'incomplete')
                ->orWhere('location_status', 'out_of_bounds');
        });
    }

    private function isException(DtrEntry $e): bool
    {
        return $e->tardiness_minutes > 0
            || $e->undertime_minutes > 0
            || (float) $e->ot_hours > (float) $e->ot_hours_approved
            || $e->is_absent
            || $e->attendance_status === 'incomplete'
            || $e->location_status === 'out_of_bounds';
    }

    private function dateParam(mixed $value): ?string
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }

        return $value;
    }
}
