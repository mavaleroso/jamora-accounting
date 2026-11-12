<?php

namespace Database\Seeders;

use App\Models\AttendanceRequest;
use App\Models\BankAccount;
use App\Models\ComplianceItem;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollAdjustment;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\PerformanceEvaluation;
use App\Models\ShiftRoster;
use App\Models\ShiftTemplate;
use App\Models\User;
use App\Services\Payroll\PayrollService;
use App\Services\People\AttendanceCalculator;
use App\Services\People\ComplianceCalendar;
use App\Services\People\LeaveService;
use App\Support\EntityContext;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Dummy records for every Employee Management module, for the employees each company already has (unlike
 * DemoSeeder, which adds its own EMP-10xx sample staff to one company):
 *
 *   php artisan db:seed --class=EmployeeManagementDemoSeeder
 *
 *   Shift & Roster       last and this week published, next week in draft, a swapped rest day and a special shift
 *   Time & Attendance    punches from five cut-offs back to today: lates, undertime, overtime, absences, holidays,
 *                        official business; history approved, the last few days open, today up to the current time
 *   Employee Requests    leave (approved, declined, cancelled, pending), overtime, time corrections, official
 *                        business and absence notices
 *   Payroll / My Pay     semi-monthly cut-offs: paid, paid, posted, approved and the current one in draft
 *   Performance          acknowledged, shared and draft reviews
 *   Compliance           filings verified, filed (some late), prepared and still pending
 *
 * Employee records and benefit enrollments are left as they are. A company that already has time, leave, roster or
 * payroll records is skipped, so nothing is ever overwritten; reviews and compliance are likewise only added where
 * there are none yet. Leave goes through LeaveService and payroll through PayrollService (posted and paid runs book
 * their journal entries), so balances, ledgers and the books stay consistent with what the screens would produce.
 *
 * php artisan accounting:clear-demo-data --force removes it, together with all other transactions and the employees.
 */
class EmployeeManagementDemoSeeder extends Seeder
{
    /** Payroll status of the four cut-offs before the current one, then the current one. */
    private const HISTORY = ['paid', 'paid', 'posted', 'approved', 'draft'];

    private const ACCOMPLISHMENTS = [
        '<ul><li>Assisted walk-in patients with frame selection and fitting</li><li>Released 6 finished job orders</li><li>Updated the patient recall list</li></ul>',
        '<ul><li>Pre-tested patients for the optometrist (auto-ref, visual acuity)</li><li>Encoded 9 prescriptions</li><li>Followed up 4 pending lens orders with the lab</li></ul>',
        '<ul><li>Edged and mounted 7 pairs of single-vision lenses</li><li>Repaired 3 frames (nose pads, temple screws)</li><li>Cleaned and calibrated the edger</li></ul>',
        '<ul><li>Counted and restocked the contact lens and solution shelves</li><li>Received the frame delivery and tagged 40 pieces</li><li>Balanced the day’s cash sales</li></ul>',
        '<ul><li>Handled front desk: 14 patients booked, 11 seen</li><li>Collected balances on 5 job orders</li><li>Filed the day’s official receipts</li></ul>',
        '<ul><li>Adjusted and cleaned frames for returning customers</li><li>Prepared quotations for 2 company accounts</li><li>Arranged the new arrivals display</li></ul>',
    ];

    private AttendanceCalculator $calculator;

    private LeaveService $leave;

    private PayrollService $payroll;

    private ComplianceCalendar $compliance;

    private User $owner;

    private ?User $accountant = null;

    /** @var Collection<string, LeaveType> */
    private Collection $leaveTypes;

    public function run(AttendanceCalculator $calculator, LeaveService $leave, PayrollService $payroll, ComplianceCalendar $compliance, EntityContext $context): void
    {
        if (app()->isProduction()) {
            $this->command?->warn('Dummy data is not seeded in production.');

            return;
        }

        $owner = User::query()->where('username', 'admin')->first() ?? User::query()->orderBy('id')->first();
        if (! $owner) {
            $this->command?->warn('No user found — run DatabaseSeeder first.');

            return;
        }

        [$this->calculator, $this->leave, $this->payroll, $this->compliance, $this->owner] = [$calculator, $leave, $payroll, $compliance, $owner];
        $this->accountant = User::query()->whereKeyNot($owner->id)->whereHas('roles', fn ($q) => $q->where('name', 'Accountant'))->orderBy('id')->first();
        $this->leaveTypes = LeaveType::query()->where('is_active', true)->get()->keyBy('code');

        foreach (Entity::query()->orderBy('id')->get() as $entity) {
            $context->runAs($entity, fn () => $this->seedEntity($entity));
        }
    }

