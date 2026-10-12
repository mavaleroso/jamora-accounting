<?php

namespace App\Http\Controllers\EmployeeManagement;

use App\Http\Controllers\Controller;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttendanceController extends Controller
{
    /**
     * Calculate Haversine distance in meters between two lat/long coordinates.
     */
    public static function calculateDistance(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $earthRadius = 6371000; // Earth's radius in meters
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

        $user = $request->user();
        $isManager = $user && ($user->can('attendance.manage') || $user->can('payroll.manage'));

        $currentUserEmployee = null;
        if ($user) {
            $currentUserEmployee = Employee::where('entity_id', $entityId)
                ->where(function ($q) use ($user) {
                    $q->where('user_id', $user->id)
                        ->orWhere('email', $user->email);
                })
                ->first(['id', 'employee_code', 'firstname', 'lastname', 'position', 'department']);
        }

        if (! $isManager && $currentUserEmployee) {
            $employeeId = $currentUserEmployee->id;
        }

        $query = DtrEntry::query()
            ->with('employee:id,employee_code,firstname,lastname,position,department,biometric_id')
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
                    ->orWhere('ot_hours', '>', 0)
                    ->orWhere('is_absent', true)
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
            'totalOtHours' => (float) $allWeekEntries->sum('ot_hours'),
            'totalTardinessMinutes' => (int) $allWeekEntries->sum('tardiness_minutes'),
            'exceptionsCount' => $allWeekEntries->filter(fn ($e) => $e->tardiness_minutes > 0 || $e->ot_hours > 0 || $e->is_absent)->count(),
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
            'geofence_enforced' => (bool) ($currentEntity?->geofence_enforced ?? true),
        ];

        $today = Carbon::today()->toDateString();
        $todayEntries = DtrEntry::where('entity_id', $entityId)
            ->where('work_date', $today)
            ->get()
            ->keyBy('employee_id');

        return Inertia::render('employee-management/attendance/page', [
            'entries' => $entries,
            'employees' => $employees,
            'kpis' => $kpis,
            'branchLocation' => $branchLocation,
            'todayEntries' => $todayEntries,
            'currentUserEmployee' => $currentUserEmployee,
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
        $entityId = $entityContext->id();
        $currentEntity = $entityContext->current();

        $branchLat = $currentEntity?->latitude !== null ? (float) $currentEntity->latitude : 14.5547;
        $branchLon = $currentEntity?->longitude !== null ? (float) $currentEntity->longitude : 121.0244;
        $geofenceRadius = (int) ($currentEntity?->geofence_radius ?? 250);
        $geofenceEnforced = (bool) ($currentEntity?->geofence_enforced ?? true);

        // Web Direct Punch with Coordinates (Check-in, Break-out, Break-in, Check-out)
        if ($request->has('punch_type')) {
            $validated = $request->validate([
                'employee_id' => ['required', 'exists:employees,id'],
                'punch_type' => ['required', 'in:check_in,break_out,break_in,check_out,in,out'],
                'latitude' => ['nullable', 'numeric'],
                'longitude' => ['nullable', 'numeric'],
                'punch_time' => ['nullable', 'string'],
                'notes' => ['nullable', 'string'],
            ]);

            $user = $request->user();
            $isManager = $user && ($user->can('attendance.manage') || $user->can('payroll.manage'));

            if (! $isManager) {
                $currentUserEmployee = Employee::where('entity_id', $entityId)
                    ->where(function ($q) use ($user) {
                        if ($user) {
                            $q->where('user_id', $user->id)
                                ->orWhere('email', $user->email);
                        }
                    })
                    ->first();

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
                    return redirect()->back()->withErrors([
                        'location' => 'GPS coordinates are required to clock attendance. Please allow browser location access.',
                    ]);
                }

                if ($distance > $geofenceRadius) {
                    $branchName = $currentEntity?->name ?? 'Authorized Branch';

                    return redirect()->back()->withErrors([
                        'location' => "Clocking disabled: You are {$distance}m away from {$branchName}. Allowed perimeter is within {$geofenceRadius}m.",
                    ]);
                }
            }

            $locationStatus = ($distance !== null && $distance <= $geofenceRadius)
                ? 'verified'
                : ($distance === null ? 'manual' : 'out_of_bounds');

            $punchTime = !empty($validated['punch_time'])
                ? Carbon::parse($validated['punch_time'])
                : Carbon::now();

            $workDate = $punchTime->toDateString();
            $timeStr = $punchTime->format('H:i:s');

            $dtr = DtrEntry::where('employee_id', $validated['employee_id'])
                ->whereDate('work_date', $workDate)
                ->first();

            if (! $dtr) {
                $dtr = new DtrEntry([
                    'entity_id' => $entityId,
                    'employee_id' => $validated['employee_id'],
                    'work_date' => $workDate,
                ]);
            }

            $punchType = $validated['punch_type'];
            $statusMsg = 'Attendance punch recorded successfully.';

            if ($punchType === 'check_in' || $punchType === 'in') {
                $dtr->time_in = $timeStr;
                $dtr->in_latitude = $lat;
                $dtr->in_longitude = $lon;
                $dtr->distance_meters = $distance;
                $dtr->location_status = $locationStatus;
                $dtr->source = 'web_geofence';

                $scheduledIn = Carbon::parse($workDate.' 09:00:00');
                if ($punchTime->gt($scheduledIn)) {
                    $dtr->tardiness_minutes = $scheduledIn->diffInMinutes($punchTime);
                } else {
                    $dtr->tardiness_minutes = 0;
                }

                $statusMsg = "Check-In recorded at {$timeStr}".($distance !== null ? " ({$distance}m from branch - Verified)." : '.');
            } elseif ($punchType === 'break_out') {
                $dtr->break_out = $timeStr;
                $dtr->source = 'web_geofence';
                $statusMsg = "Break-Out recorded at {$timeStr}. Enjoy your break!";
            } elseif ($punchType === 'break_in') {
                $dtr->break_in = $timeStr;
                $dtr->source = 'web_geofence';
                $statusMsg = "Break-In recorded at {$timeStr}. Welcome back!";
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

            // Calculate total regular and overtime hours taking break duration into account
            if ($dtr->time_in && $dtr->time_out) {
                $in = Carbon::parse($workDate.' '.$dtr->time_in);
                $out = Carbon::parse($workDate.' '.$dtr->time_out);
                if ($out->gt($in)) {
                    $totalMinutes = $in->diffInMinutes($out);
                    $breakMinutes = 0;

                    if ($dtr->break_out && $dtr->break_in) {
                        $bOut = Carbon::parse($workDate.' '.$dtr->break_out);
                        $bIn = Carbon::parse($workDate.' '.$dtr->break_in);
                        if ($bIn->gt($bOut)) {
                            $breakMinutes = $bOut->diffInMinutes($bIn);
                        }
                    } elseif ($totalMinutes > 300) {
                        // Standard 1 hr break deduction if total span exceeds 5 hours and no explicit break punches
                        $breakMinutes = 60;
                    }

                    $netMinutes = max(0, $totalMinutes - $breakMinutes);
                    $netHours = round($netMinutes / 60, 2);
                    $dtr->regular_hours = min(8, $netHours);
                    $dtr->ot_hours = max(0, $netHours - 8);

                    if ($punchType === 'check_out' || $punchType === 'out') {
                        $statusMsg .= " Worked: {$dtr->regular_hours} regular hrs".($dtr->ot_hours > 0 ? " + {$dtr->ot_hours} OT hrs." : '.');
                    }
                }
            }

            $dtr->is_absent = false;
            if (!empty($validated['notes'])) {
                $dtr->notes = trim(($dtr->notes ?? '').' '.$validated['notes']);
            }
            $dtr->save();

            return redirect()->back()->with('status', $statusMsg);
        }

        // Direct / Manual / Test Punch (Maintains compatibility with tests and administrative batch entries)
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

        $timeIn = !empty($validated['time_in']) ? Carbon::parse($validated['time_in'])->format('H:i:s') : null;
        $breakOut = !empty($validated['break_out']) ? Carbon::parse($validated['break_out'])->format('H:i:s') : null;
        $breakIn = !empty($validated['break_in']) ? Carbon::parse($validated['break_in'])->format('H:i:s') : null;
        $timeOut = !empty($validated['time_out']) ? Carbon::parse($validated['time_out'])->format('H:i:s') : null;

        $regularHours = $validated['regular_hours'] ?? 8.0;
        $otHours = $validated['ot_hours'] ?? 0.0;
        $tardinessMinutes = $validated['tardiness_minutes'] ?? 0.0;

        if (!isset($validated['regular_hours']) && $timeIn && $timeOut) {
            $in = Carbon::parse($workDate.' '.$timeIn);
            $out = Carbon::parse($workDate.' '.$timeOut);
            if ($out->gt($in)) {
                $totalMinutes = $in->diffInMinutes($out);
                $breakMinutes = 0;

                if ($breakOut && $breakIn) {
                    $bOut = Carbon::parse($workDate.' '.$breakOut);
                    $bIn = Carbon::parse($workDate.' '.$breakIn);
                    if ($bIn->gt($bOut)) {
                        $breakMinutes = $bOut->diffInMinutes($bIn);
                    }
                } elseif ($totalMinutes > 300) {
                    $breakMinutes = 60;
                }

                $netMinutes = max(0, $totalMinutes - $breakMinutes);
                $netHours = round($netMinutes / 60, 2);
                $regularHours = min(8, $netHours);
                $otHours = max(0, $netHours - 8);
            }
        }

        $dtr = DtrEntry::where('employee_id', $validated['employee_id'])
            ->whereDate('work_date', $workDate)
            ->first();

        if (! $dtr) {
            $dtr = new DtrEntry([
                'entity_id' => $entityId,
                'employee_id' => $validated['employee_id'],
                'work_date' => $workDate,
            ]);
        }

        $dtr->fill([
            'entity_id' => $entityId,
            'time_in' => $timeIn,
            'break_out' => $breakOut,
            'break_in' => $breakIn,
            'time_out' => $timeOut,
            'regular_hours' => $regularHours,
            'ot_hours' => $otHours,
            'tardiness_minutes' => $tardinessMinutes,
            'is_absent' => false,
            'source' => 'web_coordinates',
            'location_status' => 'manual',
            'notes' => $validated['notes'] ?? 'Direct attendance record',
        ]);
        $dtr->save();

        return redirect()->back()->with('status', 'Attendance punch recorded.');
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

    public function store(Request $request, EntityContext $entityContext): RedirectResponse
    {
        return $this->recordPunch($request, $entityContext);
    }

    public function verifyPunch(DtrEntry $dtr): RedirectResponse
    {
        $dtr->update([
            'notes' => trim(($dtr->notes ?? '').' [Verified by HR]'),
            'location_status' => 'verified',
        ]);

        return redirect()->back()->with('status', 'Attendance punch verified.');
    }

    public function verify(DtrEntry $entry): RedirectResponse
    {
        return $this->verifyPunch($entry);
    }
}
