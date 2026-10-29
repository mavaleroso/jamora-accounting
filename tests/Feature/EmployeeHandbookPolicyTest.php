<?php

use App\Enums\RoleEnum;
use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\Holiday;
use App\Models\LeaveType;
use App\Models\PayrollPeriod;
use App\Models\User;
use App\Services\Payroll\PayrollService;
use App\Services\People\AttendanceCalculator;
use App\Services\People\PeopleAnalytics;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

/*
 * Timekeeping, leave and pay-day rules from the Employee Handbook (Code of Conduct effective 1 June 2025), as the owner
 * decided them: tardy one minute late, over-breaks counted, absences reported 3 hours ahead (otherwise unauthorized;
 * two days in a row is AWOL), SIL in whole days, Medical Leave of Absence, and pay on the 20th and the 5th.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00'); // a Wednesday

    $this->entity = Entity::create(['code' => 'HB-BRANCH', 'name' => 'Handbook Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP', 'geofence_enforced' => false]);
    $makeUser = function (RoleEnum $role) {
        $user = User::factory()->create();
        $user->assignRole($role->value);
        $user->entities()->attach($this->entity->id, ['is_default' => true]);

        return $user;
    };
    $this->owner = $makeUser(RoleEnum::Admin);
    $this->staffUser = $makeUser(RoleEnum::Employee);
    $this->staff = Employee::create([
        'entity_id' => $this->entity->id, 'user_id' => $this->staffUser->id, 'employee_code' => 'STF-1', 'firstname' => 'Sam', 'lastname' => 'Test',
        'position' => 'Staff', 'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 30000, 'rest_days' => ['sun'],
        'hire_date' => '2024-01-08',
    ]);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
    $this->day = function (string $date, array $punches): DtrEntry {
        $dtr = new DtrEntry(['entity_id' => $this->entity->id, 'employee_id' => $this->staff->id, 'work_date' => $date, ...$punches]);

        return tap(app(AttendanceCalculator::class)->compute($dtr, $this->staff))->save();
    };
    $this->analytics = fn () => (new PeopleAnalytics($this->entity->id, Carbon::parse('2026-10-01'), Carbon::parse('2026-10-31')))->attendance();
});

afterEach(fn () => Carbon::setTestNow());

test('an employee is late one minute after the shift starts — there is no grace period', function () {
    expect((int) ($this->day)('2026-10-12', ['time_in' => '09:00:00', 'time_out' => '18:00:00'])->tardiness_minutes)->toBe(0);

    $late = ($this->day)('2026-10-13', ['time_in' => '09:01:00', 'time_out' => '18:00:00']);
    expect((int) $late->tardiness_minutes)->toBe(1)
        ->and($late->attendance_status)->toBe('late');
});

test('a break longer than the allotted hour is an over-break, flagged once a month has three of them', function () {
    $lunch = fn (string $date, string $back) => ($this->day)($date, ['time_in' => '09:00:00', 'break_out' => '12:00:00', 'break_in' => $back, 'time_out' => '18:00:00']);

    expect($lunch('2026-10-05', '13:00:00')->over_break_minutes)->toBe(0)
        ->and($lunch('2026-10-06', '13:10:00')->over_break_minutes)->toBe(10);
    $lunch('2026-10-07', '13:05:00');

    $row = ($this->analytics)()['byEmployee'][0];
    expect($row['overBreaks'])->toBe(2)
        ->and($row['overBreakMinutes'])->toBe(15)
        ->and($row['overBreakFlag'])->toBeFalse();

    $lunch('2026-10-08', '13:02:00');
    $attendance = ($this->analytics)();
    expect($attendance['byEmployee'][0]['overBreakFlag'])->toBeTrue()
        ->and($attendance['overBreakEmployees'])->toBe(1);
});

test('an absence reported 3 hours ahead is authorized; a late notice or none is not, and two such days in a row is AWOL', function () {
    $report = fn (string $date) => ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => AttendanceRequest::TYPE_ABSENCE_NOTICE, 'work_date' => $date, 'reason' => 'Fever since last night',
    ]);

    // 5:00 AM for a 9:00 AM shift: in time. It is noted at once, with nothing for the owner to decide.
    Carbon::setTestNow('2026-10-14 05:00:00');
    $report('2026-10-14')->assertSessionHasNoErrors()
        ->assertSessionHas('status', 'Absence reported. It is unpaid unless leave is filed and approved for the day.');
    $notice = AttendanceRequest::sole();
    expect($notice->status)->toBe(AttendanceRequest::STATUS_NOTED)
        ->and($notice->notice_status)->toBe(AttendanceRequest::NOTICE_ON_TIME);
    $report('2026-10-14')->assertSessionHasErrors(['work_date' => 'You have already reported an absence for this day.']);
    $report('2026-10-18')->assertSessionHasErrors('work_date'); // Sunday, a rest day

    ($this->as)($this->owner)->get('/employee-management/requests')
        ->assertInertia(fn (Assert $page) => $page->where('badges.inbox', 0));

    // 7:30 AM on the day itself: a late notice.
    Carbon::setTestNow('2026-10-16 07:30:00');
    $report('2026-10-16')->assertSessionHasNoErrors();
    expect(AttendanceRequest::whereDate('work_date', '2026-10-16')->value('notice_status'))->toBe(AttendanceRequest::NOTICE_LATE);

    // Absent Wed–Fri: notified on the 14th, none on the 15th, late on the 16th; worked on Saturday.
    $calculator = app(AttendanceCalculator::class);
    foreach (['2026-10-14', '2026-10-15', '2026-10-16'] as $date) {
        $calculator->closeDay($this->entity->id, $date);
    }
    ($this->day)('2026-10-17', ['time_in' => '09:00:00', 'time_out' => '18:00:00']);

    Carbon::setTestNow('2026-10-19 09:00:00');
    $attendance = ($this->analytics)();
    $row = $attendance['byEmployee'][0];
    expect($row['absences'])->toBe(3)
        ->and($row['unauthorizedAbsences'])->toBe(2)
        ->and($row['awolStreak'])->toBe(2)
        ->and($row['awol'])->toBeTrue()
        ->and($attendance['awolEmployees'])->toBe(1);
});

test('an absence notice can be withdrawn until the day is over', function () {
    Carbon::setTestNow('2026-10-14 05:00:00');
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => AttendanceRequest::TYPE_ABSENCE_NOTICE, 'work_date' => '2026-10-15', 'reason' => 'Family emergency in Surigao',
    ])->assertSessionHasNoErrors();
    $notice = AttendanceRequest::sole();

    Carbon::setTestNow('2026-10-16 09:00:00');
    ($this->as)($this->staffUser)->post("/employee-management/requests/attendance/{$notice->id}/cancel")->assertSessionHasErrors('status');

    Carbon::setTestNow('2026-10-15 08:00:00');
    ($this->as)($this->staffUser)->post("/employee-management/requests/attendance/{$notice->id}/cancel")
        ->assertSessionHas('status', 'Absence notice withdrawn.');
    expect($notice->fresh()->status)->toBe('cancelled');
});

test('the approver of overtime is warned when the employee was more than 30 minutes late that day', function () {
    AttendanceRequest::create([
        'entity_id' => $this->entity->id, 'employee_id' => $this->staff->id, 'request_type' => AttendanceRequest::TYPE_OVERTIME,
        'work_date' => '2026-10-14', 'reason' => 'Month-end inventory', 'status' => 'pending',
    ]);
    ($this->day)('2026-10-14', ['time_in' => '09:45:00']);

    ($this->as)($this->owner)->get('/employee-management/requests?view=inbox')
        ->assertInertia(fn (Assert $page) => $page
            ->where('feed.data.0.kind', 'overtime')
            ->where('feed.data.0.details.dtr.tardiness_minutes', '45.00')
            ->where('feed.data.0.details.late_no_ot_minutes', 30));
});

test('pay days: the 1st–15th on the 20th, the 16th–end on the 5th of the next month, moved off holidays and Sundays', function () {
    $none = fn (Carbon $d) => false;
    expect(PayrollService::payDay(Carbon::parse('2026-11-15'), 20, $none)->toDateString())->toBe('2026-11-20')
        ->and(PayrollService::payDay(Carbon::parse('2026-11-30'), 5, $none)->toDateString())->toBe('2026-12-05')
        // Dec 20, 2026 is a Sunday: the next working day.
        ->and(PayrollService::payDay(Carbon::parse('2026-12-15'), 20, $none)->toDateString())->toBe('2026-12-21')
        // A holiday: the working day before.
        ->and(PayrollService::payDay(Carbon::parse('2026-12-31'), 5, fn (Carbon $d) => $d->toDateString() === '2027-01-05')->toDateString())->toBe('2027-01-04')
        // Sunday Jul 5 with a holiday on Monday: Tuesday.
        ->and(PayrollService::payDay(Carbon::parse('2026-06-30'), 5, fn (Carbon $d) => $d->toDateString() === '2026-07-06')->toDateString())->toBe('2026-07-07')
        ->and(PayrollService::payDay(Carbon::parse('2026-11-30'), 0)->toDateString())->toBe('2026-11-30');

    Holiday::create(['entity_id' => null, 'holiday_date' => '2027-01-05', 'name' => 'Company foundation day', 'type' => 'special']);
    ($this->as)($this->owner)->post('/payroll/periods/generate', ['month' => '2026-12', 'frequency' => 'semi_monthly'])->assertSessionHasNoErrors();

    expect(PayrollPeriod::where('code', 'PP-2026-12-1')->value('pay_date')->toDateString())->toBe('2026-12-21')
        ->and(PayrollPeriod::where('code', 'PP-2026-12-2')->value('pay_date')->toDateString())->toBe('2027-01-04');
});

test('SIL is taken in whole days, and Medical Leave of Absence is unpaid, up to 60 days, with a supporting document', function () {
    $types = collect(config('people.leave_types'))->keyBy('code');
    $sil = LeaveType::create($types['SIL']);
    $mloa = LeaveType::create($types['MLOA']);
    config(['people.leave.min_notice_days' => 0, 'people.leave.long_leave_notice_days' => 0]);

    $file = fn (LeaveType $type, array $data) => ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'leave', 'leave_type_id' => $type->id, 'reason' => 'As discussed with HR', ...$data,
    ]);

    $file($sil, ['start_date' => '2026-10-20', 'end_date' => '2026-10-20', 'half_day' => 'am'])
        ->assertSessionHasErrors(['half_day' => 'Service Incentive Leave does not allow half-day filings.']);
    $file($sil, ['start_date' => '2026-10-20', 'end_date' => '2026-10-20'])->assertSessionHasNoErrors();
    expect($sil->is_convertible)->toBeFalse();

    expect($mloa->is_paid)->toBeFalse();
    $file($mloa, ['start_date' => '2026-11-02', 'end_date' => '2026-11-10'])->assertSessionHasErrors('attachment');
    $file($mloa, ['start_date' => '2026-11-02', 'end_date' => '2027-01-05'])->assertSessionHasErrors('days_count');
});
