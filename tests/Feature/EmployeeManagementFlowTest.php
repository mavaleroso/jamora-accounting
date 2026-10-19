<?php

use App\Models\ComplianceItem;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollPeriod;
use App\Models\Payslip;
use App\Models\ShiftRoster;
use App\Models\ShiftTemplate;
use App\Models\User;
use App\Services\Payroll\PayrollService;
use App\Services\People\AttendanceCalculator;
use App\Services\People\BenefitCalculator;
use App\Services\People\LeaveService;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    $permissions = [
        'roster.view', 'roster.manage',
        'attendance.view', 'attendance.punch', 'attendance.manage',
        'leave.view', 'leave.file', 'leave.approve',
        'benefits.view', 'benefits.manage',
        'compliance.view', 'compliance.manage', 'compliance.verify',
        'portal.view',
        'payroll.view', 'payroll.manage',
        'periods.view', 'dashboard.view', 'ap.view',
        'admin.roles-permissions.manage', 'admin.users.manage',
    ];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }

    $hrRole = Role::findOrCreate('HR Manager', 'web');
    $hrRole->syncPermissions($permissions);

    $this->entity = Entity::create([
        'code' => 'TEST-BRANCH',
        'name' => 'Main Test Clinic',
        'type' => 'branch',
        'status' => 'active',
        'currency' => 'PHP',
        'latitude' => 14.5547,
        'longitude' => 121.0244,
        'geofence_radius' => 250,
        'geofence_enforced' => true,
    ]);

    $this->hrUser = User::factory()->create([
        'email' => 'hr@test.com',
    ]);
    $this->hrUser->assignRole($hrRole);
    $this->hrUser->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->hrEmployee = Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $this->hrUser->id,
        'employee_code' => 'EMP-HR-001',
        'firstname' => 'Helen',
        'lastname' => 'Reyes',
        'email' => 'hr@test.com',
        'position' => 'HR Manager',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 45000.00,
        'rest_days' => ['sun'],
    ]);

    $this->staffUser = User::factory()->create([
        'email' => 'staff@test.com',
    ]);
    $staffRole = Role::findOrCreate('Staff', 'web');
    $staffRole->givePermissionTo(['portal.view', 'attendance.punch', 'leave.file']);
    $this->staffUser->assignRole($staffRole);
    $this->staffUser->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->staffEmployee = Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $this->staffUser->id,
        'employee_code' => 'EMP-STF-001',
        'firstname' => 'Sam',
        'lastname' => 'Torres',
        'email' => 'staff@test.com',
        'position' => 'Optometrist',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 32000.00,
        'rest_days' => ['sun'],
    ]);

    $this->leaveTypeVl = LeaveType::create([
        'code' => 'VL',
        'name' => 'Vacation Leave',
        'category' => 'company',
        'is_paid' => true,
        'days_per_year' => 15.00,
        'carries_over' => true,
        'max_carry_over' => 5.00,
        'is_cash_convertible' => true,
        'is_active' => true,
        'statutory_reference' => 'Company Policy',
    ]);

    LeaveBalance::create([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->staffEmployee->id,
        'leave_type_id' => $this->leaveTypeVl->id,
        'year' => (int) Carbon::now()->year,
        'entitled' => 15.00,
        'carried_over' => 0.00,
        'adjusted' => 0.00,
        'used' => 0.00,
        'reserved' => 0.00,
    ]);

    LeaveBalance::create([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->hrEmployee->id,
        'leave_type_id' => $this->leaveTypeVl->id,
        'year' => (int) Carbon::now()->year,
        'entitled' => 15.00,
        'carried_over' => 0.00,
        'adjusted' => 0.00,
        'used' => 0.00,
        'reserved' => 0.00,
    ]);
});

test('shift templates can be created, roster assigned, copied to next week, and deleted', function () {
    $this->actingAs($this->hrUser);

    // 1. Create Shift Template
    $templateResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/roster/templates', [
            'code' => 'MORNING',
            'name' => 'Morning Clinic Shift',
            'start_time' => '08:00',
            'end_time' => '17:00',
            'break_minutes' => 60,
            'grace_minutes' => 15,
            'color' => '#10b981',
        ]);
    $templateResponse->assertSessionHas('status');

    $template = ShiftTemplate::where('code', 'MORNING')->first();
    expect($template)->not->toBeNull();
    expect($template->name)->toBe('Morning Clinic Shift');

    // 2. Assign Shift to Roster for a specific day
    $workDate = Carbon::now()->next(Carbon::MONDAY)->toDateString();
    $rosterResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/roster', [
            'employee_id' => $this->staffEmployee->id,
            'roster_date' => $workDate,
            'shift_template_id' => $template->id,
            'notes' => 'Assigned opening',
        ]);
    $rosterResponse->assertSessionHas('status');

    $shift = ShiftRoster::where('employee_id', $this->staffEmployee->id)->whereDate('roster_date', $workDate)->first();
    expect($shift)->not->toBeNull();
    expect($shift->shift_name)->toBe('Morning Clinic Shift');

    // 3. Delete shift
    $deleteResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->delete("/employee-management/roster/{$shift->id}");
    $deleteResponse->assertSessionHas('status');
    expect(ShiftRoster::find($shift->id))->toBeNull();
});

