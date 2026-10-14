<?php

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow('2026-10-14 10:30:00'); // Wednesday
    $this->entity = Entity::create(['code' => 'DSH', 'name' => 'Dashboard Clinic', 'is_active' => true]);

    foreach (['attendance.view', 'attendance.manage', 'leave.approve', 'payroll.view', 'compliance.view', 'portal.view'] as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $make = function (array $permissions) {
        $u = User::factory()->create();
        $u->givePermissionTo($permissions);
        $u->entities()->attach($this->entity->id, ['is_default' => true]);

        return $u;
    };
    $this->hr = $make(['attendance.manage', 'leave.approve', 'payroll.view', 'compliance.view']);
    $this->approver = $make(['leave.approve']);
    $this->staff = $make(['attendance.view', 'portal.view']);

    $emp = fn (string $code, string $first, array $a = []) => Employee::create([
        'entity_id' => $this->entity->id, 'employee_code' => $code, 'firstname' => $first, 'lastname' => 'Test', 'is_active' => true,
        'employment_status' => 'active', 'employment_type' => 'regular', 'hire_date' => '2024-03-04', 'rest_days' => [0], ...$a,
    ]);
    $this->in = $emp('D-1', 'Ina');
    $this->late = $emp('D-2', 'Leo');
    $this->leave = $emp('D-3', 'Lia');
    $emp('D-4', 'Pia', ['employment_type' => 'probationary', 'hire_date' => '2026-04-20']);

    DtrEntry::create(['entity_id' => $this->entity->id, 'employee_id' => $this->in->id, 'work_date' => '2026-10-14', 'time_in' => '08:20:00', 'tardiness_minutes' => 20,
        'attendance_status' => 'late', 'status' => 'open', 'day_type' => 'regular']);
    DtrEntry::create(['entity_id' => $this->entity->id, 'employee_id' => $this->late->id, 'work_date' => '2026-10-13', 'time_in' => '08:00:00',
        'attendance_status' => 'incomplete', 'status' => 'open', 'day_type' => 'regular']);
    LeaveRequest::create(['entity_id' => $this->entity->id, 'employee_id' => $this->leave->id, 'leave_type' => 'vacation', 'start_date' => '2026-10-14', 'end_date' => '2026-10-15',
        'days_count' => 2, 'reason' => 'Family trip', 'status' => LeaveRequest::STATUS_APPROVED]);
    LeaveRequest::create(['entity_id' => $this->entity->id, 'employee_id' => $this->late->id, 'leave_type' => 'sick', 'start_date' => '2026-10-20', 'end_date' => '2026-10-20',
        'days_count' => 1, 'reason' => 'Check-up', 'status' => LeaveRequest::STATUS_PENDING]);

    $this->as = fn (User $u) => $this->actingAs($u)->withSession(['current_entity_id' => $this->entity->id]);
});

afterEach(fn () => Carbon::setTestNow());

test('HR sees today, the inbox, payroll, compliance and who is out', function () {
    ($this->as)($this->hr)->get('/employee-management')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('employee-management/dashboard/page')
            ->where('show.team', true)
            ->where('team.counts.in', 1)
            ->where('team.counts.arrivedLate', 1)
            ->where('team.counts.onLeave', 1)
            ->where('team.counts.scheduled', 4)
            ->where('inbox.pendingTotal', 1)
            ->where('inbox.unapprovedRecords', 1)
            ->where('inbox.incompleteRecords', 1)
            ->has('compliance.items')
            ->has('payroll.periods')
            ->where('out.0.name', 'Lia Test')
            ->where('out.0.today', true)
            ->where('people.active', 4)
            ->where('people.probationDue.0.name', 'Pia Test'));
});

test('sections follow permissions', function () {
    ($this->as)($this->approver)->get('/employee-management')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('show.inbox', true)->where('team', null)->where('payroll', null)->where('compliance', null)->has('inbox.oldest', 1));
});

test('self-service staff cannot open the HR dashboard', function () {
    ($this->as)($this->staff)->get('/employee-management')->assertForbidden();
});

test('the attendance team board still works after moving to TeamBoard', function () {
    ($this->as)($this->hr)->get('/employee-management/attendance?view=today')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('board.counts.on_leave', 1));
});
