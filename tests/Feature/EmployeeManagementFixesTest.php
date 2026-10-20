<?php

use App\Models\AttendanceRequest;
use App\Models\BenefitProgram;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\Entity;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\ShiftRoster;
use App\Models\User;
use App\Services\Payroll\PayrollService;
use App\Services\People\AttendanceCalculator;
use App\Services\People\LeaveService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    // Leave may be filed any day ahead here; the filing notice is tested in LeaveNoticeTest.
    config(['people.leave.min_notice_days' => 0]);
    // Wednesday. Default shift 09:00–18:00 with a 60-minute break; Sunday rest.
    Carbon::setTestNow('2026-10-14 09:00:00');

    foreach (['attendance.view', 'attendance.punch', 'attendance.manage', 'leave.view', 'leave.file', 'requests.approve', 'requests.manage', 'roster.view', 'roster.manage', 'payroll.view', 'payroll.manage', 'compliance.view'] as $p) {
        Permission::findOrCreate($p, 'web');
    }

    $this->entity = Entity::create(['code' => 'FIX-BRANCH', 'name' => 'Fixes Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP', 'geofence_enforced' => false]);

    $makeUser = function (string $email, string $role, array $perms) {
        $user = User::factory()->create(['email' => $email]);
        $user->assignRole(Role::findOrCreate($role, 'web')->syncPermissions($perms));
        $user->entities()->attach($this->entity->id, ['is_default' => true]);

        return $user;
    };
    $makeEmployee = fn (?User $user, string $code, string $first) => Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $user?->id,
        'employee_code' => $code,
        'firstname' => $first,
        'lastname' => 'Test',
        'position' => 'Staff',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 30000,
        'rest_days' => ['sun'],
    ]);

    $this->hrUser = $makeUser('hr@fix.test', 'HR Manager', ['attendance.view', 'attendance.manage', 'leave.view', 'leave.file', 'requests.approve', 'requests.manage', 'roster.view', 'roster.manage', 'payroll.view', 'payroll.manage']);
    $this->hrEmployee = $makeEmployee($this->hrUser, 'HR-1', 'Helen');

    $this->staffUser = $makeUser('staff@fix.test', 'Employee', ['attendance.view', 'attendance.punch', 'leave.view', 'leave.file']);
    $this->staffEmployee = $makeEmployee($this->staffUser, 'STF-1', 'Sam');

    $this->auditor = $makeUser('audit@fix.test', 'Auditor', ['attendance.view', 'leave.view', 'payroll.view']);

    $this->vl = LeaveType::create(['code' => 'VL', 'name' => 'Vacation Leave', 'is_paid' => true, 'balance_tracked' => true, 'annual_entitlement' => 10, 'max_carry_over' => 5, 'allow_half_day' => true, 'is_active' => true, 'sort_order' => 1]);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
});

afterEach(fn () => Carbon::setTestNow());

test('copying the previous week puts each shift on the same weekday of the target week', function () {
    // Source week Mon Oct 5 – Sun Oct 11; a Wednesday shift.
    ShiftRoster::create([
        'entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'roster_date' => '2026-10-07',
        'shift_name' => 'Early', 'shift_start' => '07:00:00', 'shift_end' => '16:00:00', 'break_minutes' => 60, 'grace_minutes' => 5,
        'is_rest_day' => false, 'status' => ShiftRoster::STATUS_PUBLISHED,
    ]);

    ($this->as)($this->hrUser)->post('/employee-management/roster/copy-previous-week', ['week_start' => '2026-10-12'])
        ->assertSessionHasNoErrors();

    $copied = ShiftRoster::where('employee_id', $this->staffEmployee->id)->whereDate('roster_date', '2026-10-14')->first();
    expect($copied)->not->toBeNull()
        ->and($copied->status)->toBe(ShiftRoster::STATUS_DRAFT);
    // The source week is left alone.
    expect(ShiftRoster::where('employee_id', $this->staffEmployee->id)->whereDate('roster_date', '2026-10-07')->value('status'))
        ->toBe(ShiftRoster::STATUS_PUBLISHED);
    expect(ShiftRoster::count())->toBe(2);
});

test('the old leave endpoints are gone, so leave can only be cancelled by its owner or an approver', function () {
    $leave = app(LeaveService::class)->file($this->hrEmployee, $this->vl, ['start_date' => '2026-10-20', 'end_date' => '2026-10-20', 'reason' => 'Errand'], $this->hrUser);

    ($this->as)($this->staffUser)->post("/employee-management/leave/{$leave->id}/cancel")->assertNotFound();
    ($this->as)($this->staffUser)->post("/employee-management/requests/leave/{$leave->id}/cancel")->assertForbidden();

    expect($leave->fresh()->status)->toBe(LeaveRequest::STATUS_PENDING);
});

