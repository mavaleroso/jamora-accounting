<?php

use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollPeriod;
use App\Models\ShiftRoster;
use App\Models\User;
use App\Services\People\AttendanceCalculator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    // Wednesday; default shift is Mon–Sat with Sunday rest.
    Carbon::setTestNow('2026-10-14 09:00:00');

    $permissions = [
        'attendance.view', 'attendance.punch', 'attendance.manage',
        'leave.view', 'leave.file', 'leave.approve',
        'roster.view', 'portal.view', 'payroll.view', 'payroll.manage',
    ];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }

    $this->entity = Entity::create(['code' => 'REQ-BRANCH', 'name' => 'Requests Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP']);

    $makeUser = function (string $email, string $role, array $perms) {
        $user = User::factory()->create(['email' => $email]);
        $user->assignRole(Role::findOrCreate($role, 'web')->syncPermissions($perms));
        $user->entities()->attach($this->entity->id, ['is_default' => true]);

        return $user;
    };
    $makeEmployee = fn (User $user, string $code, string $first) => Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $user->id,
        'employee_code' => $code,
        'firstname' => $first,
        'lastname' => 'Test',
        'email' => $user->email,
        'position' => 'Staff',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 30000,
        'rest_days' => ['sun'],
        'gender' => 'female',
    ]);

    $this->hrUser = $makeUser('hr@req.test', 'HR Manager', ['attendance.view', 'attendance.manage', 'leave.view', 'leave.file', 'leave.approve', 'payroll.view', 'payroll.manage']);
    $this->hrEmployee = $makeEmployee($this->hrUser, 'HR-1', 'Helen');

    $this->staffUser = $makeUser('staff@req.test', 'Employee', ['attendance.view', 'attendance.punch', 'leave.view', 'leave.file', 'roster.view', 'portal.view']);
    $this->staffEmployee = $makeEmployee($this->staffUser, 'STF-1', 'Sam');

    $this->auditor = $makeUser('audit@req.test', 'Auditor', ['attendance.view', 'leave.view', 'payroll.view']);

    $this->vl = LeaveType::create(['code' => 'VL', 'name' => 'Vacation Leave', 'is_paid' => true, 'balance_tracked' => true, 'annual_entitlement' => 10, 'allow_half_day' => true, 'is_active' => true, 'sort_order' => 1]);
    LeaveType::create(['code' => 'PL', 'name' => 'Paternity Leave', 'is_paid' => true, 'balance_tracked' => false, 'max_days_per_filing' => 7, 'gender' => 'male', 'is_active' => true, 'sort_order' => 5]);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
});

afterEach(fn () => Carbon::setTestNow());

test('each perspective lands on its own view of the module', function () {
    ($this->as)($this->staffUser)->get('/employee-management/requests')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('employee-management/requests/page')
            ->where('view', 'mine')
            ->where('views', ['mine'])
            ->where('perspective.canReview', false)
            // Gender-specific types are hidden from the balance sheet.
            ->has('self.balances', 1)
            ->where('self.balances.0.code', 'VL')
            ->where('self.balances.0.available', 10));

    ($this->as)($this->hrUser)->get('/employee-management/requests')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('view', 'inbox')
            ->where('views', ['mine', 'inbox', 'all', 'balances']));

    ($this->as)($this->auditor)->get('/employee-management/requests?view=inbox')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('view', 'all')
            ->where('views', ['all', 'balances'])
            ->where('perspective.canViewTeam', true)
            ->where('perspective.canReview', false));

    // Viewing balances never creates balance rows.
    ($this->as)($this->hrUser)->get('/employee-management/requests?view=balances')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('teamBalances', 2));
    expect(LeaveBalance::count())->toBe(0);
});

test('the old leave page redirects to employee requests', function () {
    ($this->as)($this->staffUser)->get('/employee-management/leave')
        ->assertRedirect('/employee-management/requests?kind=leave');
});

