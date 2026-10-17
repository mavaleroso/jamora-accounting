<?php

namespace Database\Seeders;

use App\Models\AttendanceRequest;
use App\Models\BankAccount;
use App\Models\BenefitProgram;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollAdjustment;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\User;
use App\Services\Payroll\PayrollService;
use App\Services\People\AttendanceCalculator;
use App\Support\EntityContext;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Semi-monthly payroll history for the default entity, so every stage of the Payroll flow can be tried:
 *
 *   current cut-off  -> draft     computed, with adjustments (allowance, de minimis, cash advance, loan)
 *   1 cut-off back   -> approved  ready to post
 *   2 cut-offs back  -> posted    ready to release
 *   3–4 cut-offs back-> paid      journal + payment entries booked
 *   next 2 cut-offs  -> open      no run yet
 *
 * Also sets up two company benefits that reach the payslip (rice subsidy, HMO) for the sample staff.
 *
 * Time records for the history cut-offs are generated here (approved, with lates, undertime, approved OT,
 * no-shows, a paid and an unpaid leave). The last two weeks belong to AttendanceDemoSeeder and are left alone.
 *
 * Deterministic (seeded RNG). Re-running only touches periods that have no payroll yet;
 * use `migrate:fresh --seed` for a clean slate.
 */
class PayrollDemoSeeder extends Seeder
{
    private const HISTORY = ['paid', 'paid', 'posted', 'approved', 'draft'];

    public function run(AttendanceCalculator $calculator, PayrollService $payroll): void
    {
        $entity = Entity::query()->where('code', 'A_JAMORA')->first() ?? Entity::query()->first();
        if (! $entity) {
            return;
        }
        app(EntityContext::class)->set($entity);

        // The Accountant prepares; the owner (Admin) approves, posts and releases.
        $user = User::query()->where('username', 'accountant')->first() ?? User::query()->orderBy('id')->first();
        $owner = User::query()->where('username', 'admin')->first() ?? $user;
        $today = Carbon::today();

        // Cut-offs: the four before the current one, the current one, and the next two.
        $current = $this->cutoffStart($today);
        $starts = collect(range(-4, 2))->map(fn (int $i) => $this->shiftCutoff($current, $i));
        $periods = $starts->map(fn (Carbon $start) => $this->period($entity, $start));

        $history = $periods->take(count(self::HISTORY))->values();
        $this->seedBenefits($entity, $starts->first());

        $pending = $history->filter(fn (?PayrollPeriod $p) => $p && ! $p->activeRun()->exists())->values();
        if ($pending->isEmpty()) {
            $this->command?->info('Payroll demo already seeded — nothing to do.');

            return;
        }

        // Time records up to where AttendanceDemoSeeder takes over.
        $attendanceFrom = $today->copy()->subDays(13);
        $dtrTo = $pending->max(fn (PayrollPeriod $p) => $p->end_date)->copy()->min($attendanceFrom->copy()->subDay());
        $this->seedTimeRecords($entity, $calculator, $user, $pending, $dtrTo);

        $bank = BankAccount::query()
            ->whereHas('entities', fn ($q) => $q->where('entities.id', $entity->id))
            ->where('is_active', true)
            ->orderBy('id')
            ->first();

        foreach ($history as $i => $period) {
            if (! $period || ! $pending->contains('id', $period->id)) {
                continue;
            }

            $this->runPayroll($payroll, $period, $user, $owner, self::HISTORY[$i], $bank);
        }
    }

    // -----------------------------------------------------------------------------------------

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
    private function period(Entity $entity, Carbon $start): ?PayrollPeriod
    {
        $first = $start->day === 1;
        $end = $first ? $start->copy()->day(15) : $start->copy()->endOfMonth();
        $code = 'PP-'.$start->format('Y-m').($first ? '-1' : '-2');

        $existing = PayrollPeriod::query()->where('code', $code)->first();
        if ($existing) {
            return $existing;
        }

        $overlaps = PayrollPeriod::query()
            ->whereDate('start_date', '<=', $end->toDateString())
            ->whereDate('end_date', '>=', $start->toDateString())
            ->exists();
        if ($overlaps) {
            $this->command?->warn("Skipped {$code}: overlaps an existing pay period.");

            return null;
        }

        $payDays = config('people.payroll.pay_days');

        return PayrollPeriod::query()->create([
            'entity_id' => $entity->id,
            'code' => $code,
            'frequency' => PayrollPeriod::FREQUENCY_SEMI_MONTHLY,
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
            'pay_date' => PayrollService::payDay($end, (int) ($first ? $payDays['first'] : $payDays['second']))->toDateString(),
            'status' => 'open',
        ]);
    }

