<?php

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00');
    $this->entity = Entity::create(['code' => 'RPT', 'name' => 'Reports Clinic', 'is_active' => true]);

    foreach (['dashboard.view', 'payroll.view'] as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $make = function (array $permissions) {
        $user = User::factory()->create();
        $user->givePermissionTo($permissions);
        $user->entities()->attach($this->entity->id, ['is_default' => true]);

        return $user;
    };
    $this->hr = $make(['dashboard.view', 'payroll.view']);
    $this->manager = $make(['dashboard.view']);

    $emp = fn (array $a) => Employee::create(['entity_id' => $this->entity->id, 'is_active' => true, 'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 30000, ...$a]);
    $this->a = $emp(['employee_code' => 'R-1', 'firstname' => 'Ana', 'lastname' => 'Cruz', 'position' => 'Optometrist', 'employment_type' => 'regular', 'hire_date' => '2024-01-08']);
    $this->b = $emp(['employee_code' => 'R-2', 'firstname' => 'Ben', 'lastname' => 'Diaz', 'position' => 'Receptionist', 'employment_type' => 'probationary', 'hire_date' => '2026-10-01']);
    $emp(['employee_code' => 'R-3', 'firstname' => 'Cy', 'lastname' => 'Uy', 'position' => 'Optometrist', 'employment_type' => 'regular', 'hire_date' => '2023-02-01',
        'employment_status' => 'separated', 'separation_date' => '2026-10-05']);

    $dtr = fn (Employee $e, string $date, array $a = []) => DtrEntry::create([
        'entity_id' => $this->entity->id, 'employee_id' => $e->id, 'work_date' => $date, 'status' => 'approved',
        'attendance_status' => 'present', 'regular_hours' => 8, 'day_type' => 'regular', 'is_absent' => false, ...$a,
    ]);
    $dtr($this->a, '2026-10-05');
    $dtr($this->a, '2026-10-06', ['attendance_status' => 'late', 'tardiness_minutes' => 15]);
    $dtr($this->a, '2026-10-07', ['attendance_status' => 'absent', 'is_absent' => true, 'regular_hours' => 0]);
    $dtr($this->b, '2026-10-05');

    $this->as = fn (User $u) => $this->actingAs($u)->withSession(['current_entity_id' => $this->entity->id]);
});

afterEach(fn () => Carbon::setTestNow());

test('the report computes workforce and attendance for the period', function () {
    ($this->as)($this->hr)->get('/employee-management/reports?preset=this_month')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('employee-management/reports/page')
            ->where('range.from', '2026-10-01')
            ->where('range.to', '2026-10-31')
            ->where('workforce.active', 2)
            ->where('workforce.hires', 1)
            ->where('workforce.separations', 1)
            ->where('attendance.absences', 1)
            ->where('attendance.lateCount', 1)
            ->where('attendance.rate', 75)
            ->where('canSeePay', true)
            ->whereNot('payroll', null)
            ->has('workforce.trend', 12));
});

test('headcount is broken down by position, attendance and payroll cost by employee', function () {
    ($this->as)($this->hr)->get('/employee-management/reports?preset=this_month')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('workforce.byPosition', 2)
            ->has('attendance.byEmployee', 2)
            ->has('payroll.byEmployee', 0)
            ->missing('departments')
            ->missing('filters.department'));

    $csv = ($this->as)($this->hr)->get('/employee-management/reports/export?section=workforce&preset=this_month');
    expect($csv->streamedContent())->toContain('Position')->toContain('Optometrist')->toContain('Receptionist');
});

test('pay figures are hidden without payroll access', function () {
    ($this->as)($this->manager)->get('/employee-management/reports')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('canSeePay', false)->where('payroll', null));

    ($this->as)($this->manager)->get('/employee-management/reports/export?section=payroll')->assertForbidden();
});

test('sections export as CSV for the current filters', function () {
    $csv = ($this->as)($this->hr)->get('/employee-management/reports/export?section=attendance&preset=this_month');
    $csv->assertOk();
    expect($csv->streamedContent())->toContain('Attendance rate %')->toContain('Ana Cruz');
});