    private function seedEntity(Entity $entity): void
    {
        $employees = Employee::query()
            ->where('is_active', true)
            ->where('employment_status', 'active')
            ->orderBy('employee_code')
            ->get();

        if ($employees->isEmpty()) {
            $this->command?->warn("{$entity->name}: no active employees — skipped.");

            return;
        }

        // The approver cannot decide their own leave or review themselves.
        $staff = $employees->reject(fn (Employee $e) => $e->user_id === $this->owner->id)->values();
        $today = Carbon::today();
        mt_srand(20261111 + $entity->id);

        if ($this->hasRecords()) {
            $this->command?->warn("{$entity->name}: already has time, leave, roster or payroll records — those modules were left alone.");
        } else {
            $current = $this->cutoffStart($today);
            $periods = collect(range(-4, 2))
                ->map(fn (int $i) => $this->period($entity, $this->shiftCutoff($current, $i)))
                ->filter()
                ->values();
            $history = $periods->filter(fn (PayrollPeriod $p) => $p->start_date->lte($today))->values();

            $this->seedRoster($entity, $employees, $today);
            $away = $this->seedLeaves($staff, $history, $today);
            $away = $this->seedOfficialBusiness($staff, $history, $away);
            $this->seedAttendance($entity, $employees, $history->first()->start_date->copy(), $current, $away);
            $this->seedRequests($staff, $today);
            $this->seedPayroll($entity, $history);
        }

        $this->seedPerformance($entity, $staff, $today);
        $this->seedCompliance($entity, $today);
    }

    private function hasRecords(): bool
    {
        foreach ([DtrEntry::class, AttendanceRequest::class, LeaveRequest::class, ShiftRoster::class, PayrollPeriod::class] as $model) {
            if ($model::query()->exists()) {
                return true;
            }
        }

        return false;
    }

    // ----------------------------------------------------------------------------------------- Shift & Roster

    /**
     * Last week and this week published, next week still in draft. This week one employee's rest day is moved to
     * Thursday; last week another worked an early Saturday shift.
     *
     * @param  Collection<int, Employee>  $employees
     */
    private function seedRoster(Entity $entity, Collection $employees, Carbon $today): void
    {
        $template = ShiftTemplate::companyDefault($entity->id);
        $default = ShiftTemplate::defaultShift($entity->id);
        $time = fn (string $t) => Carbon::parse($t)->format('H:i:s');
        $rows = 0;

        foreach ([-1, 0, 1] as $offset) {
            $weekStart = $today->copy()->startOfWeek()->addWeeks($offset);
            $published = $offset < 1;

            foreach ($employees as $i => $employee) {
                $rest = $employee->restDayNumbers();
                $swaps = $offset === 0 && $i === 1 && ! in_array(Carbon::THURSDAY, $rest, true);

                foreach (CarbonPeriod::create($weekStart, $weekStart->copy()->addDays(6)) as $date) {
                    if ($employee->hire_date && $employee->hire_date->gt($date)) {
                        continue;
                    }

                    $isRest = in_array($date->dayOfWeek, $rest, true);
                    $shift = [$template?->id, $default['name'], $default['start'], $default['end']];
                    $notes = null;

                    if ($swaps && $date->dayOfWeek === Carbon::THURSDAY) {
                        [$isRest, $notes] = [true, 'Rest day moved here — covering the weekend.'];
                    } elseif ($swaps && $date->dayOfWeek === ($rest[0] ?? null)) {
                        [$isRest, $notes] = [false, 'Covering the weekend; rest day moved to Thursday.'];
                    } elseif ($offset === -1 && $i === 2 && $date->dayOfWeek === Carbon::SATURDAY && ! $isRest) {
                        $shift = [null, 'Stock Count', '08:00', '17:00'];
                        $notes = 'Early start for the monthly stock count.';
                    }

                    ShiftRoster::query()->create([
                        'employee_id' => $employee->id,
                        'roster_date' => $date->toDateString(),
                        'shift_template_id' => $isRest ? null : $shift[0],
                        'shift_name' => $isRest ? 'Rest Day' : $shift[1],
                        'shift_start' => $isRest ? null : $time($shift[2]),
                        'shift_end' => $isRest ? null : $time($shift[3]),
                        'break_minutes' => $isRest ? 0 : $default['break_minutes'],
                        'grace_minutes' => $isRest ? 0 : $default['grace_minutes'],
                        'is_rest_day' => $isRest,
                        'status' => $published ? ShiftRoster::STATUS_PUBLISHED : ShiftRoster::STATUS_DRAFT,
                        'published_at' => $published ? $weekStart->copy()->subDays(3)->setTime(16, 0) : null,
                        'published_by' => $published ? $this->owner->id : null,
                        'notes' => $notes,
                    ]);
                    $rows++;
                }
            }
        }

        $this->command?->info("{$entity->name}: {$rows} roster days.");
    }

    // ----------------------------------------------------------------------------------------- Leave