test('an employee cannot cancel approved leave once it has started, but HR can', function () {
    $leave = app(LeaveService::class)->file($this->staffEmployee, $this->vl, ['start_date' => '2026-10-14', 'end_date' => '2026-10-15', 'reason' => 'Trip'], $this->staffUser);
    app(LeaveService::class)->approve($leave, $this->hrUser);

    ($this->as)($this->staffUser)->post("/employee-management/requests/leave/{$leave->id}/cancel")->assertSessionHasErrors('status');
    expect($leave->fresh()->status)->toBe(LeaveRequest::STATUS_APPROVED);

    ($this->as)($this->hrUser)->post("/employee-management/requests/leave/{$leave->id}/cancel", ['reason' => 'Recalled to work'])->assertSessionHasNoErrors();
    expect($leave->fresh()->status)->toBe(LeaveRequest::STATUS_CANCELLED);
});

test('leave on days already paid by payroll cannot be cancelled', function () {
    $leave = app(LeaveService::class)->file($this->staffEmployee, $this->vl, ['start_date' => '2026-10-20', 'end_date' => '2026-10-20', 'reason' => 'Trip'], $this->staffUser);
    app(LeaveService::class)->approve($leave, $this->hrUser);
    DtrEntry::where('leave_request_id', $leave->id)->update(['status' => DtrEntry::STATUS_LOCKED]);

    ($this->as)($this->hrUser)->post("/employee-management/requests/leave/{$leave->id}/cancel", ['reason' => 'Late change'])->assertSessionHasErrors('status');
    expect($leave->fresh()->status)->toBe(LeaveRequest::STATUS_APPROVED);
});

test('a night shift checks out after midnight on the record it started', function () {
    Carbon::setTestNow('2026-10-14 22:00:00');
    ($this->as)($this->staffUser)->post('/employee-management/attendance/punch', [
        'employee_id' => $this->staffEmployee->id, 'punch_type' => 'check_in',
    ])->assertSessionHasNoErrors();

    Carbon::setTestNow('2026-10-15 06:00:00');
    ($this->as)($this->staffUser)->post('/employee-management/attendance/punch', [
        'employee_id' => $this->staffEmployee->id, 'punch_type' => 'check_out',
        'accomplishment' => '<p>Night inventory count</p>', 'notes' => 'No break taken',
    ])->assertSessionHasNoErrors();

    $night = DtrEntry::where('employee_id', $this->staffEmployee->id)->whereDate('work_date', '2026-10-14')->first();
    expect($night->time_in)->toBe('22:00:00')
        ->and($night->time_out)->toBe('06:00:00')
        ->and($night->attendance_status)->not->toBe('incomplete');
    expect(DtrEntry::where('employee_id', $this->staffEmployee->id)->whereDate('work_date', '2026-10-15')->exists())->toBeFalse();
});

test('half-day leave with the other half worked is not late, and payroll credits half a day of each', function () {
    $leave = app(LeaveService::class)->file($this->staffEmployee, $this->vl, ['start_date' => '2026-10-14', 'end_date' => '2026-10-14', 'half_day' => 'am', 'reason' => 'Clinic visit'], $this->staffUser);
    app(LeaveService::class)->approve($leave, $this->hrUser);

    // Works the afternoon half: 09:00–18:00 less a 60-minute break is 8 h, so the PM half is 14:00–18:00.
    $dtr = DtrEntry::where('employee_id', $this->staffEmployee->id)->whereDate('work_date', '2026-10-14')->first();
    $dtr->fill(['time_in' => '14:00:00', 'time_out' => '18:00:00']);
    app(AttendanceCalculator::class)->compute($dtr, $this->staffEmployee)->save();

    expect((float) $dtr->tardiness_minutes)->toBe(0.0)
        ->and((float) $dtr->undertime_minutes)->toBe(0.0)
        ->and((float) $dtr->regular_hours)->toBe(4.0)
        ->and($dtr->attendance_status)->toBe('present');

    $period = PayrollPeriod::create(['entity_id' => $this->entity->id, 'code' => 'PP-FIX', 'start_date' => '2026-10-01', 'end_date' => '2026-10-15', 'pay_date' => '2026-10-20', 'status' => 'draft']);
    $run = app(PayrollService::class)->compute($period, $this->hrUser->id);
    $days = Payslip::where('payroll_run_id', $run->id)->where('employee_id', $this->staffEmployee->id)->first()->meta['days'];

    expect((float) $days['paid_leave'])->toBe(0.5)
        ->and((float) $days['worked'])->toBe(0.5);
});