test('leave and day-level requests share one feed and one approval flow', function () {
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'leave',
        'leave_type_id' => $this->vl->id,
        'start_date' => '2026-10-19',
        'end_date' => '2026-10-20',
        'reason' => 'Family trip',
    ])->assertSessionHasNoErrors()->assertSessionHas('status');


    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'undertime',
        'work_date' => '2026-10-16',
        'requested_time_out' => '15:00',
        'reason' => 'Medical check-up',
    ])->assertSessionHasNoErrors();

    ($this->as)($this->hrUser)->get('/employee-management/requests')
        ->assertInertia(fn (Assert $page) => $page
            ->where('badges.inbox', 2)
            ->where('badges.inboxByKind.leave', 1)
            ->where('badges.inboxByKind.undertime', 1)
            ->has('feed.data', 2)
            ->where('feed.data.0.kind', 'leave')
            ->where('feed.data.0.details.days', 2)
            ->where('feed.data.1.kind', 'undertime'));

    $leave = LeaveRequest::firstOrFail();
    $undertime = AttendanceRequest::firstOrFail();

    // Employees cannot decide requests.
    ($this->as)($this->staffUser)->post("/employee-management/requests/leave/{$leave->id}/review", ['decision' => 'approved'])->assertForbidden();

    // Declining needs a reason.
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$undertime->id}/review", ['decision' => 'declined'])
        ->assertSessionHasErrors('remarks');

    ($this->as)($this->hrUser)->post("/employee-management/requests/leave/{$leave->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$undertime->id}/review", ['decision' => 'declined', 'remarks' => 'Short-staffed that afternoon'])
        ->assertSessionHasNoErrors();

    expect($leave->fresh()->status)->toBe('approved')
        ->and($undertime->fresh()->status)->toBe('rejected');

    ($this->as)($this->staffUser)->get('/employee-management/requests?status=declined')
        ->assertInertia(fn (Assert $page) => $page
            ->where('statusCounts.approved', 1)
            ->where('statusCounts.declined', 1)
            ->has('feed.data', 1)
            ->where('feed.data.0.remarks', 'Short-staffed that afternoon')
            ->has('self.upcoming', 1));
});

test('overtime and undertime are filed in advance, and payable OT is capped at what is rendered', function () {
    // After the fact is refused.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'overtime',
        'work_date' => '2026-10-13',
        'requested_ot_hours' => 2,
        'reason' => 'Rush lens order',
    ])->assertSessionHasErrors('work_date');

    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'undertime',
        'work_date' => '2026-10-13',
        'requested_time_out' => '15:00',
        'reason' => 'Medical check-up',
    ])->assertSessionHasErrors('work_date');

    // Today, but the departure time has already passed (it is 9:00 AM).
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'undertime',
        'work_date' => '2026-10-14',
        'requested_time_out' => '08:30',
        'reason' => 'Medical check-up',
    ])->assertSessionHasErrors('requested_time_out');

    // Pre-approval for a later day, before any overtime exists.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'overtime',
        'work_date' => '2026-10-16',
        'requested_ot_hours' => 2,
        'reason' => 'Rush lens order due Saturday',
    ])->assertSessionHasNoErrors();

    $ot = AttendanceRequest::firstOrFail();
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$ot->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();
    expect($ot->fresh()->status)->toBe('approved');

    // On the day the employee works 1.5h past the 6:00 PM shift end: only that much is paid.
    $dtr = new DtrEntry([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->staffEmployee->id,
        'work_date' => '2026-10-16',
        'time_in' => '09:00:00',
        'time_out' => '19:30:00',
    ]);
    app(AttendanceCalculator::class)->compute($dtr, $this->staffEmployee)->save();

    expect((float) $dtr->ot_hours)->toBe(1.5)
        ->and((float) $dtr->ot_hours_approved)->toBe(1.5);
});

test('undertime must end before the shift and schedule changes cannot be backdated', function () {
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'undertime',
        'work_date' => '2026-10-16',
        'requested_time_out' => '19:00',
        'reason' => 'Leaving early',
    ])->assertSessionHasErrors('requested_time_out');

    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'schedule_change',
        'work_date' => '2026-10-12',
        'requested_rest_day' => true,
        'reason' => 'Swap with a colleague',
    ])->assertSessionHasErrors('work_date');
});