    /**
     * Leave in every state, filed and decided through LeaveService on back-dated days so notice rules, balances and
     * the ledger come out as they would on screen. Each filing tries the listed leave types in order and uses the
     * first the employee is entitled to (staff on Service Incentive Leave only mostly end up on leave without pay).
     *
     * @param  Collection<int, Employee>  $staff
     * @param  Collection<int, PayrollPeriod>  $history
     * @return array<int, array<string, true>> employee id => dates away from work
     */
    private function seedLeaves(Collection $staff, Collection $history, Carbon $today): array
    {
        $n = $staff->count();
        if ($n === 0) {
            return [];
        }
        $pick = fn (int $i) => $staff[$i % $n];
        $at = fn (int $period, int $days) => $history[min($period, $history->count() - 1)]->start_date->copy()->addDays($days);
        $decide = fn (LeaveRequest $r) => $r->created_at->copy()->addDay()->setTime(10, 30)->min(Carbon::now());

        // [employee, leave types to try, from, working days, reason, outcome, half day, filed on]
        $plan = [
            [$pick(0), ['VL', 'SIL', 'LWOP'], $at(0, 3), 1, 'Family matter in the province.', 'approved'],
            [$pick(1), ['EL', 'LWOP'], $at(1, 5), 1, 'Child’s school enrollment and medical check-up.', 'approved'],
            [$pick(2), ['VL', 'SIL', 'LWOP'], $at(2, 8), 2, 'Town fiesta — going home to the province.', 'approved'],
            [$pick(3), ['VL', 'LWOP'], $at(3, 6), 1, 'Personal errands.', 'declined'],
            [$pick(4), ['VL', 'SIL', 'LWOP'], $today->copy()->addDays(9), 1, 'Attending a cousin’s graduation.', 'cancelled'],
            [$pick(0), ['VL', 'SIL', 'LWOP'], $today->copy()->addDays(8), 2, 'Family reunion out of town.', 'pending'],
            [$pick(1), ['VL', 'LWOP'], $today->copy()->addDays(12), 1, 'Morning appointment at the LTO.', 'pending', 'am'],
            [$pick(2), ['VL', 'SIL', 'LWOP'], $today->copy()->addDays(15), 1, 'Wedding sponsor duties.', 'approved'],
            [$pick(5), ['SL', 'LWOP'], $today->copy()->subDay(), 1, 'Migraine — could not report for work.', 'pending', null, Carbon::now()],
        ];

        $count = 0;
        foreach ($plan as $row) {
            [$employee, $codes, $from, $days, $reason, $outcome] = $row;
            $request = $this->fileLeave($employee, $codes, $from, $days, $reason, $row[6] ?? null, $row[7] ?? null);
            if (! $request) {
                continue;
            }
            $count++;

            try {
                Carbon::withTestNow($decide($request), fn () => match ($outcome) {
                    'approved' => $this->leave->approve($request, $this->owner),
                    'declined' => $this->leave->decline($request, $this->owner, 'Two of the staff are already on leave that week — please pick another date.'),
                    'cancelled' => $this->leave->cancel($request, $employee->user ?? $this->owner, 'Plans changed — will file again once the date is final.'),
                    default => null,
                });
            } catch (ValidationException $e) {
                $this->command?->warn("Leave of {$employee->name} left pending: ".collect($e->errors())->flatten()->first());
            }
        }

        $away = [];
        $taken = LeaveRequest::query()
            ->whereIn('status', [LeaveRequest::STATUS_PENDING, LeaveRequest::STATUS_APPROVED])
            ->whereNull('half_day')
            ->get();
        foreach ($taken as $request) {
            foreach (CarbonPeriod::create($request->start_date, $request->end_date) as $date) {
                $away[$request->employee_id][$date->toDateString()] = true;
            }
        }

        $this->command?->info("{$count} leave requests.");

        return $away;
    }

    /**
     * @param  list<string>  $codes
     */
    private function fileLeave(Employee $employee, array $codes, Carbon $from, int $days, string $reason, ?string $halfDay, ?Carbon $filedOn): ?LeaveRequest
    {
        $dates = $this->workDates($employee, $from, $days);
        if ($dates === []) {
            return null;
        }
        $filedOn ??= Carbon::parse($dates[0])->subDays(8)->setTime(9, 10 + $employee->id % 45)->min(Carbon::now());

        foreach ($codes as $code) {
            $type = $this->leaveTypes->get($code);
            if (! $type || ! $this->leave->appliesTo($employee, $type) || ($halfDay && ! $type->allow_half_day)) {
                continue;
            }

            try {
                return Carbon::withTestNow($filedOn, fn () => $this->leave->file($employee, $type, [
                    'start_date' => $dates[0],
                    'end_date' => end($dates),
                    'half_day' => $halfDay,
                    'reason' => $reason,
                ], $employee->user));
            } catch (ValidationException) {
                // Not entitled (service length, credits, notice): try the next type.
            }
        }

        return null;
    }

    /**
     * The first $days consecutive scheduled work days on or after $from (no rest day or holiday inside).
     *
     * @return list<string>
     */
    private function workDates(Employee $employee, Carbon $from, int $days): array
    {
        $dates = [];
        for ($date = $from->copy(), $tries = 0; count($dates) < $days && $tries < 21; $date->addDay(), $tries++) {
            $off = $this->calculator->scheduleFor($employee, $date)->isRestDay || $this->calculator->holidayFor($employee->entity_id, $date);
            $dates = $off ? [] : [...$dates, $date->toDateString()];
        }

        return count($dates) === $days ? $dates : [];
    }

