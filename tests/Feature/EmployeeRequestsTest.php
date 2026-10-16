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
        'kind' => 'official_business',
        'work_date' => '2026-10-16',
        'destination' => 'Supplier warehouse',
        'reason' => 'Frame stock count',
    ])->assertSessionHasNoErrors();

    ($this->as)($this->hrUser)->get('/employee-management/requests')
        ->assertInertia(fn (Assert $page) => $page
            ->where('badges.inbox', 2)
            ->where('badges.inboxByKind.leave', 1)
            ->where('badges.inboxByKind.official_business', 1)
            ->has('feed.data', 2)
            ->where('feed.data.0.kind', 'leave')
            ->where('feed.data.0.details.days', 2)
            ->where('feed.data.1.kind', 'official_business'));

    $leave = LeaveRequest::firstOrFail();
    $business = AttendanceRequest::firstOrFail();

    // Employees cannot decide requests.
    ($this->as)($this->staffUser)->post("/employee-management/requests/leave/{$leave->id}/review", ['decision' => 'approved'])->assertForbidden();

    // Declining needs a reason.
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$business->id}/review", ['decision' => 'declined'])
        ->assertSessionHasErrors('remarks');

    ($this->as)($this->hrUser)->post("/employee-management/requests/leave/{$leave->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$business->id}/review", ['decision' => 'declined', 'remarks' => 'Short-staffed that afternoon'])
        ->assertSessionHasNoErrors();

    expect($leave->fresh()->status)->toBe('approved')
        ->and($business->fresh()->status)->toBe('rejected');

    ($this->as)($this->staffUser)->get('/employee-management/requests?status=declined')
        ->assertInertia(fn (Assert $page) => $page
            ->where('statusCounts.approved', 1)
            ->where('statusCounts.declined', 1)
            ->has('feed.data', 1)
            ->where('feed.data.0.remarks', 'Short-staffed that afternoon')
            ->has('self.upcoming', 1));
});

test('overtime is filed in advance without hours, and every OT hour the clock records is paid', function () {
    // After the fact is refused.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'overtime',
        'work_date' => '2026-10-13',
        'reason' => 'Rush lens order',
    ])->assertSessionHasErrors('work_date');

    // Pre-approval for a later day, before any overtime exists. Planned hours are not asked for (and ignored if sent).
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'overtime',
        'work_date' => '2026-10-16',
        'requested_ot_hours' => 2,
        'reason' => 'Rush lens order due Saturday',
    ])->assertSessionHasNoErrors();

    $ot = AttendanceRequest::firstOrFail();
    expect($ot->requested_ot_hours)->toBeNull();
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$ot->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();
    expect($ot->fresh()->status)->toBe('approved');

    // On the day the employee works 2.5h past the 6:00 PM shift end: all of it is paid.
    $dtr = new DtrEntry([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->staffEmployee->id,
        'work_date' => '2026-10-16',
        'time_in' => '09:00:00',
        'time_out' => '20:30:00',
    ]);
    app(AttendanceCalculator::class)->compute($dtr, $this->staffEmployee)->save();

    expect((float) $dtr->ot_hours)->toBe(2.5)
        ->and((float) $dtr->ot_hours_approved)->toBe(2.5);

    // Overtime on a day without an approved request is rendered but not paid.
    $unapproved = new DtrEntry([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->staffEmployee->id,
        'work_date' => '2026-10-17',
        'time_in' => '09:00:00',
        'time_out' => '20:30:00',
    ]);
    app(AttendanceCalculator::class)->compute($unapproved, $this->staffEmployee)->save();

    expect((float) $unapproved->ot_hours)->toBe(2.5)
        ->and((float) $unapproved->ot_hours_approved)->toBe(0.0);

    // The Overtime tab finds the day's record even though the request was filed before it existed.
    ($this->as)($this->staffUser)->get('/employee-management/attendance?view=requests&request_status=approved')
        ->assertInertia(fn (Assert $page) => $page
            ->where('attendanceRequests.data.0.dtr_entry.ot_hours_approved', '2.50'));
});