test('approved official business fills the time record, now or at the daily close', function () {
    // Past day, no punches at all.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'official_business',
        'work_date' => '2026-10-13',
        'requested_time_in' => '08:00',
        'requested_time_out' => '17:00',
        'destination' => 'BIR RDO 47',
        'reason' => 'Filing quarterly returns',
    ])->assertSessionHasNoErrors();

    // Future day: applied when the day is closed.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'official_business',
        'work_date' => '2026-10-15',
        'requested_time_in' => '09:00',
        'requested_time_out' => '18:00',
        'destination' => 'Supplier warehouse',
        'reason' => 'Frame stock count',
    ])->assertSessionHasNoErrors();

    foreach (AttendanceRequest::all() as $ob) {
        ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$ob->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();
    }

    $past = DtrEntry::where('employee_id', $this->staffEmployee->id)->whereDate('work_date', '2026-10-13')->firstOrFail();
    expect($past->source)->toBe('official_business')
        ->and($past->is_absent)->toBeFalse()
        ->and((float) $past->regular_hours)->toBeGreaterThan(0);

    expect(DtrEntry::whereDate('work_date', '2026-10-15')->exists())->toBeFalse();

    Carbon::setTestNow('2026-10-16 09:00:00');
    $summary = app(AttendanceCalculator::class)->closeDay($this->entity->id, '2026-10-15');
    expect($summary['official_business'])->toBe(1);

    $closed = DtrEntry::where('employee_id', $this->staffEmployee->id)->whereDate('work_date', '2026-10-15')->firstOrFail();
    expect($closed->attendance_status)->toBe('present')
        ->and($closed->is_absent)->toBeFalse();
});

test('approved change of schedule publishes the roster for that day', function () {
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'schedule_change',
        'work_date' => '2026-10-17',
        'requested_rest_day' => true,
        'reason' => 'Swapping Saturday with Ana',
    ])->assertSessionHasNoErrors();

    $request = AttendanceRequest::firstOrFail();
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$request->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();

    $roster = ShiftRoster::where('employee_id', $this->staffEmployee->id)->whereDate('roster_date', '2026-10-17')->firstOrFail();
    expect($roster->is_rest_day)->toBeTrue()
        ->and($roster->status)->toBe(ShiftRoster::STATUS_PUBLISHED);

    expect(app(AttendanceCalculator::class)->scheduleFor($this->staffEmployee, '2026-10-17')->isRestDay)->toBeTrue();
});

test('approvers cannot decide their own requests and employees cannot withdraw others', function () {
    ($this->as)($this->hrUser)->post('/employee-management/requests', [
        'kind' => 'schedule_change',
        'work_date' => '2026-10-17',
        'requested_time_in' => '10:00',
        'requested_time_out' => '19:00',
        'reason' => 'Covering the late clinic',
    ])->assertSessionHasNoErrors();

    $own = AttendanceRequest::firstOrFail();
    expect($own->employee_id)->toBe($this->hrEmployee->id);

    // Own requests are not in the inbox and cannot be approved.
    ($this->as)($this->hrUser)->get('/employee-management/requests')->assertInertia(fn (Assert $page) => $page->where('badges.inbox', 0));
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$own->id}/review", ['decision' => 'approved'])->assertSessionHasErrors('approver');

    ($this->as)($this->staffUser)->post("/employee-management/requests/attendance/{$own->id}/cancel")->assertForbidden();
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$own->id}/cancel")->assertSessionHasNoErrors();
    expect($own->fresh()->status)->toBe('cancelled');
});