    // ----------------------------------------------------------------------------------------- Time & Attendance

    /**
     * One approved whole-day official business in a past cut-off; the daily close credits the scheduled shift.
     *
     * @param  Collection<int, Employee>  $staff
     * @param  Collection<int, PayrollPeriod>  $history
     * @param  array<int, array<string, true>>  $away
     * @return array<int, array<string, true>>
     */
    private function seedOfficialBusiness(Collection $staff, Collection $history, array $away): array
    {
        $employee = $staff->get(min(3, $staff->count() - 1));
        $period = $history->get(2);
        $date = $employee && $period ? ($this->workDates($employee, $period->start_date->copy()->addDays(3), 1)[0] ?? null) : null;
        if (! $date || isset($away[$employee->id][$date])) {
            return $away;
        }

        $this->fileRequest($employee, AttendanceRequest::TYPE_OFFICIAL_BUSINESS, $date, [
            'destination' => 'Davao City — optical trade fair and supplier meeting',
            'reason' => 'Sent to canvass new frame collections and meet the lens supplier.',
            'status' => 'approved',
            'reviewed_by' => $this->owner->id,
            'reviewed_at' => Carbon::parse($date)->subDays(2)->setTime(15, 20),
            'created_at' => Carbon::parse($date)->subDays(3)->setTime(11, 5),
        ]);
        $away[$employee->id][$date] = true;

        return $away;
    }

    /**
     * Punches for every scheduled day from $from to today. Days before the review window are approved (overtime
     * through an approved request with its accomplishment report); the window (the current cut-off, at most the
     * last five days) keeps lates, missing check-outs and unapproved overtime open for review.
     *
     * @param  Collection<int, Employee>  $employees
     * @param  array<int, array<string, true>>  $away
     */
    private function seedAttendance(Entity $entity, Collection $employees, Carbon $from, Carbon $current, array $away): void
    {
        $now = Carbon::now();
        $today = Carbon::today();
        $openFrom = $current->copy()->max($today->copy()->subDays(5));
        $records = 0;

        for ($date = $from->copy(); $date->lte($today); $date->addDay()) {
            $dateStr = $date->toDateString();
            $isToday = $date->equalTo($today);
            $isHistory = $date->lt($openFrom);
            $holiday = $this->calculator->holidayFor($entity->id, $date);

            foreach ($employees as $i => $employee) {
                if (($employee->hire_date && $employee->hire_date->gt($date)) || isset($away[$employee->id][$dateStr])) {
                    continue; // on leave or official business -> the daily close fills the day
                }

                $schedule = $this->calculator->scheduleFor($employee, $date);
                if ($schedule->isRestDay || ! $schedule->start) {
                    continue;
                }

                $roll = mt_rand(1, 100);
                if (! $isToday && ($roll <= 3 || ($holiday && $roll > 25))) {
                    continue; // no-show, or holiday off -> the daily close marks absent / holiday
                }
                if ($isToday && ($holiday || $i % 7 === 3)) {
                    continue; // a few have not arrived yet
                }

                $start = Carbon::parse($dateStr.' '.$schedule->start);
                $end = Carbon::parse($dateStr.' '.$schedule->end);
                $breakOut = $start->copy()->addHours(4)->addMinutes(mt_rand(-10, 15));
                $overtime = $roll > 91;
                $forgotOut = ! $isHistory && ! $isToday && $roll % 23 === 0;

                $punches = [
                    'time_in' => $start->copy()->addMinutes($roll <= 15 ? mt_rand(6, 40) : -mt_rand(0, 15)),
                    'break_out' => $breakOut,
                    'break_in' => $breakOut->copy()->addMinutes(mt_rand(52, 60)),
                    'time_out' => $forgotOut ? null : $end->copy()->addMinutes(match (true) {
                        $overtime => mt_rand(75, 180),
                        $roll > 86 => -mt_rand(20, 60), // undertime
                        default => mt_rand(0, 10),
                    }),
                ];
                if ($isToday) {
                    $punches = array_map(fn (?Carbon $t) => $t?->lte($now) ? $t : null, $punches);
                    if (! $punches['time_in']) {
                        continue;
                    }
                    $punches['break_in'] = $punches['break_out'] ? $punches['break_in'] : null;
                }

                $outside = ! $isHistory && $roll === 50;
                $dtr = new DtrEntry([
                    'employee_id' => $employee->id,
                    'work_date' => $dateStr,
                    'source' => 'web_geofence',
                    'location_status' => $outside ? 'out_of_bounds' : 'verified',
                    'distance_meters' => $outside ? mt_rand(420, 900) : mt_rand(5, 120),
                    'status' => DtrEntry::STATUS_OPEN,
                    // Checking out asks for the day's accomplishment; overtime is payable only with one.
                    'accomplishment' => $punches['time_out'] ? self::ACCOMPLISHMENTS[($i + $date->day) % count(self::ACCOMPLISHMENTS)] : null,
                ]);
                foreach ($punches as $field => $time) {
                    $dtr->{$field} = $time?->format('H:i:s');
                }

                // Overtime is pre-approved the same day; in the review window some is still waiting (seedRequests).
                if ($overtime && $punches['time_out'] && ($isHistory || $roll % 2 === 0)) {
                    $this->fileRequest($employee, AttendanceRequest::TYPE_OVERTIME, $dateStr, [
                        'reason' => $holiday ? 'Holiday sale — extended store hours.' : 'Extended clinic hours for scheduled patients.',
                        'status' => 'approved',
                        'reviewed_by' => $this->owner->id,
                        'reviewed_at' => $date->copy()->setTime(15, 10),
                        'created_at' => $date->copy()->setTime(13, 5),
                    ]);
                }

                $this->calculator->compute($dtr, $employee)->save();
                $records++;
            }

            if ($isToday) {
                continue;
            }
            $this->calculator->closeDay($entity->id, $date);

            // History is fully reviewed. In the window only the clean days are, and only up to two days ago.
            DtrEntry::query()
                ->whereDate('work_date', $dateStr)
                ->where('status', DtrEntry::STATUS_OPEN)
                ->when(! $isHistory, fn ($q) => $q
                    ->whereDate('work_date', '<', $today->copy()->subDay()->toDateString())
                    ->where('attendance_status', 'present')
                    ->where('ot_hours', 0))
                ->update(['status' => DtrEntry::STATUS_APPROVED, 'approved_by' => $this->owner->id, 'approved_at' => $date->copy()->addDays(2)->setTime(10, 0)->min($now)]);
        }

        $this->command?->info("{$entity->name}: {$records} days of punches since {$from->toDateString()}.");
    }

