<?php

use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Models\ShiftRoster;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    // Wednesday; the week runs Mon 12 – Sun 18 Oct, Sunday is the rest day.
    Carbon::setTestNow('2026-10-14 09:00:00');

    foreach (['attendance.view', 'attendance.punch', 'leave.view', 'leave.file', 'roster.view', 'roster.manage', 'portal.view'] as $p) {
        Permission::findOrCreate($p, 'web');
    }

    $this->entity = Entity::create(['code' => 'SCHED-BRANCH', 'name' => 'Schedule Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP']);

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
        'email' => $user?->email,
        'position' => 'Staff',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 30000,
        'rest_days' => ['sun'],
        'gender' => 'female',
    ]);

    $this->staffUser = $makeUser('staff@sched.test', 'Employee', ['attendance.view', 'attendance.punch', 'leave.view', 'leave.file', 'roster.view', 'portal.view']);
    $this->staff = $makeEmployee($this->staffUser, 'STF-1', 'Sam');
    $this->colleague = $makeEmployee(null, 'STF-2', 'Cora');
    $this->manager = $makeUser('lead@sched.test', 'Scheduler', ['roster.view', 'roster.manage']);

    $shift = fn (Employee $e, string $date, string $status, array $extra = []) => ShiftRoster::create([
        'entity_id' => $this->entity->id,
        'employee_id' => $e->id,
        'roster_date' => $date,
        'shift_name' => 'Clinic Mid',
        'shift_start' => '10:00:00',
        'shift_end' => '19:00:00',
        'break_minutes' => 60,
        'grace_minutes' => 5,
        'is_rest_day' => false,
        'status' => $status,
        ...$extra,
    ]);

    $shift($this->staff, '2026-10-15', ShiftRoster::STATUS_PUBLISHED, ['published_at' => '2026-10-13 16:00:00', 'notes' => 'Cover front desk']);
    $shift($this->staff, '2026-10-16', 'draft', ['shift_start' => '06:00:00', 'shift_end' => '15:00:00']);
    $shift($this->colleague, '2026-10-15', ShiftRoster::STATUS_PUBLISHED, ['published_at' => '2026-10-13 16:00:00']);

    LeaveRequest::create(['entity_id' => $this->entity->id, 'employee_id' => $this->colleague->id, 'leave_type' => 'sick', 'start_date' => '2026-10-14',
        'end_date' => '2026-10-14', 'days_count' => 1, 'reason' => 'Medical check-up', 'status' => LeaveRequest::STATUS_APPROVED]);
    LeaveRequest::create(['entity_id' => $this->entity->id, 'employee_id' => $this->staff->id, 'leave_type' => 'vacation', 'start_date' => '2026-10-17',
        'end_date' => '2026-10-17', 'days_count' => 1, 'reason' => 'Family trip', 'status' => LeaveRequest::STATUS_APPROVED]);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
});

afterEach(fn () => Carbon::setTestNow());

test('an employee sees only their own published week, not the branch roster', function () {
    ($this->as)($this->staffUser)->get('/employee-management/roster')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('employee-management/roster/my-schedule')
            ->where('employee.employee_code', 'STF-1')
            ->where('weekStart', '2026-10-12')
            ->has('days', 7)
            ->missing('rosterMatrix')
            ->missing('employees')
            // Published roster shift, flagged as recently updated, with its note.
            ->where('days.3.date', '2026-10-15')
            ->where('days.3.start', '10:00:00')
            ->where('days.3.source', 'roster')
            ->where('days.3.notes', 'Cover front desk')
            ->where('days.3.recently_updated', true)
            ->where('days.3.scheduled_minutes', 480)
            // The draft for Friday is ignored: the day falls back to the usual schedule.
            ->where('days.4.source', 'default')
            ->where('days.4.recently_updated', false)
            // Own approved leave, with the reason left out.
            ->where('days.5.leave', ['title' => 'Leave', 'half_day' => false])
            ->where('days.5.scheduled_minutes', 0)
            ->where('days.6.is_rest_day', true)
            ->where('summary.leaveDays', 1)
            ->where('summary.restDays', 1)
            ->where('recentlyUpdated', true)
            ->where('can.fileLeave', true));
});

test('the employee view never carries colleagues or leave reasons', function () {
    $html = ($this->as)($this->staffUser)->get('/employee-management/roster')->assertOk()->getContent();

    expect($html)->not->toContain('Cora')
        ->and($html)->not->toContain('Medical check-up')
        ->and($html)->not->toContain('Family trip')
        ->and($html)->not->toContain('06:00');
});

test('weeks can be browsed', function () {
    ($this->as)($this->staffUser)->get('/employee-management/roster?week_start=2026-10-21')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('weekStart', '2026-10-19')
            ->where('recentlyUpdated', false));
});

test('schedulers still get the full roster grid', function () {
    ($this->as)($this->manager)->get('/employee-management/roster')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('employee-management/roster/page')
            ->has('rosterMatrix', 2));
});
