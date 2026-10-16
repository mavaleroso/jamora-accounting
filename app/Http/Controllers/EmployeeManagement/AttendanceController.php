<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\PayrollPeriod;
use App\Services\People\AttendanceCalculator;
use App\Services\People\AttendanceRequestService;
use App\Services\People\EmployeeResolver;
use App\Services\People\TeamBoard;
use App\Support\EntityContext;
use App\Support\RichText;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Time & Attendance.
 *
 * One page, three perspectives:
 *  - Employee (linked employee, no attendance.manage): own clock, own timesheet, own requests.
 *  - Timekeeper / HR (attendance.manage or payroll.manage): live team board, timesheet approval
 *    (approve or reject each day; employee time corrections are decided on the day itself), per-staff
 *    hours summary for the pay period, overtime inbox, manual entries, daily close and geofence settings.
 *  - Viewer (attendance.view without a linked employee, e.g. Auditor): team board and timesheets, read-only.
 */
class AttendanceController extends Controller
{
    private const VIEWS = ['clock', 'today', 'timesheets', 'requests', 'accomplishments'];

    private const EMPLOYEE_COLUMNS = 'employee:id,employee_code,firstname,middlename,lastname,avatar,position,department,biometric_id';

    public function __construct(
        protected AttendanceCalculator $attendanceCalculator,
        protected EmployeeResolver $employeeResolver,
        protected AttendanceRequestService $attendanceRequests
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
        if ($view === 'accomplishments' && ! $self) {
            $view = $defaultView;
        }

        $today = Carbon::today();
        $periods = PayrollPeriod::query()
            ->where('entity_id', $entityId)
            ->orderByDesc('start_date')
            ->limit(24)
            ->get(['id', 'code', 'start_date', 'end_date']);
        [$cutStart, $cutEnd] = $this->currentCutoff($periods, $today);
        $dateFrom = $this->dateParam($request->query('date_from')) ?? $cutStart;
        $dateTo = $this->dateParam($request->query('date_to')) ?? $cutEnd;
        if ($dateTo < $dateFrom) {
            [$dateFrom, $dateTo] = [$dateTo, $dateFrom];
        }

        $employeeId = $canViewTeam ? ($request->integer('employee_id') ?: null) : $self?->id;
        // Every day by default; the status filter narrows to unapproved, approved, declined or locked.
        $recordStatus = in_array($request->query('status'), [DtrEntry::STATUS_OPEN, DtrEntry::STATUS_APPROVED, DtrEntry::STATUS_REJECTED, DtrEntry::STATUS_LOCKED], true)
            ? $request->query('status') : '';
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
        $this->attachPendingCorrections($entries->getCollection());

        $period = (clone $periodQuery)->get();
        $pendingCorrections = AttendanceRequest::query()
            ->where('entity_id', $entityId)
            ->where('request_type', AttendanceRequest::TYPE_CORRECTION)
            ->where('status', 'pending')
            ->whereBetween('work_date', [$dateFrom, $dateTo])
            ->when($employeeId, fn ($q) => $q->where('employee_id', $employeeId))
            ->count();
        $approval = [
            'open' => $period->where('status', DtrEntry::STATUS_OPEN)->count(),
            'approved' => $period->where('status', DtrEntry::STATUS_APPROVED)->count(),
            'rejected' => $period->where('status', DtrEntry::STATUS_REJECTED)->count(),
            'locked' => $period->where('status', DtrEntry::STATUS_LOCKED)->count(),
            'readyToApprove' => $period->where('status', DtrEntry::STATUS_OPEN)->where('attendance_status', '!=', 'incomplete')->count(),
            'corrections' => $pendingCorrections,
        ];

        // Overtime requests. Time corrections are decided on the day itself, in Timesheets.
        $requestsBase = AttendanceRequest::query()
            ->where('entity_id', $entityId)
            ->where('request_type', AttendanceRequest::TYPE_OVERTIME)
            ->when(! $canViewTeam && $self, fn ($q) => $q->where('employee_id', $self->id));

        $attendanceRequests = (clone $requestsBase)
            ->with([self::EMPLOYEE_COLUMNS, 'dtrEntry', 'reviewer:id,firstname,lastname', 'filer:id,firstname,lastname'])
            ->when($requestStatus !== 'all', fn ($q) => $q->where('status', $requestStatus))
            ->orderByRaw("case when status = 'pending' then 0 else 1 end")
            ->orderByDesc('created_at')
            ->paginate(15, ['*'], 'requests_page')
            ->withQueryString();
        AttendanceRequest::loadDayRecords($attendanceRequests->getCollection());

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
                'status' => $recordStatus === '' ? 'all' : $recordStatus,
                'request_status' => $requestStatus,
            ],
            'entries' => $entries,
            'approval' => $approval,
            'summary' => $this->staffSummary($period),
            'periods' => $periods->map(fn (PayrollPeriod $p) => [
                'id' => $p->id,
                'code' => $p->code,
                'from' => $p->start_date->toDateString(),
                'to' => $p->end_date->toDateString(),
            ]),
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
            'accomplishments' => $self && $view === 'accomplishments'
                ? $this->myAccomplishments($self, $dateFrom, $dateTo, $this->currentCutoff($periods, $today), $today)
                : null,
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
                'accomplishment' => ['nullable', 'required_if:punch_type,check_out,out', 'string', 'max:20000'],
            ], [
                'accomplishment.required_if' => 'Write what you accomplished today before checking out.',
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
                // A forgotten check-in is fixed with a time correction request, not at check-out.
                'check_out' => ! $dtr->time_in ? 'Check in before checking out. Forgot to check in? File a time correction.' : ($dtr->time_out ? 'You have already checked out today.' : null),
            };
            if ($sequenceError) {
                return redirect()->back()->withErrors(['punch_type' => $sequenceError]);
            }

            if ($punchType === 'check_out') {
                // Rich text from the editor: only simple formatting is kept.
                $accomplishment = RichText::sanitize($validated['accomplishment'] ?? '');
                if ($accomplishment === '') {
                    return redirect()->back()->withErrors(['accomplishment' => 'Write what you accomplished today before checking out.']);
                }
                if (mb_strlen(RichText::plainText($accomplishment)) > 2000) {
                    return redirect()->back()->withErrors(['accomplishment' => 'Keep the accomplishment under 2,000 characters.']);
                }

                $missing = array_keys(array_filter([
                    'break-out' => ! $dtr->break_out,
                    'break-in' => ! $dtr->break_in,
                ]));
                if ($missing && blank(trim((string) ($validated['notes'] ?? '')))) {
                    return redirect()->back()->withErrors([
                        'notes' => 'Add a remark: your '.implode(', ', $missing).' '.(count($missing) === 1 ? 'is' : 'are').' missing.',
                    ]);
                }
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
            if ($punchType === 'check_out') {
                $dtr->accomplishment = $accomplishment;
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
     * Approve a single DTR. A pending time correction for the day is approved with it, so each day
     * is reviewed once. Approving the day never grants overtime — payable OT comes only from
     * approved overtime requests.
     */
    public function approveDtr(Request $request, DtrEntry $dtr): RedirectResponse
    {
        $this->attendanceCalculator->assertEditable($dtr);

        $correction = $this->pendingCorrection($dtr);

        // Rolled back as a whole if the corrected day is still missing a punch.
        DB::transaction(function () use ($request, $dtr, $correction) {
            if ($correction) {
                $this->attendanceRequests->review($correction, $request->user(), 'approved');
                $dtr->refresh();
            }

            if ($dtr->attendance_status === 'incomplete') {
                throw ValidationException::withMessages([
                    'dtr' => $correction
                        ? 'Even with the correction this day is missing a punch. Edit the times or reject the day.'
                        : 'This day has a missing punch. Edit the times or reject the day.',
                ]);
            }

            $this->attendanceCalculator->syncApprovedOt($dtr);
            $dtr->fill([
                'status' => DtrEntry::STATUS_APPROVED,
                'approved_by' => $request->user()?->id,
                'approved_at' => now(),
            ])->save();
        });

        return redirect()->back()->with('status', $correction ? 'Correction applied and day approved.' : 'Day approved.');
    }

    /**
     * Reject a day outright: it is not credited in payroll. A pending time correction for the day
     * is rejected with the same reason.
     */
    public function rejectDtr(Request $request, DtrEntry $dtr): RedirectResponse
    {
        $this->attendanceCalculator->assertEditable($dtr);

        $validated = $request->validate([
            'remarks' => ['required', 'string', 'max:255'],
        ], [
            'remarks.required' => 'Tell the employee why the day was rejected.',
        ]);

        $user = $request->user();
        $by = trim(($user?->firstname ?? '').' '.($user?->lastname ?? '')) ?: 'HR';

        DB::transaction(function () use ($dtr, $user, $by, $validated) {
            $correction = $this->pendingCorrection($dtr);
            if ($correction) {
                $this->attendanceRequests->review($correction, $user, 'rejected', $validated['remarks']);
            }

            $dtr->fill([
                'status' => DtrEntry::STATUS_REJECTED,
                'approved_by' => $user?->id,
                'approved_at' => now(),
                'notes' => trim(($dtr->notes ?? '')." [Rejected by {$by}: {$validated['remarks']}]"),
            ])->save();
        });

        return redirect()->back()->with('status', 'Day rejected. It will not be credited in payroll.');
    }

    /**
     * Approve several open DTRs at once. Incomplete or locked days are skipped, and payable OT
     * stays as already approved (via OT requests or single approval).
     */
    public function approveBulk(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['required_without:date_from', 'array', 'min:1', 'max:500'],
            'ids.*' => ['integer'],
            'date_from' => ['required_without:ids', 'date_format:Y-m-d'],
            'date_to' => ['required_with:date_from', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'employee_id' => ['nullable', 'integer'],
            'employee_ids' => ['nullable', 'array', 'max:500'],
            'employee_ids.*' => ['integer'],
        ]);

        // A period (optionally limited to some employees) approves every open day in it, across all pages.
        $entries = isset($validated['ids'])
            ? DtrEntry::query()->whereIn('id', $validated['ids'])->get()
            : DtrEntry::query()
                ->where('status', DtrEntry::STATUS_OPEN)
                ->whereBetween('work_date', [$validated['date_from'], $validated['date_to']])
                ->when($validated['employee_id'] ?? null, fn ($q, $id) => $q->where('employee_id', $id))
                ->when($validated['employee_ids'] ?? null, fn ($q, $ids) => $q->whereIn('employee_id', $ids))
                ->get();
        $approved = 0;
        $skipped = 0;

        $withCorrection = AttendanceRequest::query()
            ->where('request_type', AttendanceRequest::TYPE_CORRECTION)
            ->where('status', 'pending')
            ->whereIn('employee_id', $entries->pluck('employee_id')->unique())
            ->get(['employee_id', 'work_date'])
            ->map(fn ($r) => $r->employee_id.'|'.$r->work_date->toDateString())
            ->flip();

        foreach ($entries as $dtr) {
            // A day with a pending correction is approved on its own, after looking at the change.
            if ($dtr->status !== DtrEntry::STATUS_OPEN
                || $dtr->attendance_status === 'incomplete'
                || $withCorrection->has($dtr->employee_id.'|'.$dtr->work_date->toDateString())) {
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
            $message .= " Skipped {$skipped} (missing punch, pending correction, or already decided).";
        }

        return redirect()->back()->with('status', $message);
    }

    /**
     * Send the approved days of some employees in a period back to pending. Days already locked by
     * a payroll computation stay as they are.
     */
    public function reopenBulk(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'date_from' => ['required', 'date_format:Y-m-d'],
            'date_to' => ['required', 'date_format:Y-m-d', 'after_or_equal:date_from'],
            'employee_ids' => ['required', 'array', 'min:1', 'max:500'],
            'employee_ids.*' => ['integer'],
        ]);

        $reopened = DtrEntry::query()
            ->where('status', DtrEntry::STATUS_APPROVED)
            ->whereBetween('work_date', [$validated['date_from'], $validated['date_to']])
            ->whereIn('employee_id', $validated['employee_ids'])
            ->update(['status' => DtrEntry::STATUS_OPEN, 'approved_by' => null, 'approved_at' => null]);

        return redirect()->back()->with('status', "Unapproved {$reopened} time ".str('record')->plural($reopened).'.');
    }

    /**
     * Send an approved or rejected (not yet locked) DTR back to pending.
     */
    public function reopenDtr(DtrEntry $dtr): RedirectResponse
    {
        $this->attendanceCalculator->assertEditable($dtr);

        $dtr->update([
            'status' => DtrEntry::STATUS_OPEN,
            'approved_by' => null,
            'approved_at' => null,
        ]);

        return redirect()->back()->with('status', 'Day is back to pending.');
    }

    /**
     * File a day-level request (correction, overtime, official business).
     */
    public function storeRequest(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $user = $request->user();
        $isManager = $this->employeeResolver->isHr($user, 'attendance.manage');

        $validated = $request->validate(
            ['employee_id' => ['required', 'exists:employees,id'], ...$this->attendanceRequests->rules()],
            $this->attendanceRequests->messages(),
        );

        if (! $isManager) {
            $currentUserEmployee = $this->employeeResolver->forUser($user, $entityId);
            if (! $currentUserEmployee) {
                return redirect()->back()->withErrors(['employee_id' => 'No active employee profile linked.']);
            }
            $validated['employee_id'] = $currentUserEmployee->id;
        }

        $employee = Employee::query()->where('entity_id', $entityId)->findOrFail($validated['employee_id']);
        $this->attendanceRequests->file($employee, $validated, $user);

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

        $this->attendanceRequests->review($attendanceRequest, $request->user(), $validated['status'], $validated['review_remarks'] ?? null);

        return redirect()->back()->with('status', 'Request '.$validated['status'].' for '.$attendanceRequest->employee?->name.'.');
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

        $this->attendanceRequests->cancel($attendanceRequest);

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

        return redirect()->back()->with('status', "Day closed for {$label}: {$summary['absent']} absent, {$summary['on_leave']} on leave, {$summary['official_business']} on official business, {$summary['holiday']} holiday, {$summary['skipped']} already recorded.");
    }

    /**
     * Live status of every active employee today, for the team board.
     *
     * @return array{rows: array<int, array<string, mixed>>, counts: array<string, int>, holiday: ?string}
     */
    private function todayBoard(?int $entityId): array
    {
        return app(TeamBoard::class)->build($entityId);
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
            'officialBusiness' => $this->attendanceCalculator->approvedOfficialBusiness($employee->id, $today)?->only(['destination']),
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

    /**
     * The pay period that contains today, else the calendar cut-off (1–15 or 16–end of month).
     *
     * @return array{0: string, 1: string}
     */
    /**
     * The employee's days in a period with what they wrote, and whether each can still be written.
     * Editable: in the current pay period (the next to be paid), up to today, not yet approved.
     * An approved official business day can be written before its time record exists.
     *
     * @param  array{0: string, 1: string}  $window
     */
    private function myAccomplishments(Employee $employee, string $from, string $to, array $window, Carbon $today): array
    {
        $records = DtrEntry::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('work_date', [$from, $to])
            ->get()
            ->keyBy(fn (DtrEntry $d) => $d->work_date->toDateString());

        $business = AttendanceRequest::query()
            ->where('employee_id', $employee->id)
            ->where('request_type', AttendanceRequest::TYPE_OFFICIAL_BUSINESS)
            ->where('status', 'approved')
            ->whereBetween('work_date', [$from, min($to, $today->toDateString())])
            ->get()
            ->keyBy(fn (AttendanceRequest $a) => $a->work_date->toDateString());

        $days = $records->keys()->merge($business->keys())->unique()->sortDesc()->values();

        $rows = $days->map(function (string $date) use ($records, $business, $window, $today) {
            $dtr = $records->get($date);
            $ob = $business->get($date);

            $lockedBy = match (true) {
                $date < $window[0] => 'Past pay period',
                $date > $window[1] || $date > $today->toDateString() => 'Not yet',
                $dtr && $dtr->status !== DtrEntry::STATUS_OPEN => $dtr->status === DtrEntry::STATUS_REJECTED ? 'Day rejected' : 'Day approved',
                default => null,
            };

            return [
                'date' => $date,
                'dtr_id' => $dtr?->id,
                'time_in' => $dtr?->time_in,
                'break_out' => $dtr?->break_out,
                'break_in' => $dtr?->break_in,
                'time_out' => $dtr?->time_out,
                'regular_hours' => $dtr ? (float) $dtr->regular_hours : null,
                'ot_hours_approved' => $dtr ? (float) $dtr->ot_hours_approved : null,
                'tardiness_minutes' => (int) ($dtr?->tardiness_minutes ?? 0),
                'undertime_minutes' => (int) ($dtr?->undertime_minutes ?? 0),
                'status' => $dtr?->status,
                'attendance_status' => $dtr?->attendance_status,
                'accomplishment' => $dtr?->accomplishment,
                'official_business' => $ob ? ($ob->destination ?? '') : null,
                'editable' => $lockedBy === null,
                'locked_reason' => $lockedBy,
            ];
        });

        return [
            'rows' => $rows->all(),
            'window' => ['from' => $window[0], 'to' => min($window[1], $today->toDateString())],
            'missing' => $rows->where('editable', true)->filter(fn ($r) => RichText::isBlank($r['accomplishment']))->count(),
        ];
    }

    /**
     * Write or update the signed-in employee's accomplishment for one day (see myAccomplishments for the rules).
     */
    public function updateAccomplishment(Request $request, EntityContext $entityContext): RedirectResponse
    {
        $entityId = $entityContext->id();
        $employee = $this->employeeResolver->forUser($request->user(), $entityId);
        abort_unless($employee, 403);

        $validated = $request->validate([
            'work_date' => ['required', 'date_format:Y-m-d'],
            'accomplishment' => ['required', 'string', 'max:20000'],
        ], [
            'accomplishment.required' => 'Write what you accomplished that day.',
        ]);

        $today = Carbon::today();
        $periods = PayrollPeriod::query()->where('entity_id', $entityId)->orderByDesc('start_date')->limit(24)->get(['id', 'code', 'start_date', 'end_date']);
        [$windowStart, $windowEnd] = $this->currentCutoff($periods, $today);
        $date = $validated['work_date'];

        if ($date < $windowStart || $date > $windowEnd || $date > $today->toDateString()) {
            throw ValidationException::withMessages(['work_date' => 'Only days in the current pay period, up to today, can be written or changed.']);
        }

        $accomplishment = RichText::sanitize($validated['accomplishment']);
        if ($accomplishment === '') {
            throw ValidationException::withMessages(['accomplishment' => 'Write what you accomplished that day.']);
        }
        if (mb_strlen(RichText::plainText($accomplishment)) > 2000) {
            throw ValidationException::withMessages(['accomplishment' => 'Keep the accomplishment under 2,000 characters.']);
        }

        $dtr = DtrEntry::query()->where('employee_id', $employee->id)->whereDate('work_date', $date)->first();

        if ($dtr && $dtr->status !== DtrEntry::STATUS_OPEN) {
            throw ValidationException::withMessages(['work_date' => 'This day has already been decided by your timekeeper, so its accomplishment can no longer change.']);
        }

        if (! $dtr) {
            // Only an approved official business day can be written without a check-in.
            $ob = $this->attendanceCalculator->approvedOfficialBusiness($employee->id, $date);
            if (! $ob) {
                throw ValidationException::withMessages(['work_date' => 'There is no time record for this day.']);
            }
            $dtr = $this->attendanceCalculator->applyOfficialBusiness(null, $employee, $ob);
            $dtr->save();
            $ob->update(['dtr_entry_id' => $dtr->id]);
        }

        $dtr->update(['accomplishment' => $accomplishment]);

        return redirect()->back()->with('status', 'Accomplishment saved.');
    }

    private function currentCutoff(EloquentCollection $periods, Carbon $today): array
    {
        $current = $periods->first(fn (PayrollPeriod $p) => $p->start_date->lte($today) && $p->end_date->gte($today));
        if ($current) {
            return [$current->start_date->toDateString(), $current->end_date->toDateString()];
        }

        return $today->day <= 15
            ? [$today->copy()->startOfMonth()->toDateString(), $today->copy()->day(15)->toDateString()]
            : [$today->copy()->day(16)->toDateString(), $today->copy()->endOfMonth()->toDateString()];
    }

    /**
     * Hours per staff for the period. Rejected days are not counted; overtime is only what an
     * approved overtime request covers.
     *
     * @param  EloquentCollection<int, DtrEntry>  $period
     * @return array<int, array<string, mixed>>
     */
    private function staffSummary(EloquentCollection $period): array
    {
        $period->load(self::EMPLOYEE_COLUMNS);

        return $period
            ->groupBy('employee_id')
            ->map(function ($days) {
                $credited = $days->where('status', '!=', DtrEntry::STATUS_REJECTED);
                $regular = round((float) $credited->sum('regular_hours'), 2);
                $overtime = round((float) $credited->sum('ot_hours_approved'), 2);

                return [
                    'employee' => $days->first()->employee,
                    'days_worked' => $credited->whereIn('attendance_status', AttendanceCalculator::WORKED_STATUSES)->count(),
                    'regular_hours' => $regular,
                    'ot_hours' => $overtime,
                    'total_hours' => round($regular + $overtime, 2),
                    'pending' => $days->where('status', DtrEntry::STATUS_OPEN)->count(),
                    // Open days that bulk approval can take (no missing punch); corrections are still checked on approval.
                    'ready' => $days->where('status', DtrEntry::STATUS_OPEN)->where('attendance_status', '!=', 'incomplete')->count(),
                    'approved' => $days->where('status', DtrEntry::STATUS_APPROVED)->count(),
                    'locked' => $days->where('status', DtrEntry::STATUS_LOCKED)->count(),
                    'rejected' => $days->where('status', DtrEntry::STATUS_REJECTED)->count(),
                    'leave_days' => $days->where('attendance_status', 'on_leave')->count(),
                ];
            })
            ->sortBy(fn ($row) => $row['employee']?->lastname)
            ->values()
            ->all();
    }

    private function pendingCorrection(DtrEntry $dtr): ?AttendanceRequest
    {
        return AttendanceRequest::query()
            ->where('employee_id', $dtr->employee_id)
            ->whereDate('work_date', $dtr->work_date)
            ->where('request_type', AttendanceRequest::TYPE_CORRECTION)
            ->where('status', 'pending')
            ->latest()
            ->first();
    }

    /**
     * Put each day's pending time correction on its row, so it is decided together with the day.
     *
     * @param  Collection<int, DtrEntry>  $entries
     */
    private function attachPendingCorrections(Collection $entries): void
    {
        if ($entries->isEmpty()) {
            return;
        }

        $corrections = AttendanceRequest::query()
            ->where('request_type', AttendanceRequest::TYPE_CORRECTION)
            ->where('status', 'pending')
            ->whereIn('employee_id', $entries->pluck('employee_id')->unique())
            ->whereDate('work_date', '>=', $entries->min(fn (DtrEntry $e) => $e->work_date->toDateString()))
            ->whereDate('work_date', '<=', $entries->max(fn (DtrEntry $e) => $e->work_date->toDateString()))
            ->get(['id', 'employee_id', 'work_date', 'requested_time_in', 'requested_break_out', 'requested_break_in', 'requested_time_out', 'reason', 'created_at'])
            ->keyBy(fn ($r) => $r->employee_id.'|'.$r->work_date->toDateString());

        $entries->each(fn (DtrEntry $e) => $e->setAttribute(
            'pending_correction',
            $corrections->get($e->employee_id.'|'.$e->work_date->toDateString())
        ));
    }

    private function dateParam(mixed $value): ?string
    {
        if (! is_string($value) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return null;
        }

        return $value;
    }
}