    /**
     * Requests that match what the time records show: corrections for missing check-outs, overtime waiting for
     * approval, a declined correction, absence notices (in time and late) and requests for the coming days.
     *
     * @param  Collection<int, Employee>  $staff
     */
    private function seedRequests(Collection $staff, Carbon $today): void
    {
        $open = DtrEntry::query()->where('status', DtrEntry::STATUS_OPEN)->whereDate('work_date', '<', $today->toDateString())->orderBy('work_date')->get();
        $employees = Employee::query()->whereIn('id', $open->pluck('employee_id'))->get()->keyBy('id');

        foreach ($open->where('attendance_status', 'incomplete')->take(3) as $dtr) {
            $this->fileRequest($employees[$dtr->employee_id], AttendanceRequest::TYPE_CORRECTION, $dtr->work_date->toDateString(), [
                'dtr_entry_id' => $dtr->id,
                'requested_time_out' => $dtr->scheduled_out,
                'reason' => 'Forgot to check out — left right at the end of my shift.',
                'status' => 'pending',
                'created_at' => $dtr->work_date->copy()->addDay()->setTime(9, 12),
            ]);
        }

        foreach ($open->filter(fn (DtrEntry $d) => (float) $d->ot_hours > 0 && (float) $d->ot_hours_approved <= 0)->take(3) as $dtr) {
            $this->fileRequest($employees[$dtr->employee_id], AttendanceRequest::TYPE_OVERTIME, $dtr->work_date->toDateString(), [
                'dtr_entry_id' => $dtr->id,
                'reason' => 'Stayed to finish a rush lens order for a same-day pickup.',
                'status' => 'pending',
                'created_at' => $dtr->work_date->copy()->setTime(16, 40),
            ]);
        }

        if ($late = $open->first(fn (DtrEntry $d) => (int) $d->tardiness_minutes > 0)) {
            $this->fileRequest($employees[$late->employee_id], AttendanceRequest::TYPE_CORRECTION, $late->work_date->toDateString(), [
                'dtr_entry_id' => $late->id,
                'requested_time_in' => $late->scheduled_in,
                'reason' => 'I forgot to clock in when I arrived, but I was on time.',
                'status' => 'rejected',
                'review_remarks' => 'The branch log shows the arrival after the shift started.',
                'reviewed_by' => $this->owner->id,
                'reviewed_at' => $late->work_date->copy()->addDay()->setTime(14, 0)->min(Carbon::now()),
                'created_at' => $late->work_date->copy()->setTime(10, 0),
            ]);
        }

        // Absences reported by the employee: on time when sent at least the notice hours before the shift.
        $absences = DtrEntry::query()->where('is_absent', true)->orderByDesc('work_date')->limit(4)->get();
        $absentees = Employee::query()->whereIn('id', $absences->pluck('employee_id'))->get()->keyBy('id');
        foreach ($absences as $k => $dtr) {
            $onTime = $k % 2 === 0;
            $this->fileRequest($absentees[$dtr->employee_id], AttendanceRequest::TYPE_ABSENCE_NOTICE, $dtr->work_date->toDateString(), [
                'dtr_entry_id' => $dtr->id,
                'notice_status' => $onTime ? AttendanceRequest::NOTICE_ON_TIME : AttendanceRequest::NOTICE_LATE,
                'reason' => $onTime ? 'Fever since last night — will rest and see a doctor.' : 'Flooded road going to work, could not get a ride.',
                'status' => AttendanceRequest::STATUS_NOTED,
                'created_at' => $dtr->work_date->copy()->setTime($onTime ? 5 : 8, $onTime ? 35 : 50),
            ]);
        }

        // Coming up: official business and an overtime pre-approval waiting for a decision.
        if ($employee = $staff->get(min(4, $staff->count() - 1))) {
            if ($date = $this->workDates($employee, $today->copy()->addDays(2), 1)[0] ?? null) {
                $this->fileRequest($employee, AttendanceRequest::TYPE_OFFICIAL_BUSINESS, $date, [
                    'destination' => 'BIR Revenue District Office',
                    'reason' => 'Submit the stamped books of accounts and claim the new ATP.',
                    'status' => 'pending',
                    'created_at' => Carbon::now()->subHours(3),
                ]);
            }
        }
        if (($employee = $staff->first()) && ! $this->calculator->scheduleFor($employee, $today)->isRestDay) {
            $this->fileRequest($employee, AttendanceRequest::TYPE_OVERTIME, $today->toDateString(), [
                'reason' => 'Month-end inventory count after closing.',
                'status' => 'pending',
                'created_at' => Carbon::now()->subHours(2),
            ]);
        }
    }