test('hr can file on behalf of an employee', function () {
    ($this->as)($this->hrUser)->post('/employee-management/requests', [
        'kind' => 'leave',
        'employee_id' => $this->staffEmployee->id,
        'leave_type_id' => $this->vl->id,
        'start_date' => '2026-10-21',
        'end_date' => '2026-10-21',
        'half_day' => 'am',
        'reason' => 'Filed for Sam by phone',
    ])->assertSessionHasNoErrors();

    $leave = LeaveRequest::firstOrFail();
    expect($leave->employee_id)->toBe($this->staffEmployee->id)
        ->and((float) $leave->days_count)->toBe(0.5)
        ->and($leave->filed_by)->toBe($this->hrUser->id);

    // An employee's employee_id is ignored: they always file for themselves.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'undertime',
        'employee_id' => $this->hrEmployee->id,
        'work_date' => '2026-10-16',
        'requested_time_out' => '15:00',
        'reason' => 'Medical check-up',
    ])->assertSessionHasNoErrors();
    expect(AttendanceRequest::firstOrFail()->employee_id)->toBe($this->staffEmployee->id);
});

test('leave types are preset on the employee record, all by default', function () {
    Permission::findOrCreate('libraries.employees.manage', 'web');
    $this->hrUser->givePermissionTo('libraries.employees.manage');

    // New and existing records default to every leave type.
    expect($this->staffEmployee->leave_type_ids)->toBeNull()
        ->and($this->staffEmployee->allowsLeaveType($this->vl))->toBeTrue();

    $payload = fn (array $leave) => [
        'employee_code' => 'STF-1', 'firstname' => 'Sam', 'lastname' => 'Test', 'gender' => 'female',
        'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'monthly', 'basic_pay' => 30000,
        ...$leave,
    ];

    // HR limits Sam to paternity leave only (which also does not match her gender) -> no fileable leave.
    $pl = LeaveType::where('code', 'PL')->firstOrFail();
    ($this->as)($this->hrUser)->put("/libraries/employees/{$this->staffEmployee->id}", $payload(['leave_type_scope' => 'custom', 'leave_type_ids' => [$pl->id]]))
        ->assertSessionHasNoErrors();
    expect($this->staffEmployee->fresh()->leave_type_ids)->toBe([$pl->id]);

    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'leave',
        'leave_type_id' => $this->vl->id,
        'start_date' => '2026-10-19',
        'end_date' => '2026-10-19',
        'reason' => 'Errand',
    ])->assertSessionHasErrors('leave_type_id');
    expect(LeaveRequest::count())->toBe(0);

    ($this->as)($this->staffUser)->get('/employee-management/requests')
        ->assertInertia(fn (Assert $page) => $page->has('self.balances', 0)->where('self.leave_type_ids', [$pl->id]));

    // Ticking everything again is stored as "all" (NULL), so future leave types are included.
    ($this->as)($this->hrUser)->put("/libraries/employees/{$this->staffEmployee->id}", $payload(['leave_type_scope' => 'all']))
        ->assertSessionHasNoErrors();
    expect($this->staffEmployee->fresh()->leave_type_ids)->toBeNull();

    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'leave',
        'leave_type_id' => $this->vl->id,
        'start_date' => '2026-10-19',
        'end_date' => '2026-10-19',
        'reason' => 'Errand',
    ])->assertSessionHasNoErrors();
});