    /**
     * Approved time records for every payrolled employee over the given periods (through $to).
     *
     * @param  Collection<int, PayrollPeriod>  $periods
     */
    private function seedTimeRecords(Entity $entity, AttendanceCalculator $calculator, ?User $user, Collection $periods, Carbon $to): void
    {
        $from = $periods->min(fn (PayrollPeriod $p) => $p->start_date)->copy();
        if ($from->gt($to)) {
            return;
        }

        $employees = Employee::query()
            ->where('is_active', true)
            ->whereIn('employment_status', ['active', 'separated'])
            ->orderBy('employee_code')
            ->get();

        $inRange = fn (Carbon $date) => $periods->contains(fn (PayrollPeriod $p) => $date->betweenIncluded($p->start_date, $p->end_date));
        $ids = $employees->pluck('id');

        foreach ($periods as $p) {
            $range = [$p->start_date->toDateString(), min($p->end_date->toDateString(), $to->toDateString())];
            AttendanceRequest::query()->whereIn('employee_id', $ids)->whereBetween('work_date', $range)->delete();
            DtrEntry::query()->whereIn('employee_id', $ids)->whereBetween('work_date', $range)->delete();
        }

        $leaves = $this->seedLeaves($employees, $periods, $user);

        mt_srand(20261015);
        $approver = $user?->id;

        for ($date = $from->copy(); $date->lte($to); $date->addDay()) {
            if (! $inRange($date)) {
                continue;
            }
            $holiday = $calculator->holidayFor($entity->id, $date);

            foreach ($employees as $i => $employee) {
                if (($employee->hire_date && $employee->hire_date->gt($date))
                    || ($employee->separation_date && $employee->separation_date->lt($date))) {
                    continue;
                }

                $schedule = $calculator->scheduleFor($employee, $date);
                if ($schedule->isRestDay || ! $schedule->start) {
                    continue;
                }
                if (isset($leaves[$employee->id][$date->toDateString()])) {
                    continue; // on leave -> daily close links the leave
                }

                $roll = mt_rand(1, 100);
                if ($roll <= 3 || ($holiday && $roll > 25)) {
                    continue; // no-show, or holiday off -> daily close marks absent / holiday
                }

                $start = Carbon::parse($date->toDateString().' '.$schedule->start);
                $end = Carbon::parse($date->toDateString().' '.$schedule->end);
                if ($end->lte($start)) {
                    $end->addDay();
                }

                $in = $start->copy()->addMinutes($roll <= 15 ? mt_rand(6, 40) : -mt_rand(0, 15));
                $breakOut = $start->copy()->addHours(4)->addMinutes(mt_rand(-10, 15));
                $breakIn = $breakOut->copy()->addMinutes(mt_rand(55, 62));
                $out = $end->copy()->addMinutes(match (true) {
                    $roll > 90 => mt_rand(60, 180), // overtime
                    $roll > 85 => -mt_rand(20, 60), // undertime
                    default => mt_rand(0, 10),
                });

                $dtr = new DtrEntry([
                    'entity_id' => $entity->id,
                    'employee_id' => $employee->id,
                    'work_date' => $date->toDateString(),
                    'time_in' => $in->format('H:i:s'),
                    'break_out' => $breakOut->format('H:i:s'),
                    'break_in' => $breakIn->format('H:i:s'),
                    'time_out' => $out->format('H:i:s'),
                    'source' => $i % 3 === 0 ? 'biometric' : 'web_geofence',
                    'location_status' => 'verified',
                    'distance_meters' => mt_rand(5, 120),
                    'status' => DtrEntry::STATUS_OPEN,
                ]);
                $calculator->compute($dtr, $employee);

                // OT is payable only through an approved OT request.
                if ((float) $dtr->ot_hours > 0) {
                    (new AttendanceRequest)->forceFill([
                        'entity_id' => $entity->id,
                        'employee_id' => $employee->id,
                        'request_type' => AttendanceRequest::TYPE_OVERTIME,
                        'work_date' => $date->toDateString(),
                        'requested_ot_hours' => $dtr->ot_hours,
                        'reason' => $holiday ? 'Holiday sale — extended store hours.' : 'Extended clinic hours for scheduled patients.',
                        'status' => 'approved',
                        'reviewed_by' => $approver,
                        'reviewed_at' => $date->copy()->addDay()->setTime(9, 30),
                        'created_at' => $date->copy()->setTime(19, 0),
                    ])->save();
                    $calculator->syncApprovedOt($dtr);
                }

                $dtr->save();
            }

            $calculator->closeDay($entity->id, $date);

            // HR reviewed the whole day.
            DtrEntry::query()
                ->whereIn('employee_id', $ids)
                ->whereDate('work_date', $date->toDateString())
                ->where('status', DtrEntry::STATUS_OPEN)
                ->update(['status' => DtrEntry::STATUS_APPROVED, 'approved_by' => $approver, 'approved_at' => $date->copy()->addDays(2)->setTime(10, 0)]);
        }

        $this->command?->info("Seeded payroll time records {$from->toDateString()} – {$to->toDateString()} for {$employees->count()} employees.");
    }