test('undertime and changes of schedule are no longer filed', function () {
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'undertime',
        'work_date' => '2026-10-16',
        'requested_time_out' => '15:00',
        'reason' => 'Leaving early',
    ])->assertSessionHasErrors(['kind' => 'Undertime no longer needs a request: leaving before your shift ends is deducted automatically.']);

    ($this->as)($this->staffUser)->post('/employee-management/attendance/requests', [
        'employee_id' => $this->staffEmployee->id,
        'request_type' => 'undertime',
        'work_date' => '2026-10-16',
        'requested_time_out' => '15:00',
        'reason' => 'Leaving early',
    ])->assertSessionHasErrors('request_type');

    expect(AttendanceRequest::count())->toBe(0);

    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'schedule_change',
        'work_date' => '2026-10-17',
        'requested_rest_day' => true,
        'reason' => 'Swap with a colleague',
    ])->assertSessionHasErrors(['kind' => 'Schedule changes are no longer requested. Ask HR to update your shift or rest days.']);

    expect(AttendanceRequest::count())->toBe(0);
});

test('approved official business credits the whole scheduled day, with no times and no clock-in', function () {
    // Past day, no punches at all. Only where is asked for.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'official_business',
        'work_date' => '2026-10-13',
        'destination' => 'BIR RDO 47',
        'reason' => 'Filing quarterly returns',
    ])->assertSessionHasNoErrors();

    // Future day: applied when the day is closed.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'official_business',
        'work_date' => '2026-10-15',
        'destination' => 'Supplier warehouse',
        'reason' => 'Frame stock count',
    ])->assertSessionHasNoErrors();

    // Rest days have no scheduled day to credit.
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'official_business',
        'work_date' => '2026-10-18',
        'destination' => 'Trade fair',
        'reason' => 'Booth duty',
    ])->assertSessionHasErrors('work_date');

    foreach (AttendanceRequest::all() as $ob) {
        expect($ob->requested_time_in)->toBeNull()->and($ob->requested_time_out)->toBeNull();
        ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$ob->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();
    }

    // The full 9:00 AM – 6:00 PM shift counts as worked: not late, no undertime.
    $past = DtrEntry::where('employee_id', $this->staffEmployee->id)->whereDate('work_date', '2026-10-13')->firstOrFail();
    expect($past->source)->toBe('official_business')
        ->and($past->time_in)->toBe('09:00:00')
        ->and($past->time_out)->toBe('18:00:00')
        ->and($past->attendance_status)->toBe('present')
        ->and($past->is_absent)->toBeFalse()
        ->and((float) $past->regular_hours)->toBe(8.0)
        ->and((int) $past->tardiness_minutes)->toBe(0)
        ->and((int) $past->undertime_minutes)->toBe(0);

    expect(DtrEntry::whereDate('work_date', '2026-10-15')->exists())->toBeFalse();

    // On the day, the clock screen says there is nothing to punch, and past shift start the team board
    // shows official business rather than "late".
    Carbon::setTestNow('2026-10-15 10:30:00');
    ($this->as)($this->staffUser)->get('/employee-management/attendance?view=clock')
        ->assertInertia(fn (Assert $page) => $page->where('myDay.officialBusiness.destination', 'Supplier warehouse'));
    $board = app(\App\Services\People\TeamBoard::class)->build($this->entity->id);
    $row = collect($board['rows'])->firstWhere('employee.id', $this->staffEmployee->id);
    expect($row['status'])->toBe('official_business')
        ->and($row['official_business'])->toBe('Supplier warehouse');

    // A check-in made anyway before heading out doesn't stop the close from completing the day.
    DtrEntry::create(['entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'work_date' => '2026-10-15', 'time_in' => '08:50:00']);

    Carbon::setTestNow('2026-10-16 09:00:00');
    $summary = app(AttendanceCalculator::class)->closeDay($this->entity->id, '2026-10-15');
    expect($summary['official_business'])->toBe(1);

    $closed = DtrEntry::where('employee_id', $this->staffEmployee->id)->whereDate('work_date', '2026-10-15')->firstOrFail();
    expect($closed->time_in)->toBe('08:50:00')
        ->and($closed->time_out)->toBe('18:00:00')
        ->and($closed->attendance_status)->toBe('present')
        ->and($closed->is_absent)->toBeFalse();
});