test('the portal summarises the employee day, requests, credits, posted payslips and record', function () {
    $this->staffEmployee->update(['sss_number' => '34-1234567-8', 'tin' => '123-456-789-000', 'bank_name' => 'BDO', 'bank_account_no' => '001234567890']);

    // Approved VL on Friday; nothing else on the roster (default shift applies).
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'leave', 'leave_type_id' => $this->vl->id, 'start_date' => '2026-10-16', 'end_date' => '2026-10-16', 'reason' => 'Family errand',
    ])->assertSessionHasNoErrors();
    ($this->as)($this->hrUser)->post('/employee-management/requests/leave/'.LeaveRequest::firstOrFail()->id.'/review', ['decision' => 'approved']);
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'undertime', 'work_date' => '2026-10-15', 'requested_time_out' => '16:00', 'reason' => 'Dental appointment',
    ])->assertSessionHasNoErrors();

    // One computed (not yet posted) and one posted run.
    foreach (['computed' => 'PP-A', 'posted' => 'PP-B'] as $status => $code) {
        $period = \App\Models\PayrollPeriod::create(['entity_id' => $this->entity->id, 'code' => $code, 'start_date' => '2026-09-16', 'end_date' => '2026-09-30', 'pay_date' => '2026-10-05', 'status' => 'draft']);
        $run = \App\Models\PayrollRun::create(['entity_id' => $this->entity->id, 'payroll_period_id' => $period->id, 'run_no' => $code, 'status' => $status]);
        \App\Models\Payslip::create([
            'payroll_run_id' => $run->id, 'employee_id' => $this->staffEmployee->id, 'basic_pay' => 15000, 'ot_pay' => 0, 'absences' => 0, 'tardiness' => 0,
            'gross_pay' => 15000, 'sss' => 750, 'philhealth' => 375, 'pagibig' => 200, 'withholding_tax' => 0, 'other_deductions' => 0, 'net_pay' => 13675,
        ]);
    }

    ($this->as)($this->staffUser)->get('/employee-management/portal')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('employee-management/portal/page')
            ->where('employee.sss_number', '34-1234567-8')
            ->where('employee.tin', '123-456-789-000')
            ->where('employee.bank_account_hint', '•••• 7890')
            ->missing('employee.bank_account_no')
            // Wed → Tue; default shift on work days, Friday on leave, Sunday rest.
            ->has('week', 7)
            ->where('week.0.date', '2026-10-14')
            ->where('week.0.start', '09:00:00')
            ->where('week.0.source', 'default')
            ->where('week.2.leave.title', 'Vacation Leave')
            ->where('week.4.is_rest_day', true)
            ->where('requests.pending', 1)
            ->has('requests.recent', 2)
            ->where('balances.0.available', 9)
            ->has('payslips', 1)
            ->where('payslips.0.period.code', 'PP-B')
            ->where('payslips.0.total_deductions', 1325)
            ->where('payslips.0.net_pay', 13675));
});

test('a time correction is decided on its day in the timesheet, not in the requests inbox', function () {
    $dtr = new DtrEntry(['entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'work_date' => '2026-10-13', 'time_in' => '09:00:00']);
    app(AttendanceCalculator::class)->compute($dtr, $this->staffEmployee)->save();
    expect($dtr->attendance_status)->toBe('incomplete');

    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'correction',
        'work_date' => '2026-10-13',
        'requested_time_out' => '18:00',
        'reason' => 'Forgot to clock out',
    ])->assertSessionHasNoErrors();
    $correction = AttendanceRequest::firstOrFail();

    ($this->as)($this->hrUser)->get('/employee-management/requests')
        ->assertInertia(fn (Assert $page) => $page->where('badges.inbox', 0)->where('badges.corrections', 1));

    ($this->as)($this->hrUser)->get('/employee-management/attendance?view=timesheets&date_from=2026-10-01&date_to=2026-10-15')
        ->assertInertia(fn (Assert $page) => $page
            ->where('approval.corrections', 1)
            ->where('entries.data.0.pending_correction.id', $correction->id)
            ->where('entries.data.0.pending_correction.requested_time_out', '18:00:00'));

    // Bulk approval leaves the day alone; approving the day applies the correction.
    ($this->as)($this->hrUser)->post('/employee-management/attendance/approve-bulk', ['ids' => [$dtr->id]]);
    expect($dtr->fresh()->status)->toBe(DtrEntry::STATUS_OPEN);

    ($this->as)($this->hrUser)->post("/employee-management/attendance/{$dtr->id}/approve")->assertSessionHasNoErrors();
    $dtr->refresh();
    expect($dtr->status)->toBe(DtrEntry::STATUS_APPROVED)
        ->and($dtr->time_out)->toBe('18:00:00')
        ->and($correction->fresh()->status)->toBe('approved');
});