    /**
     * One paid (bereavement) and one unpaid (LWOP) leave in the oldest cut-off.
     *
     * @param  Collection<int, Employee>  $employees
     * @param  Collection<int, PayrollPeriod>  $periods
     * @return array<int, array<string, true>> employee id => dates on leave
     */
    private function seedLeaves(Collection $employees, Collection $periods, ?User $user): array
    {
        $oldest = $periods->sortBy('start_date')->first();
        $plan = [
            ['EMP-1004', 'BL', 2, 'Death of grandmother — wake and burial in Batangas.'],
            ['EMP-1007', 'LWOP', 1, 'Personal errand, no leave credits left.'],
        ];
        $onLeave = [];

        foreach ($plan as [$code, $typeCode, $days, $reason]) {
            $employee = $employees->firstWhere('employee_code', $code);
            $type = LeaveType::query()->where('code', $typeCode)->first();
            if (! $employee || ! $type) {
                continue;
            }

            // The first $days consecutive work days from the cut-off's 3rd day (no rest day inside the leave).
            $dates = [];
            for ($d = $oldest->start_date->copy()->addDays(2); count($dates) < $days && $d->lte($oldest->end_date); $d->addDay()) {
                $dates = in_array($d->dayOfWeek, $employee->restDayNumbers(), true) ? [] : [...$dates, $d->toDateString()];
            }
            if (count($dates) < $days) {
                continue;
            }

            LeaveRequest::query()
                ->where('employee_id', $employee->id)
                ->where('leave_type_id', $type->id)
                ->whereBetween('start_date', [$oldest->start_date->toDateString(), $oldest->end_date->toDateString()])
                ->delete();
            LeaveRequest::query()->create([
                'entity_id' => $employee->entity_id,
                'employee_id' => $employee->id,
                'leave_type_id' => $type->id,
                'leave_type' => $type->code,
                'start_date' => $dates[0],
                'end_date' => end($dates),
                'days_count' => $days,
                'reason' => $reason,
                'status' => LeaveRequest::STATUS_APPROVED,
                'filed_by' => $user?->id,
                'approved_by' => $user?->id,
                'approved_at' => Carbon::parse($dates[0])->subDays(3)->setTime(11, 0),
            ]);
            $onLeave[$employee->id] = array_fill_keys($dates, true);
        }

        return $onLeave;
    }