    /**
     * Bypasses mass assignment so the request can carry its back-dated filing time.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function fileRequest(Employee $employee, string $type, string $date, array $attributes): void
    {
        (new AttendanceRequest)->forceFill([
            'entity_id' => $employee->entity_id,
            'employee_id' => $employee->id,
            'request_type' => $type,
            'work_date' => $date,
            'filed_by' => $employee->user_id,
            ...$attributes,
        ])->save();
    }

    // ----------------------------------------------------------------------------------------- Payroll

    /**
     * @param  Collection<int, PayrollPeriod>  $history
     */
    private function seedPayroll(Entity $entity, Collection $history): void
    {
        $bank = BankAccount::query()
            ->withoutGlobalScope('entity')
            ->usableBy($entity->id)
            ->where('is_active', true)
            ->orderBy('id')
            ->first();
        $preparer = $this->accountant ?? $this->owner;

        foreach ($history as $i => $period) {
            $target = self::HISTORY[$i] ?? 'draft';
            $run = null;

            try {
                $run = $this->payroll->compute($period, $preparer);
                $this->addAdjustments($run, $preparer, $target === 'draft');
                $run = $this->payroll->compute($period->fresh(), $preparer);

                if ($target !== 'draft') {
                    $run = $this->payroll->approve($run, $this->owner);
                }
                if (in_array($target, ['posted', 'paid'], true)) {
                    $run = $this->payroll->post($run->fresh(), $this->owner);
                }
                if ($target === 'paid') {
                    $run = $this->payroll->pay($run->fresh(), $this->owner, $period->pay_date->toDateString(), $bank);
                }

                $this->command?->info(sprintf('%s %s: %s — %d payslips, net ₱%s', $entity->code, $period->code, $run->status, $run->headcount, number_format((float) $run->net_total, 2)));
            } catch (ValidationException $e) {
                $this->command?->warn("{$entity->code} {$period->code}: stopped at ".($run?->status ?? 'compute').' — '.collect($e->errors())->flatten()->first());
            }
        }
    }

    /**
     * Typical one-off earnings and deductions for the first few paid employees; the draft gets a few more to try.
     */
    private function addAdjustments(PayrollRun $run, User $user, bool $isDraft): void
    {
        $paid = Employee::query()
            ->whereIn('id', $run->payslips()->where('net_pay', '>', 3000)->pluck('employee_id'))
            ->orderBy('employee_code')
            ->get()
            ->values();

        $lines = [
            [0, 'allowance', 'Meal allowance — stock count', 300],
            [1, 'sss_loan', 'SSS salary loan amortization', 350],
        ];
        if ($isDraft) {
            $lines = [
                ...$lines,
                [2, 'bonus', 'Sales incentive — top seller of the cut-off', 1000],
                [3, 'cash_advance', 'Cash advance', 500],
                [0, 'reimbursement', 'Fare for delivering frames to a patient', 180],
            ];
        }

        foreach ($lines as [$index, $category, $description, $amount]) {
            if (! $employee = $paid->get($index)) {
                continue;
            }
            [$kind, , $taxable] = PayrollAdjustment::CATEGORIES[$category];

            PayrollAdjustment::query()->create([
                'entity_id' => $run->entity_id,
                'payroll_run_id' => $run->id,
                'employee_id' => $employee->id,
                'kind' => $kind,
                'category' => $category,
                'description' => $description,
                'amount' => $amount,
                'taxable' => $kind === PayrollAdjustment::KIND_EARNING && $taxable,
                'created_by' => $user->id,
            ]);
        }
    }

