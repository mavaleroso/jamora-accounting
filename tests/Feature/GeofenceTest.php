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
    foreach (['attendance.view', 'attendance.punch'] as $p) {
        Permission::findOrCreate($p, 'web');
    }

    // The branch itself has the geofence switched on (as every seeded branch does).
    $this->entity = Entity::create(['code' => 'GEO', 'name' => 'Geo Clinic', 'is_active' => true,
        'latitude' => 14.5547, 'longitude' => 121.0244, 'geofence_radius' => 250, 'geofence_enforced' => true]);

    $this->staff = User::factory()->create();
    $this->staff->assignRole(Role::findOrCreate('Employee', 'web')->syncPermissions(['attendance.view', 'attendance.punch']));
    $this->staff->entities()->attach($this->entity->id, ['is_default' => true]);
    $this->employee = Employee::create(['entity_id' => $this->entity->id, 'user_id' => $this->staff->id, 'employee_code' => 'G-1', 'firstname' => 'Gina',
        'lastname' => 'Test', 'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 20000, 'rest_days' => ['sun']]);

    $this->punch = fn (array $coords = []) => $this->actingAs($this->staff)->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/attendance/punch', ['employee_id' => $this->employee->id, 'punch_type' => 'check_in', ...$coords]);
});

afterEach(fn () => Carbon::setTestNow());

test('with geofencing off system-wide, employees clock in anywhere even if the branch enforces it', function () {
    config(['attendance.geofence_enabled' => false]);

    ($this->punch)()->assertSessionHasNoErrors();
    expect(DtrEntry::where('employee_id', $this->employee->id)->value('time_in'))->toBe('09:00:00');

    // The clock screen shows the same rule, and the settings dialog keeps the branch's own choice.
    $this->actingAs($this->staff)->withSession(['current_entity_id' => $this->entity->id])->get('/employee-management/attendance')
        ->assertInertia(fn (Assert $page) => $page
            ->where('branchLocation.geofence_enforced', false)
            ->where('branchLocation.branch_geofence_enforced', true)
            ->where('branchLocation.geofence_system_enabled', false));
});

test('with geofencing on, the branch setting applies: location is required and must be within the radius', function () {
    config(['attendance.geofence_enabled' => true]);

    ($this->punch)()->assertSessionHasErrors('location');
    ($this->punch)(['latitude' => 10.3157, 'longitude' => 123.8854])->assertSessionHasErrors('location');   // Cebu, far away
    expect(DtrEntry::count())->toBe(0);

    ($this->punch)(['latitude' => 14.5548, 'longitude' => 121.0245])->assertSessionHasNoErrors();         // about 15m away
    expect(DtrEntry::where('employee_id', $this->employee->id)->value('location_status'))->toBe('verified');
});

test('with geofencing on but switched off for the branch, nobody is blocked', function () {
    config(['attendance.geofence_enabled' => true]);
    $this->entity->update(['geofence_enforced' => false]);

    ($this->punch)()->assertSessionHasNoErrors();
});