test('a new year opens with the full entitlement plus carried-over credits', function () {
    // Go-live credits on the employee record were 10; 7 used during 2026, so the column now reads 3.
    $this->staffEmployee->update(['vacation_leave_credits' => 3]);
    LeaveBalance::create(['entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'leave_type_id' => $this->vl->id, 'year' => 2026, 'entitled' => 10, 'carried_over' => 0, 'adjusted' => 0, 'used' => 7, 'reserved' => 0]);

    Carbon::setTestNow('2027-01-05 09:00:00');
    $balance = app(LeaveService::class)->getOrCreateBalance($this->staffEmployee->fresh(), $this->vl, 2027);

    expect((float) $balance->entitled)->toBe(10.0)
        ->and((float) $balance->carried_over)->toBe(3.0)
        ->and((float) $balance->available)->toBe(13.0);
});

test('carry-over is capped at the leave type maximum', function () {
    LeaveBalance::create(['entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'leave_type_id' => $this->vl->id, 'year' => 2026, 'entitled' => 10, 'carried_over' => 0, 'adjusted' => 0, 'used' => 1, 'reserved' => 0]);

    expect(app(LeaveService::class)->carryOver($this->staffEmployee, $this->vl, 2027))->toBe(5.0);
});

test('changing a shift recalculates time already recorded that day, but not on a payroll-locked day', function () {
    $dtr = new DtrEntry(['entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'work_date' => '2026-10-13', 'time_in' => '09:00:00', 'time_out' => '18:00:00']);
    app(AttendanceCalculator::class)->compute($dtr, $this->staffEmployee)->save();
    expect((float) $dtr->tardiness_minutes)->toBe(0.0);

    $shift = ['employee_id' => $this->staffEmployee->id, 'roster_date' => '2026-10-13', 'shift_name' => 'Early', 'shift_start' => '08:00', 'shift_end' => '17:00', 'status' => 'published'];
    ($this->as)($this->hrUser)->post('/employee-management/roster', $shift)->assertSessionHasNoErrors();
    expect((float) $dtr->fresh()->tardiness_minutes)->toBe(60.0);

    $dtr->update(['status' => DtrEntry::STATUS_LOCKED]);
    ($this->as)($this->hrUser)->post('/employee-management/roster', [...$shift, 'shift_start' => '10:00', 'shift_end' => '19:00'])
        ->assertSessionHasErrors('roster_date');
});

test('a shift can only be assigned to an employee of the branch, with valid times', function () {
    $other = Entity::create(['code' => 'OTHER', 'name' => 'Other Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP']);
    $outsider = Employee::create(['entity_id' => $other->id, 'employee_code' => 'OUT-1', 'firstname' => 'Otto', 'lastname' => 'Side', 'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 20000]);

    ($this->as)($this->hrUser)->post('/employee-management/roster', ['employee_id' => $outsider->id, 'roster_date' => '2026-10-20', 'shift_name' => 'Day'])
        ->assertSessionHasErrors('employee_id');
    ($this->as)($this->hrUser)->post('/employee-management/roster', ['employee_id' => $this->staffEmployee->id, 'roster_date' => '2026-10-20', 'shift_name' => 'Day', 'shift_start' => 'noonish'])
        ->assertSessionHasErrors('shift_start');
});

test('leave attachments are private and only reach the filer and approvers', function () {
    Storage::fake('local');
    Storage::fake('public');

    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'leave', 'leave_type_id' => $this->vl->id, 'start_date' => '2026-10-20', 'end_date' => '2026-10-20',
        'reason' => 'Medical check-up', 'attachment' => UploadedFile::fake()->create('certificate.pdf', 100, 'application/pdf'),
    ])->assertSessionHasNoErrors();

    $leave = LeaveRequest::firstOrFail();
    Storage::disk('local')->assertExists($leave->attachment_path);
    expect(Storage::disk('public')->allFiles())->toBeEmpty();

    $url = "/employee-management/requests/leave/{$leave->id}/attachment";
    ($this->as)($this->staffUser)->get($url)->assertOk();
    ($this->as)($this->hrUser)->get($url)->assertOk();
    ($this->as)($this->auditor)->get($url)->assertForbidden();
});

test('an approved correction sends an approved day back for review', function () {
    $dtr = new DtrEntry(['entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'work_date' => '2026-10-13', 'time_in' => '09:30:00', 'time_out' => '18:00:00']);
    app(AttendanceCalculator::class)->compute($dtr, $this->staffEmployee);
    $dtr->fill(['status' => DtrEntry::STATUS_APPROVED, 'approved_by' => $this->hrUser->id, 'approved_at' => now()])->save();

    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => AttendanceRequest::TYPE_CORRECTION, 'work_date' => '2026-10-13', 'requested_time_in' => '09:00', 'reason' => 'Forgot to clock in at the door',
    ])->assertSessionHasNoErrors();
    $correction = AttendanceRequest::firstOrFail();

    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$correction->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();

    $dtr->refresh();
    expect($dtr->time_in)->toBe('09:00:00')
        ->and($dtr->status)->toBe(DtrEntry::STATUS_OPEN);
});

test('the nightly close records absences for every active branch', function () {
    $this->artisan('attendance:close-day', ['date' => '2026-10-13'])->assertSuccessful();

    expect(DtrEntry::whereDate('work_date', '2026-10-13')->where('attendance_status', 'absent')->count())->toBe(2);
    $this->artisan('attendance:close-day', ['date' => '2026-10-14'])->assertFailed();
});

test('approved overtime pays what the clock records, and a timekeeper trims it by editing the clock-out', function () {
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => AttendanceRequest::TYPE_OVERTIME, 'work_date' => '2026-10-14', 'reason' => 'Month-end inventory',
    ])->assertSessionHasNoErrors();
    ($this->as)($this->hrUser)->post('/employee-management/requests/attendance/'.AttendanceRequest::firstOrFail()->id.'/review', ['decision' => 'approved'])
        ->assertSessionHasNoErrors();

    // Shift ends 18:00; clocked out at midnight = 6 hours of overtime, all of it payable once approved.
    $entry = ['employee_id' => $this->staffEmployee->id, 'work_date' => '2026-10-14', 'time_in' => '09:00', 'break_out' => '12:00', 'break_in' => '13:00'];
    ($this->as)($this->hrUser)->post('/employee-management/attendance/punch', [...$entry, 'time_out' => '00:00', 'notes' => 'Imported punch'])->assertSessionHasNoErrors();
    $dtr = DtrEntry::where('employee_id', $this->staffEmployee->id)->firstOrFail();
    expect((float) $dtr->ot_hours_approved)->toBe(6.0);

    // Only 4 hours were allowed: the timekeeper moves the clock-out to 22:00.
    ($this->as)($this->hrUser)->post('/employee-management/attendance/punch', [...$entry, 'time_out' => '22:00', 'notes' => 'OT capped at 4 hours'])->assertSessionHasNoErrors();
    $dtr->refresh();
    expect((float) $dtr->ot_hours)->toBe(4.0)
        ->and((float) $dtr->ot_hours_approved)->toBe(4.0);
});

test('shared benefit programs can only be changed by roles allowed to manage them', function () {
    Permission::findOrCreate('payroll.shared-programs.manage', 'web');
    $shared = BenefitProgram::create(['code' => 'HMO-ALL', 'name' => 'Group HMO', 'category' => 'insurance', 'contribution_basis' => 'fixed', 'payroll_mode' => 'contribution', 'is_active' => true]);

    ($this->as)($this->hrUser)->post("/employee-management/benefits/programs/{$shared->id}/toggle")->assertSessionHasErrors('benefit_program_id');
    expect($shared->fresh()->is_active)->toBeTrue();

    $this->hrUser->givePermissionTo('payroll.shared-programs.manage');
    ($this->as)($this->hrUser)->post("/employee-management/benefits/programs/{$shared->id}/toggle")->assertSessionHasNoErrors();
    expect($shared->fresh()->is_active)->toBeFalse();
});

test('a new hire\'s first-year leave is pro-rated, but a leave type set not to pro-rate is given in full', function () {
    $this->vl->update(['prorate_first_year' => true]);
    $birthday = LeaveType::create(['code' => 'BDAY', 'name' => 'Birthday Leave', 'is_paid' => true, 'balance_tracked' => true, 'annual_entitlement' => 7, 'is_active' => true, 'sort_order' => 2]);
    $service = app(LeaveService::class);

    // Hired Oct 10 with no opening credits typed in the Employee Directory (saved as 0):
    // October counts (by the 15th), so 3 of 12 months of 10 days = 2.5.
    $this->staffEmployee->update(['hire_date' => '2026-10-10', 'vacation_leave_credits' => 0]);
    expect($service->openingEntitlement($this->staffEmployee->fresh(), $this->vl, 2026))->toBe(2.5)
        ->and($service->openingEntitlement($this->staffEmployee->fresh(), $birthday, 2026))->toBe(7.0)
        ->and($service->openingEntitlement($this->staffEmployee->fresh(), $this->vl, 2027))->toBe(10.0);

    // Hired Oct 20: October does not count, 2 months = 1.67, rounded to 1.5.
    $this->staffEmployee->update(['hire_date' => '2026-10-20']);
    expect($service->openingEntitlement($this->staffEmployee->fresh(), $this->vl, 2026))->toBe(1.5);
});

test('a salary change keeps benefit shares fixed but flags the salary-based ones for review', function () {
    Permission::findOrCreate('libraries.employees.manage', 'web');
    $this->hrUser->givePermissionTo('libraries.employees.manage');

    $hmo = BenefitProgram::create(['entity_id' => $this->entity->id, 'code' => 'HMO2', 'name' => 'HMO at 2%', 'category' => 'insurance', 'contribution_basis' => 'percent_of_basic', 'payroll_mode' => 'contribution', 'employee_rate' => 2, 'employer_rate' => 3, 'is_active' => true]);
    $rice = BenefitProgram::create(['entity_id' => $this->entity->id, 'code' => 'RICE', 'name' => 'Rice', 'category' => 'allowance', 'contribution_basis' => 'fixed', 'payroll_mode' => 'earning', 'default_employer_share' => 2000, 'is_active' => true]);
    ($this->as)($this->hrUser)->post('/employee-management/benefits/enroll', ['employee_ids' => [$this->staffEmployee->id], 'benefit_program_id' => $hmo->id])->assertSessionHasNoErrors();
    ($this->as)($this->hrUser)->post('/employee-management/benefits/enroll', ['employee_ids' => [$this->staffEmployee->id], 'benefit_program_id' => $rice->id])->assertSessionHasNoErrors();
    $hmoEnrollment = EmployeeBenefit::where('benefit_program_id', $hmo->id)->firstOrFail();
    expect((float) $hmoEnrollment->employee_share)->toBe(600.0); // 2% of 30,000

    // Raise to 35,000 in the Employee Directory.
    ($this->as)($this->hrUser)->put("/libraries/employees/{$this->staffEmployee->id}", [
        'employee_code' => 'STF-1', 'firstname' => 'Sam', 'lastname' => 'Test', 'employment_status' => 'active', 'employment_type' => 'regular',
        'pay_type' => 'monthly', 'basic_pay' => 35000,
    ])->assertSessionHasNoErrors()->assertSessionHas('status', fn ($s) => str_contains($s, '1 benefit share based on salary need review'));

    $hmoEnrollment->refresh();
    expect((float) $hmoEnrollment->employee_share)->toBe(600.0)          // unchanged: amounts stay fixed
        ->and($hmoEnrollment->review_flagged_at)->not->toBeNull()
        ->and($hmoEnrollment->review_note)->toContain('30,000.00')->toContain('35,000.00');
    expect(EmployeeBenefit::where('benefit_program_id', $rice->id)->value('review_flagged_at'))->toBeNull();

    // HR reviews: saving the enrollment (with whatever amounts they choose) clears the flag.
    ($this->as)($this->hrUser)->put("/employee-management/benefits/enrollments/{$hmoEnrollment->id}", [
        'employee_share' => 700, 'employer_share' => 1050, 'participation_status' => 'active',
    ])->assertSessionHasNoErrors();
    $hmoEnrollment->refresh();
    expect($hmoEnrollment->review_flagged_at)->toBeNull()
        ->and((float) $hmoEnrollment->employee_share)->toBe(700.0);
});

test('the approvals table pages, searches by employee and keeps oldest first by default', function () {
    $service = app(LeaveService::class);
    $first = $service->file($this->staffEmployee, $this->vl, ['start_date' => '2026-10-20', 'end_date' => '2026-10-20', 'reason' => 'Errand'], $this->staffUser);
    Carbon::setTestNow('2026-10-14 10:00:00');
    $service->file($this->staffEmployee, $this->vl, ['start_date' => '2026-10-22', 'end_date' => '2026-10-22', 'reason' => 'Family day'], $this->staffUser);

    ($this->as)($this->hrUser)->get('/employee-management/requests?view=inbox&per_page=10')
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('feed.per_page', 10)
            ->where('feed.total', 2)
            ->where('feed.data.0.id', $first->id));

    ($this->as)($this->hrUser)->get('/employee-management/requests?view=inbox&q=Sam')
        ->assertInertia(fn (AssertableInertia $page) => $page->where('feed.total', 2));
    ($this->as)($this->hrUser)->get('/employee-management/requests?view=inbox&q=Nobody')
        ->assertInertia(fn (AssertableInertia $page) => $page->where('feed.total', 0));
});