test('a rejected day needs a reason, is left out of the summary, and can be undone', function () {
    foreach (['2026-10-12', '2026-10-13'] as $date) {
        $dtr = new DtrEntry(['entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'work_date' => $date, 'time_in' => '09:00:00', 'time_out' => '18:00:00']);
        app(AttendanceCalculator::class)->compute($dtr, $this->staffEmployee)->save();
    }
    $day = DtrEntry::whereDate('work_date', '2026-10-13')->firstOrFail();
    $hoursPerDay = (float) $day->regular_hours;

    ($this->as)($this->hrUser)->post("/employee-management/attendance/{$day->id}/reject")->assertSessionHasErrors('remarks');
    ($this->as)($this->hrUser)->post("/employee-management/attendance/{$day->id}/reject", ['remarks' => 'No proof of attendance'])->assertSessionHasNoErrors();
    expect($day->fresh()->status)->toBe(DtrEntry::STATUS_REJECTED);

    ($this->as)($this->hrUser)->get('/employee-management/attendance?view=timesheets&date_from=2026-10-01&date_to=2026-10-15')
        ->assertInertia(fn (Assert $page) => $page
            ->has('summary', 1)
            ->where('summary.0.days_worked', 1)
            ->where('summary.0.regular_hours', fn ($v) => (float) $v === $hoursPerDay)
            ->where('summary.0.total_hours', fn ($v) => (float) $v === $hoursPerDay)
            ->where('summary.0.rejected', 1)
            ->where('approval.rejected', 1));

    ($this->as)($this->hrUser)->post("/employee-management/attendance/{$day->id}/reopen")->assertSessionHasNoErrors();
    expect($day->fresh()->status)->toBe(DtrEntry::STATUS_OPEN);
});

test('timesheets open on the current pay period and the overtime tab lists only overtime', function () {
    PayrollPeriod::create(['entity_id' => $this->entity->id, 'code' => 'PP-2026-10-1', 'frequency' => 'semi_monthly', 'start_date' => '2026-10-01', 'end_date' => '2026-10-15', 'status' => 'open']);

    ($this->as)($this->staffUser)->post('/employee-management/requests', ['kind' => 'overtime', 'work_date' => '2026-10-16', 'requested_ot_hours' => 2, 'reason' => 'Inventory count'])->assertSessionHasNoErrors();
    ($this->as)($this->staffUser)->post('/employee-management/requests', ['kind' => 'correction', 'work_date' => '2026-10-13', 'requested_time_in' => '09:00', 'reason' => 'Biometric was down'])->assertSessionHasNoErrors();

    ($this->as)($this->hrUser)->get('/employee-management/attendance?view=requests')
        ->assertInertia(fn (Assert $page) => $page
            ->where('filters.date_from', '2026-10-01')
            ->where('filters.date_to', '2026-10-15')
            ->has('periods', 1)
            ->where('attendanceRequests.total', 1)
            ->where('attendanceRequests.data.0.request_type', 'overtime'));
});

test('a pay period can be changed until payroll is computed for it', function () {
    $first = PayrollPeriod::create(['entity_id' => $this->entity->id, 'code' => 'PP-A', 'frequency' => 'semi_monthly', 'start_date' => '2026-10-01', 'end_date' => '2026-10-15', 'status' => 'open']);
    PayrollPeriod::create(['entity_id' => $this->entity->id, 'code' => 'PP-B', 'frequency' => 'semi_monthly', 'start_date' => '2026-10-16', 'end_date' => '2026-10-31', 'status' => 'open']);

    ($this->as)($this->hrUser)->put("/payroll/periods/{$first->id}", ['code' => 'PP-A', 'start_date' => '2026-09-26', 'end_date' => '2026-10-10', 'pay_date' => '2026-10-15'])
        ->assertSessionHasNoErrors();
    expect($first->fresh()->start_date->toDateString())->toBe('2026-09-26')
        ->and($first->fresh()->end_date->toDateString())->toBe('2026-10-10');

    ($this->as)($this->hrUser)->put("/payroll/periods/{$first->id}", ['code' => 'PP-A', 'start_date' => '2026-10-01', 'end_date' => '2026-10-20'])
        ->assertSessionHasErrors('start_date');
});