    private function cutoffStart(Carbon $date): Carbon
    {
        return $date->day <= 15 ? $date->copy()->startOfMonth() : $date->copy()->day(16);
    }

    private function shiftCutoff(Carbon $start, int $by): Carbon
    {
        $start = $start->copy();
        for ($n = 0; $n < abs($by); $n++) {
            if ($by > 0) {
                $start = $start->day === 1 ? $start->day(16) : $start->addMonthNoOverflow()->startOfMonth();
            } else {
                $start = $start->day === 16 ? $start->day(1) : $start->subMonthNoOverflow()->day(16);
            }
        }

        return $start;
    }

    /**
     * The standard cut-off starting on $start (same codes and pay days as Payroll › Generate periods).
     */
    private function period(Entity $entity, Carbon $start): PayrollPeriod
    {
        $first = $start->day === 1;
        $end = $first ? $start->copy()->day(15) : $start->copy()->endOfMonth();
        $payDays = config('people.payroll.pay_days');

        return PayrollPeriod::query()->create([
            'entity_id' => $entity->id,
            'code' => 'PP-'.$start->format('Y-m').($first ? '-1' : '-2'),
            'frequency' => PayrollPeriod::FREQUENCY_SEMI_MONTHLY,
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
            'pay_date' => PayrollService::payDay($end, (int) ($first ? $payDays['first'] : $payDays['second']))->toDateString(),
            'status' => 'open',
        ]);
    }

    // ----------------------------------------------------------------------------------------- Performance

    /**
     * Reviews for the last half-year (acknowledged, shared), a special review, a draft still being written, and a
     * probationary review for anyone hired in the last six months.
     *
     * @param  Collection<int, Employee>  $staff
     */
    private function seedPerformance(Entity $entity, Collection $staff, Carbon $today): void
    {
        if (PerformanceEvaluation::query()->exists()) {
            return;
        }

        // The half-year that ended most recently, reviewed two weeks later.
        $halfEnd = $today->month >= 7 ? $today->copy()->month(6)->endOfMonth() : $today->copy()->subYear()->endOfYear();
        $halfStart = $halfEnd->copy()->subMonths(5)->startOfMonth();
        $reviewed = $halfEnd->copy()->addDays(15);

        // [review type, period, review date, ratings (quality, service, attendance, teamwork, conduct, initiative), status, text]
        $plan = [
            ['periodic', $halfStart, $halfEnd, $reviewed, [5, 5, 4, 5, 5, 4], 'acknowledged', 0, 'Thank you. I will work on the product training this quarter.'],
            ['periodic', $halfStart, $halfEnd, $reviewed, [4, 4, 3, 4, 4, 3], 'acknowledged', 1, null],
            ['periodic', $halfStart, $halfEnd, $reviewed->copy()->addDays(2), [3, 4, 2, 4, 3, 3], 'shared', 2, null],
            ['special', $today->copy()->subMonths(2)->startOfMonth(), $today->copy()->subMonth()->endOfMonth(), $today->copy()->subDays(6), [4, 5, 4, 4, 4, 5], 'shared', 0, null],
            ['periodic', $today->copy()->subMonths(3)->startOfMonth(), $today->copy()->subMonth()->endOfMonth(), $today->copy(), [4, 4, null, null, 4, null], 'draft', 1, null],
        ];

        $texts = [
            [
                'standards' => 'Accurate job orders and dispensing; every customer greeted and assisted within two minutes; no unexcused absence.',
                'strengths' => 'Consistently accurate in encoding prescriptions and job orders. Customers ask for them by name, and they cover for co-workers without being asked.',
                'improvements' => 'A few late arrivals at the start of the period, since corrected. Product knowledge on progressive lenses can still improve.',
                'goals' => 'Complete the lens supplier’s progressive-lens training and mentor one new sales associate by the next review.',
            ],
            [
                'standards' => 'Complete and timely time records; frames and lenses handled without damage; courteous service at the counter.',
                'strengths' => 'Reliable at the front desk and careful with cash and receipts. Works well with the optometrist during busy clinic days.',
                'improvements' => 'Several late arrivals and two missed check-outs this period. Needs reminding to update the recall list.',
                'goals' => 'No tardiness for the next quarter; recall list updated every Friday.',
            ],
            [
                'standards' => 'Report on time and ready to work; follow the absence notice rule; keep the work area and displays in order.',
                'strengths' => 'Good rapport with walk-in customers and willing to learn the edging machine.',
                'improvements' => 'Attendance is below standard: absences without timely notice and frequent tardiness. Displays were left unarranged on two inspections.',
                'goals' => 'Follow the three-hour absence notice without exception. Review again in three months.',
            ],
        ];

        $rows = [];
        foreach ($plan as $index => [$type, $start, $end, $date, $ratings, $status, $text, $comments]) {
            if ($employee = $staff->get($index)) {
                $rows[] = [$employee, $type, $start, $end, $date, $ratings, $status, $texts[$text], $comments];
            }
        }
        foreach ($staff->filter(fn (Employee $e) => $e->hire_date && $e->hire_date->gt($today->copy()->subMonths(6)) && $e->hire_date->lt($today->copy()->subMonths(3))) as $employee) {
            $rows[] = [$employee, 'probationary', $employee->hire_date->copy(), $employee->hire_date->copy()->addMonths(3)->subDay(), $employee->hire_date->copy()->addMonths(3)->addDays(4), [4, 4, 4, 3, 4, 4], 'shared', [
                'standards' => 'Learn the store’s job order flow, frame and lens lines, and the Company experience for every customer within the first three months.',
                'strengths' => 'Picked up the job order system quickly and is polite and attentive with customers.',
                'improvements' => 'Still relies on co-workers for lens recommendations and pricing of add-ons.',
                'goals' => 'Handle a complete sale, from frame selection to release, without assistance before regularization.',
            ], null];
        }

        $keys = array_keys(PerformanceEvaluation::CRITERIA);
        foreach ($rows as [$employee, $type, $start, $end, $date, $ratings, $status, $text, $comments]) {
            $ratings = array_combine($keys, $ratings);
            $shared = $status === PerformanceEvaluation::STATUS_DRAFT ? null : $date->copy()->setTime(16, 30)->min(Carbon::now());

            (new PerformanceEvaluation)->forceFill([
                'entity_id' => $entity->id,
                'employee_id' => $employee->id,
                'evaluator_id' => $this->owner->id,
                'review_type' => $type,
                'period_start' => $start->toDateString(),
                'period_end' => $end->toDateString(),
                'review_date' => $date->toDateString(),
                'ratings' => $ratings,
                'overall_rating' => PerformanceEvaluation::overall($ratings),
                ...$text,
                'status' => $status,
                'shared_at' => $shared,
                'employee_comments' => $comments,
                'acknowledged_at' => $status === PerformanceEvaluation::STATUS_ACKNOWLEDGED ? $shared->copy()->addDays(2)->setTime(9, 45) : null,
                'created_at' => $date->copy()->setTime(14, 0)->min(Carbon::now()),
            ])->save();
        }

        $this->command?->info("{$entity->name}: ".count($rows).' performance reviews.');
    }