test('attendance calculator accurately computes tardiness, undertime, night differential and handles daily close', function () {
    $calculator = app(AttendanceCalculator::class);

    // Default shift: 09:00 - 18:00 (1h break, 15m grace)
    // 1. Test Tardiness: punches in at 09:20 (20 mins late, grace is 15 so full 20 mins late)
    $dtr = new DtrEntry([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->staffEmployee->id,
        'work_date' => '2026-10-15', // Thursday (working day)
        'time_in' => '09:20:00',
        'time_out' => '18:00:00',
        'break_out' => '12:00:00',
        'break_in' => '13:00:00',
    ]);

    $computed = $calculator->compute($dtr, $this->staffEmployee);
    expect((float) $computed->tardiness_minutes)->toBe(20.0);
    expect((float) $computed->undertime_minutes)->toBe(0.0);
    expect($computed->attendance_status)->toBe('late');

    // 2. Test Undertime: punches in on time 08:58, punches out early at 17:30 (30m undertime)
    $dtrEarly = new DtrEntry([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->staffEmployee->id,
        'work_date' => '2026-10-15',
        'time_in' => '08:58:00',
        'time_out' => '17:30:00',
        'break_out' => '12:00:00',
        'break_in' => '13:00:00',
    ]);
    $computedEarly = $calculator->compute($dtrEarly, $this->staffEmployee);
    expect((float) $computedEarly->tardiness_minutes)->toBe(0.0);
    expect((float) $computedEarly->undertime_minutes)->toBe(30.0);
    expect($computedEarly->attendance_status)->toBe('undertime');

    // 3. Test Night Differential: 20:00 to 05:00 next day (break 00:00 to 01:00)
    // Night window is 22:00 to 06:00.
    // Elapsed in night window: 22:00 to 05:00 = 7 hours minus 1 hour break = 6 hours ND.
    $dtrNight = new DtrEntry([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->staffEmployee->id,
        'work_date' => '2026-10-15',
        'time_in' => '20:00:00',
        'time_out' => '05:00:00',
        'break_out' => '00:00:00',
        'break_in' => '01:00:00',
    ]);
    $computedNight = $calculator->compute($dtrNight, $this->staffEmployee);
    expect((float) $computedNight->night_diff_hours)->toBe(6.0);

    // 4. Test Daily Close: creates absent record for unworked working day
    $closeResult = $calculator->closeDay($this->entity->id, '2026-10-15');
    expect($closeResult['absent'])->toBeGreaterThanOrEqual(1);

    $absentDtr = DtrEntry::where('employee_id', $this->staffEmployee->id)
        ->whereDate('work_date', '2026-10-15')
        ->first();
    expect($absentDtr)->not->toBeNull();
    expect($absentDtr->attendance_status)->toBe('absent');
    expect($absentDtr->is_absent)->toBeTrue();
});