    /**
     * Company programs that reach the payslip (Benefits Administration): a rice subsidy for everyone and
     * an HMO for regular staff, in force from the oldest demo cut-off.
     */
    private function seedBenefits(Entity $entity, Carbon $from): void
    {
        $rice = BenefitProgram::query()->updateOrCreate(['code' => 'RICE_SUBSIDY'], [
            'entity_id' => $entity->id,
            'name' => 'Rice Subsidy',
            'category' => 'allowance',
            'contribution_basis' => 'fixed',
            'payroll_mode' => BenefitProgram::MODE_EARNING,
            'description' => 'De minimis rice allowance (BIR limit ₱2,000 / month).',
            'default_employee_share' => 0,
            'default_employer_share' => 2000,
            'is_taxable' => false,
            'is_active' => true,
        ]);
        $hmo = BenefitProgram::query()->updateOrCreate(['code' => 'HMO_GOLD'], [
            'entity_id' => $entity->id,
            'name' => 'HMO — Gold Plan',
            'category' => 'insurance',
            'contribution_basis' => 'fixed',
            'payroll_mode' => BenefitProgram::MODE_CONTRIBUTION,
            'description' => 'In- and out-patient cover for regular employees; employee pays for one dependent.',
            'default_employee_share' => 350,
            'default_employer_share' => 1150,
            'is_active' => true,
        ]);

        $employees = Employee::query()->where('is_active', true)->where('employee_code', 'like', 'EMP-10%')->get();
        foreach ($employees as $employee) {
            $enroll = fn (BenefitProgram $p, array $attrs = []) => EmployeeBenefit::query()->updateOrCreate(
                ['employee_id' => $employee->id, 'benefit_program_id' => $p->id],
                [
                    'employee_share' => $p->default_employee_share,
                    'employer_share' => $p->default_employer_share,
                    'payroll_treatment' => $p->payroll_mode,
                    'participation_status' => 'active',
                    'effective_date' => $from->toDateString(),
                    ...$attrs,
                ]
            );

            $enroll($rice);
            if ($employee->employment_type === 'regular') {
                // One regular employee waived the HMO (covered by a spouse's plan).
                $enroll($hmo, $employee->employee_code === 'EMP-1010' ? ['participation_status' => 'waived', 'notes' => 'Covered under spouse’s HMO.'] : []);
            }
        }
    }

    private function runPayroll(PayrollService $payroll, PayrollPeriod $period, User $user, User $owner, string $target, ?BankAccount $bank): void
    {
        $run = null;
        try {
            $run = $payroll->compute($period, $user);
            $this->addAdjustments($run, $user, $target === 'draft');
            $run = $payroll->compute($period->fresh(), $user);

            if ($target !== 'draft') {
                $run = $payroll->approve($run, $owner);
            }
            if (in_array($target, ['posted', 'paid'], true)) {
                $run = $payroll->post($run->fresh(), $owner);
            }
            if ($target === 'paid') {
                $run = $payroll->pay($run->fresh(), $owner, $period->pay_date->toDateString(), $bank);
            }

            $this->command?->info(sprintf('%s: %s — %d payslips, net ₱%s', $period->code, $run->status, $run->headcount, number_format((float) $run->net_total, 2)));
        } catch (ValidationException $e) {
            $this->command?->warn("{$period->code}: stopped at ".($run?->status ?? 'compute').' — '.collect($e->errors())->flatten()->first());
        }
    }

    /**
     * Typical one-off earnings and deductions. The current draft gets a few more to play with.
     */
    private function addAdjustments(PayrollRun $run, User $user, bool $isDraft): void
    {
        $byCode = Employee::query()->whereIn('id', $run->payslips()->pluck('employee_id'))->get()->keyBy('employee_code');

        $lines = [
            ['EMP-1001', 'allowance', 'Representation allowance', 2000],
            ['EMP-1002', 'de_minimis', 'Rice subsidy', 1000],
            ['EMP-1005', 'sss_loan', 'SSS salary loan amortization', 1150.50],
            ['EMP-1011', 'pagibig_loan', 'Pag-IBIG multi-purpose loan', 980],
        ];
        if ($isDraft) {
            $lines = [
                ...$lines,
                ['EMP-1004', 'bonus', 'Sales incentive — top stylist', 3500],
                ['EMP-1007', 'cash_advance', 'Cash advance', 1500],
                ['EMP-1010', 'salary_adjustment', 'Underpayment from previous cut-off', 650],
                ['EMP-1003', 'reimbursement', 'Transportation for home-service eye exam', 420],
            ];
        }

        foreach ($lines as [$code, $category, $description, $amount]) {
            $employee = $byCode->get($code);
            if (! $employee) {
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
}