    // ----------------------------------------------------------------------------------------- Compliance

    /**
     * The statutory calendar for this month and the two before it, worked through as it would be: old filings
     * verified, recent ones filed (a few after the due date) or prepared, the rest still pending.
     */
    private function seedCompliance(Entity $entity, Carbon $today): void
    {
        foreach ([2, 1, 0] as $back) {
            $this->compliance->generateForPeriod($entity->id, $today->copy()->startOfMonth()->subMonths($back)->format('F Y'));
        }
        if (ComplianceItem::query()->where('status', '!=', 'pending')->exists()) {
            return;
        }

        $preparer = $this->accountant ?? $this->owner;
        $verifier = $preparer->is($this->owner) ? null : $this->owner; // a second person signs off
        $now = Carbon::now();
        $amounts = [];
        $done = 0;

        foreach (ComplianceItem::query()->orderBy('due_date')->orderBy('id')->get() as $i => $item) {
            $due = $item->due_date->copy();
            $target = match (true) {
                $due->lt($today->copy()->subDays(20)) => $i % 5 === 4 ? 'submitted' : 'verified',
                $due->lt($today) => ['submitted', 'prepared', 'pending'][$i % 3],
                $due->lte($today->copy()->addDays(10)) => $i % 2 === 0 ? 'prepared' : 'pending',
                default => 'pending',
            };
            if ($target === 'verified' && ! $verifier) {
                $target = 'submitted';
            }
            if ($target === 'pending') {
                continue;
            }

            $month = $item->periodStart();
            $amounts[$item->period] ??= $month ? $this->compliance->payrollAmounts($entity->id, $month) : [];
            $amount = (float) ($amounts[$item->period][$item->form_code]['amount'] ?? 0);

            $update = [
                'status' => $target,
                'prepared_by' => $preparer->id,
                'prepared_at' => $due->copy()->subDays(4)->setTime(15, 0)->min($now->copy()->subDay()),
                'amount' => $amount > 0 ? $amount : $item->amount,
            ];
            if ($target !== 'prepared') {
                // Every fourth filing went in three days late.
                $filed = $due->copy()->addDays($i % 4 === 3 ? 3 : -2)->setTime(12, 0)->min($now);
                $update += [
                    'submitted_by' => $preparer->id,
                    'submitted_at' => $filed,
                    'reference_no' => strtoupper($item->agency ?: 'REF').'-'.$due->format('Ym').'-'.str_pad((string) mt_rand(1, 999999), 6, '0', STR_PAD_LEFT),
                ];
                if ($target === 'verified') {
                    $update += ['verified_by' => $verifier->id, 'verified_at' => $filed->copy()->addDay()->setTime(10, 0)->min($now)];
                }
            }

            $item->forceFill($update)->save();
            $done++;
        }

        $this->command?->info("{$entity->name}: {$done} compliance items worked.");
    }
}