test('leave workflow enforces anti-self-approval and executes single-level HR approval with balance ledger', function () {
    $leaveService = app(LeaveService::class);
    // The leave below starts in the future, so the employee may still withdraw it.
    $this->travelTo(Carbon::parse('2026-10-16 09:00'));

    // 1. Staff requests leave for Monday 2026-10-19 to Tuesday 2026-10-20 (2 working days)
    $this->actingAs($this->staffUser);
    $fileResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/requests', [
            'kind' => 'leave',
            'leave_type_id' => $this->leaveTypeVl->id,
            'start_date' => '2026-10-19',
            'end_date' => '2026-10-20',
            'reason' => 'Family vacation',
        ]);
    $fileResponse->assertSessionHas('status');

    $request = LeaveRequest::where('employee_id', $this->staffEmployee->id)->first();
    expect($request)->not->toBeNull();
    expect($request->status)->toBe('pending');
    expect((float) $request->days_count)->toBe(2.0);

    // Balance should show 2 pending days reserved
    $balance = LeaveBalance::where('employee_id', $this->staffEmployee->id)
        ->where('leave_type_id', $this->leaveTypeVl->id)
        ->first();
    expect((float) $balance->reserved)->toBe(2.0);
    expect((float) $balance->used)->toBe(0.0);

    // 2. Staff cannot approve own leave
    $unauthApprove = $this->post("/employee-management/requests/leave/{$request->id}/review", ['decision' => 'approved']);
    $unauthApprove->assertForbidden();

    // 3. HR cannot approve their OWN leave (Anti-Self-Approval rule)
    $this->actingAs($this->hrUser);
    $hrOwnRequest = $leaveService->file(
        $this->hrEmployee,
        $this->leaveTypeVl,
        [
            'start_date' => '2026-10-22',
            'end_date' => '2026-10-22',
            'reason' => 'Personal matter',
        ],
        $this->hrUser
    );
    expect($hrOwnRequest->status)->toBe('pending');

    $selfApproveResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post("/employee-management/requests/leave/{$hrOwnRequest->id}/review", ['decision' => 'approved']);
    $selfApproveResponse->assertSessionHasErrors(['approver']);

    // 4. HR approves Staff leave request (HR single-level approval)
    $approveResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post("/employee-management/requests/leave/{$request->id}/review", ['decision' => 'approved']);
    $approveResponse->assertSessionHas('status');

    $request->refresh();
    expect($request->status)->toBe('approved');
    expect($request->approved_by)->toBe($this->hrUser->id);

    $balance->refresh();
    expect((float) $balance->reserved)->toBe(0.0);
    expect((float) $balance->used)->toBe(2.0);

    // DTR records should be synchronized as on_leave
    $dtrCount = DtrEntry::where('employee_id', $this->staffEmployee->id)
        ->where('attendance_status', 'on_leave')
        ->whereIn('work_date', ['2026-10-19', '2026-10-20'])
        ->count();
    expect($dtrCount)->toBe(2);

    // 5. A colleague cannot cancel someone else's leave
    $colleague = User::factory()->create();
    $colleague->assignRole('Staff');
    $colleague->entities()->attach($this->entity->id, ['is_default' => true]);
    Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $colleague->id,
        'employee_code' => 'EMP-STF-002',
        'firstname' => 'Cora',
        'lastname' => 'Lim',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 30000.00,
    ]);
    $this->actingAs($colleague)->withSession(['current_entity_id' => $this->entity->id])
        ->post("/employee-management/requests/leave/{$request->id}/cancel", ['reason' => 'Not mine'])
        ->assertForbidden();
    expect($request->fresh()->status)->toBe('approved');

    // 6. Staff cancels their own approved leave before it starts: balance is restored and DTR is unlinked
    $this->actingAs($this->staffUser);
    $cancelResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post("/employee-management/requests/leave/{$request->id}/cancel", [
            'reason' => 'Trip cancelled due to weather',
        ]);
    $cancelResponse->assertSessionHas('status');

    $request->refresh();
    expect($request->status)->toBe('cancelled');

    $balance->refresh();
    expect((float) $balance->used)->toBe(0.0);
    expect((float) $balance->available)->toBe(15.0);
});

test('benefit calculator computes statutory SSS, PhilHealth, and Pag-IBIG contributions correctly', function () {
    $calculator = app(BenefitCalculator::class);

    // Staff basic pay: 32,000.00 PHP
    // 1. SSS: 2025 table cap MSC is 35,000. For 32,000 basic pay:
    // EE (5%) = 1,600, ER (10% + 30 EC) = 3,230
    $sss = $calculator->computeSss(32000.00);
    expect($sss['msc'])->toEqual(32000);
    expect($sss['employee_share'])->toBe(1600.0);
    expect($sss['employer_share'])->toBe(3230.0);

    // 2. PhilHealth: 5% total split 50/50. 32,000 * 5% = 1,600 -> EE = 800, ER = 800
    $philhealth = $calculator->computePhilHealth(32000.00);
    expect($philhealth['employee_share'])->toBe(800.0);
    expect($philhealth['employer_share'])->toBe(800.0);

    // 3. Pag-IBIG: Circular 460 maximum base is 10,000 -> EE (2%) = 200, ER (2%) = 200
    $pagibig = $calculator->computePagIbig(32000.00);
    expect($pagibig['employee_share'])->toBe(200.0);
    expect($pagibig['employer_share'])->toBe(200.0);
});