test('a change of schedule still pending from before can be approved and publishes the roster', function () {
    $request = AttendanceRequest::create([
        'entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'request_type' => AttendanceRequest::TYPE_SCHEDULE_CHANGE,
        'work_date' => '2026-10-17', 'requested_rest_day' => true, 'reason' => 'Swapping Saturday with Ana', 'status' => 'pending', 'filed_by' => $this->staffUser->id,
    ]);
    ($this->as)($this->hrUser)->post("/employee-management/requests/attendance/{$request->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();

    $roster = ShiftRoster::where('employee_id', $this->staffEmployee->id)->whereDate('roster_date', '2026-10-17')->firstOrFail();
    expect($roster->is_rest_day)->toBeTrue()
        ->and($roster->status)->toBe(ShiftRoster::STATUS_PUBLISHED);

    expect(app(AttendanceCalculator::class)->scheduleFor($this->staffEmployee, '2026-10-17')->isRestDay)->toBeTrue();
});

test('approvers cannot decide their own requests and employees cannot withdraw others', function () {
    ($this->as)($this->hrUser)->post('/employee-management/requests', [
        'kind' => 'official_business',
        'work_date' => '2026-10-17',
        'destination' => 'Head office',
        'reason' => 'Quarterly HR meeting',
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
        'kind' => 'official_business',
        'employee_id' => $this->hrEmployee->id,
        'work_date' => '2026-10-16',
        'destination' => 'Supplier warehouse',
        'reason' => 'Frame stock count',
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
        'kind' => 'official_business', 'work_date' => '2026-10-15', 'destination' => 'Supplier warehouse', 'reason' => 'Frame stock count',
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

    ($this->as)($this->staffUser)->post('/employee-management/requests', ['kind' => 'overtime', 'work_date' => '2026-10-16', 'reason' => 'Inventory count'])->assertSessionHasNoErrors();
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

test('checking out needs a check-in, the accomplishment of the day, and a remark when a break punch is missing', function () {
    $punch = fn (array $data) => ($this->as)($this->staffUser)->post('/employee-management/attendance/punch', [
        'employee_id' => $this->staffEmployee->id,
        'latitude' => 14.5547,
        'longitude' => 121.0244,
        ...$data,
    ]);

    // A forgotten check-in is fixed with a time correction, not at check-out.
    $punch(['punch_type' => 'check_out', 'accomplishment' => 'Fitted 6 patients', 'notes' => 'Forgot to check in'])->assertSessionHasErrors('punch_type');

    $punch(['punch_type' => 'check_in'])->assertSessionHasNoErrors();
    Carbon::setTestNow('2026-10-14 18:00:00');
    $punch(['punch_type' => 'check_out', 'notes' => 'No break today'])->assertSessionHasErrors('accomplishment');
    $punch(['punch_type' => 'check_out', 'accomplishment' => 'Fitted 6 patients'])->assertSessionHasErrors('notes');
    $punch(['punch_type' => 'check_out', 'accomplishment' => 'Fitted 6 patients', 'notes' => 'Worked through lunch'])->assertSessionHasNoErrors();

    $dtr = DtrEntry::where('employee_id', $this->staffEmployee->id)->firstOrFail();
    expect($dtr->time_out)->toBe('18:00:00')
        ->and($dtr->accomplishment)->toBe('Fitted 6 patients')
        ->and($dtr->notes)->toContain('Worked through lunch');
});

test('a full day with a break checks out with only the accomplishment', function () {
    foreach (['check_in' => '09:00', 'break_out' => '12:00', 'break_in' => '13:00'] as $type => $time) {
        Carbon::setTestNow("2026-10-14 {$time}:00");
        ($this->as)($this->staffUser)->post('/employee-management/attendance/punch', ['employee_id' => $this->staffEmployee->id, 'punch_type' => $type, 'latitude' => 14.5547, 'longitude' => 121.0244])
            ->assertSessionHasNoErrors();
    }

    Carbon::setTestNow('2026-10-14 18:00:00');
    ($this->as)($this->staffUser)->post('/employee-management/attendance/punch', ['employee_id' => $this->staffEmployee->id, 'punch_type' => 'check_out', 'latitude' => 14.5547, 'longitude' => 121.0244, 'accomplishment' => 'Encoded lens orders'])
        ->assertSessionHasNoErrors();

    expect(DtrEntry::firstOrFail()->accomplishment)->toBe('Encoded lens orders');
});

test('the accomplishment keeps simple formatting and drops anything unsafe', function () {
    $punch = fn (array $data) => ($this->as)($this->staffUser)->post('/employee-management/attendance/punch', [
        'employee_id' => $this->staffEmployee->id,
        'latitude' => 14.5547,
        'longitude' => 121.0244,
        ...$data,
    ]);

    $punch(['punch_type' => 'check_in'])->assertSessionHasNoErrors();
    Carbon::setTestNow('2026-10-14 18:00:00');

    // An empty editor is not an accomplishment.
    $punch(['punch_type' => 'check_out', 'notes' => 'No break', 'accomplishment' => '<p></p>'])->assertSessionHasErrors('accomplishment');

    $punch([
        'punch_type' => 'check_out',
        'notes' => 'No break',
        'accomplishment' => '<p onclick="steal()">Fitted <strong class="x">6</strong> patients<script>alert(1)</script></p><ul><li>Lens <a href="javascript:x">orders</a></li></ul><img src=x onerror=alert(1)>',
    ])->assertSessionHasNoErrors();

    expect(DtrEntry::firstOrFail()->accomplishment)->toBe('<p>Fitted <strong>6</strong> patients</p><ul><li>Lens orders</li></ul>');
});

test('request history can be searched, sorted and paged', function () {
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'leave', 'leave_type_id' => $this->vl->id, 'start_date' => '2026-10-20', 'end_date' => '2026-10-20', 'reason' => 'Family trip',
    ])->assertSessionHasNoErrors();
    ($this->as)($this->staffUser)->post('/employee-management/requests', [
        'kind' => 'official_business', 'work_date' => '2026-10-16', 'destination' => 'Supplier warehouse', 'reason' => 'Frame stock count',
    ])->assertSessionHasNoErrors();

    // Reason, destination and leave type are searchable.
    ($this->as)($this->staffUser)->get('/employee-management/requests?view=mine&q=frame')
        ->assertInertia(fn (Assert $page) => $page
            ->where('filters.q', 'frame')
            ->has('feed.data', 1)
            ->where('feed.data.0.kind', 'official_business'));
    ($this->as)($this->staffUser)->get('/employee-management/requests?view=mine&q=vacation')
        ->assertInertia(fn (Assert $page) => $page->has('feed.data', 1)->where('feed.data.0.kind', 'leave'));

    // Sorted by request date, oldest first; page size is honoured and echoed back.
    ($this->as)($this->staffUser)->get('/employee-management/requests?view=mine&sort=date&dir=asc&per_page=10')
        ->assertInertia(fn (Assert $page) => $page
            ->where('filters.sort', 'date')
            ->where('filters.dir', 'asc')
            ->where('filters.per_page', 10)
            ->where('feed.per_page', 10)
            ->where('feed.data.0.date_from', '2026-10-16')
            ->where('feed.data.1.date_from', '2026-10-20'));

    // Team history also matches the employee's name; unknown sort values fall back to the default order.
    ($this->as)($this->hrUser)->get('/employee-management/requests?view=all&q=Sam&sort=bogus&per_page=7')
        ->assertInertia(fn (Assert $page) => $page
            ->has('feed.data', 2)
            ->where('filters.sort', '')
            ->where('filters.per_page', 15));
});

test('timesheets show every day by default, filter to unapproved, and approve a whole period at once', function () {
    $day = fn (string $date, array $extra = []) => DtrEntry::create([
        'entity_id' => $this->entity->id, 'employee_id' => $this->staffEmployee->id, 'work_date' => $date,
        'time_in' => '09:00:00', 'time_out' => '18:00:00', 'attendance_status' => 'present', 'status' => DtrEntry::STATUS_OPEN, ...$extra,
    ]);
    $ready = [$day('2026-10-05'), $day('2026-10-06'), $day('2026-10-07')];
    $missingPunch = $day('2026-10-08', ['time_out' => null, 'attendance_status' => 'incomplete']);
    $alreadyApproved = $day('2026-10-09', ['status' => DtrEntry::STATUS_APPROVED]);
    $otherPeriod = $day('2026-10-20');

    // Every day by default; the status filter narrows to the days still waiting.
    ($this->as)($this->hrUser)->get('/employee-management/attendance?view=timesheets&date_from=2026-10-01&date_to=2026-10-15')
        ->assertInertia(fn (Assert $page) => $page
            ->where('filters.status', 'all')
            ->where('entries.total', 5)
            ->where('approval.readyToApprove', 3));
    ($this->as)($this->hrUser)->get('/employee-management/attendance?view=timesheets&date_from=2026-10-01&date_to=2026-10-15&status=open')
        ->assertInertia(fn (Assert $page) => $page->where('filters.status', 'open')->where('entries.total', 4));

    // Employees still see every day of their own timesheet.
    ($this->as)($this->staffUser)->get('/employee-management/attendance?view=timesheets&date_from=2026-10-01&date_to=2026-10-15')
        ->assertInertia(fn (Assert $page) => $page->where('filters.status', 'all'));

    // Approve all (summary): every ready day in the period, across pages; missing punches are left for review.
    ($this->as)($this->hrUser)->post('/employee-management/attendance/approve-bulk', ['date_from' => '2026-10-01', 'date_to' => '2026-10-15'])
        ->assertSessionHasNoErrors();

    foreach ($ready as $d) {
        expect($d->fresh()->status)->toBe(DtrEntry::STATUS_APPROVED);
    }
    expect($missingPunch->fresh()->status)->toBe(DtrEntry::STATUS_OPEN)
        ->and($alreadyApproved->fresh()->status)->toBe(DtrEntry::STATUS_APPROVED)
        ->and($otherPeriod->fresh()->status)->toBe(DtrEntry::STATUS_OPEN);

    // Employees cannot approve.
    ($this->as)($this->staffUser)->post('/employee-management/attendance/approve-bulk', ['date_from' => '2026-10-16', 'date_to' => '2026-10-31'])->assertForbidden();
    expect($otherPeriod->fresh()->status)->toBe(DtrEntry::STATUS_OPEN);
});

test('the approval sheet approves and unapproves per employee', function () {
    $day = fn (Employee $employee, string $date, array $extra = []) => DtrEntry::create([
        'entity_id' => $this->entity->id, 'employee_id' => $employee->id, 'work_date' => $date,
        'time_in' => '09:00:00', 'time_out' => '18:00:00', 'attendance_status' => 'present', 'status' => DtrEntry::STATUS_OPEN, ...$extra,
    ]);
    $samDays = [$day($this->staffEmployee, '2026-10-05'), $day($this->staffEmployee, '2026-10-06')];
    $samLeave = $day($this->staffEmployee, '2026-10-07', ['time_in' => null, 'time_out' => null, 'attendance_status' => 'on_leave', 'status' => DtrEntry::STATUS_APPROVED]);
    $helenDay = $day($this->hrEmployee, '2026-10-05');
    $locked = $day($this->hrEmployee, '2026-10-02', ['status' => DtrEntry::STATUS_LOCKED]);

    ($this->as)($this->hrUser)->get('/employee-management/attendance?view=timesheets&date_from=2026-10-01&date_to=2026-10-15')
        ->assertInertia(fn (Assert $page) => $page
            ->where('summary', fn ($rows) => collect($rows)->firstWhere('employee.id', $this->staffEmployee->id)['ready'] === 2
                && collect($rows)->firstWhere('employee.id', $this->staffEmployee->id)['approved'] === 1
                && collect($rows)->firstWhere('employee.id', $this->staffEmployee->id)['leave_days'] === 1));

    // Approve selected employees only.
    ($this->as)($this->hrUser)->post('/employee-management/attendance/approve-bulk', [
        'date_from' => '2026-10-01', 'date_to' => '2026-10-15', 'employee_ids' => [$this->staffEmployee->id],
    ])->assertSessionHasNoErrors();
    expect($samDays[0]->fresh()->status)->toBe(DtrEntry::STATUS_APPROVED)
        ->and($samDays[1]->fresh()->status)->toBe(DtrEntry::STATUS_APPROVED)
        ->and($helenDay->fresh()->status)->toBe(DtrEntry::STATUS_OPEN);

    // Unapprove sends the employee's approved days back; locked days stay locked.
    ($this->as)($this->hrUser)->post('/employee-management/attendance/reopen-bulk', [
        'date_from' => '2026-10-01', 'date_to' => '2026-10-15', 'employee_ids' => [$this->staffEmployee->id, $this->hrEmployee->id],
    ])->assertSessionHasNoErrors();
    expect($samDays[0]->fresh()->status)->toBe(DtrEntry::STATUS_OPEN)
        ->and($samDays[0]->fresh()->approved_by)->toBeNull()
        ->and($samLeave->fresh()->status)->toBe(DtrEntry::STATUS_OPEN)
        ->and($locked->fresh()->status)->toBe(DtrEntry::STATUS_LOCKED);

    ($this->as)($this->staffUser)->post('/employee-management/attendance/reopen-bulk', [
        'date_from' => '2026-10-01', 'date_to' => '2026-10-15', 'employee_ids' => [$this->staffEmployee->id],
    ])->assertForbidden();
});