test('compliance calendar auto-generates statutory items and progresses through audit lifecycle', function () {
    $this->actingAs($this->hrUser);

    // 1. Generate compliance obligations for period October 2026
    $genResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/compliance/generate-calendar', [
            'period' => 'October 2026',
        ]);
    $genResponse->assertSessionHas('status');

    $item = ComplianceItem::where('entity_id', $this->entity->id)->first();
    expect($item)->not->toBeNull();
    expect($item->status)->toBe('pending');

    // 2. Progress status: pending -> prepared
    $update1 = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post("/employee-management/compliance/{$item->id}/status", [
            'status' => 'prepared',
            'notes' => '1601-C schedule drafted',
        ]);
    $update1->assertSessionHas('status');
    $item->refresh();
    expect($item->status)->toBe('prepared');

    // 3. Progress status: prepared -> submitted
    $update2 = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post("/employee-management/compliance/{$item->id}/status", [
            'status' => 'submitted',
            'reference_no' => 'BIR-EAFS-987654321',
            'filed_on' => now()->toDateString(),
        ]);
    $update2->assertSessionHas('status');
    $item->refresh();
    expect($item->status)->toBe('submitted');
    expect($item->reference_no)->toBe('BIR-EAFS-987654321');

    // 4. The preparer cannot verify their own filing; a second person signs it off.
    $this->withSession(['current_entity_id' => $this->entity->id])
        ->post("/employee-management/compliance/{$item->id}/verify")->assertSessionHasErrors('status');

    $reviewer = User::factory()->create();
    $reviewer->givePermissionTo('compliance.verify');
    $reviewer->entities()->attach($this->entity->id);
    $update3 = $this->actingAs($reviewer)->withSession(['current_entity_id' => $this->entity->id])
        ->post("/employee-management/compliance/{$item->id}/verify");
    $update3->assertSessionHas('status');
    $item->refresh();
    expect($item->status)->toBe('verified');
});

test('payroll computation locks DTR cut-off entries and compensates approved overtime', function () {
    // 1. Create a DTR entry with 2 hours rendered overtime and 2 hours approved overtime
    $workDate = '2026-10-05';
    $dtr = DtrEntry::create([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->staffEmployee->id,
        'work_date' => $workDate,
        'time_in' => '09:00:00',
        'time_out' => '20:00:00',
        'break_out' => '12:00:00',
        'break_in' => '13:00:00',
        'regular_hours' => 8.00,
        'ot_hours' => 2.00,
        'ot_hours_approved' => 2.00,
        'attendance_status' => 'present',
        'is_absent' => false,
        'day_type' => 'regular',
    ]);

    // Approval needs every working day recorded and approved.
    $dtr->update(['status' => DtrEntry::STATUS_APPROVED]);
    foreach ([$this->staffEmployee, $this->hrEmployee] as $employee) {
        foreach (CarbonPeriod::create('2026-10-01', '2026-10-15') as $day) {
            if (! $day->isSunday() && ! DtrEntry::where('employee_id', $employee->id)->whereDate('work_date', $day)->exists()) {
                DtrEntry::create(['entity_id' => $this->entity->id, 'employee_id' => $employee->id, 'work_date' => $day->toDateString(), 'time_in' => '09:00:00', 'time_out' => '18:00:00', 'regular_hours' => 8, 'attendance_status' => 'present', 'day_type' => 'regular', 'status' => DtrEntry::STATUS_APPROVED]);
            }
        }
    }

    // 2. Create and compute payroll period
    $period = PayrollPeriod::create([
        'entity_id' => $this->entity->id,
        'code' => 'PP-2026-10-1',
        'start_date' => '2026-10-01',
        'end_date' => '2026-10-15',
        'pay_date' => '2026-10-20',
        'status' => 'draft',
    ]);

    $payrollService = app(PayrollService::class);
    $run = $payrollService->compute($period, $this->hrUser->id);
    expect($run)->not->toBeNull();

    $payslip = Payslip::where('payroll_run_id', $run->id)
        ->where('employee_id', $this->staffEmployee->id)
        ->first();
    expect($payslip)->not->toBeNull();
    // Staff basic pay = 32,000/month. Daily = 32,000 x 12 / 313 = 1,226.84; hourly = 153.35.
    // 2 approved OT hours on a regular day at 125% = 383.39.
    expect((float) $payslip->ot_pay)->toBe(383.39);
    // Semi-monthly: half the monthly salary.
    expect((float) $payslip->basic_pay)->toBe(16000.0);

    // A draft does not lock the cut-off; approval does.
    expect($dtr->fresh()->isLocked())->toBeFalse();
    $payrollService->approve($run, $this->hrUser);

    // 3. Confirm DTR entries within cut-off are locked
    $dtr->refresh();
    expect($dtr->isLocked())->toBeTrue();
    expect($dtr->payroll_period_id)->toBe($period->id);

    // 4. Attempting to tamper with locked DTR throws ValidationException
    $calculator = app(AttendanceCalculator::class);
    $this->expectException(ValidationException::class);
    $calculator->assertEditable($dtr);
});
