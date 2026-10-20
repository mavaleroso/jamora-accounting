<?php

use App\Models\Employee;
use App\Models\Entity;
use App\Models\ShiftRoster;
use App\Models\ShiftTemplate;
use App\Models\User;
use App\Services\People\AttendanceCalculator;
use App\Support\EntityContext;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/*
 * Every employee works one shift, 9:00 AM - 6:00 PM (config people.default_shift), unless the roster sets other hours
 * for a day. The Employee Directory offers no other shift.
 */
beforeEach(function () {
    $this->clinic = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    app(EntityContext::class)->clear();

    $permissions = ['libraries.employees.manage', 'roster.view', 'roster.manage'];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->hr = User::factory()->create();
    $this->hr->assignRole(Role::findOrCreate('Accountant', 'web')->syncPermissions($permissions));
    $this->hr->entities()->attach($this->clinic->id, ['is_default' => true]);

    $this->maria = Employee::create(['entity_id' => $this->clinic->id, 'employee_code' => '001', 'firstname' => 'Maria', 'lastname' => 'Santos',
        'employment_status' => 'active', 'employment_type' => 'regular', 'is_active' => true, 'pay_type' => 'daily', 'basic_pay' => 475, 'rest_days' => [0]]);

    $this->as = fn () => $this->actingAs($this->hr)->withSession(['current_entity_id' => $this->clinic->id]);
});

test('the directory offers only the 9:00 AM - 6:00 PM shift, and the roster defaults to it', function () {
    ($this->as)()->get('/libraries/employees')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->missing('shiftTemplates')
            ->where('policy.defaultShift.name', 'Regular Day Shift (9:00 AM - 6:00 PM)'));

    expect(app(AttendanceCalculator::class)->scheduleFor($this->maria, '2026-10-14')->toArray())
        ->toMatchArray(['start' => '09:00:00', 'end' => '18:00:00', 'break_minutes' => 60, 'source' => 'default']);

    // A day not rostered yet is drafted on the same shift.
    ($this->as)()->get('/employee-management/roster?week_start=2026-10-12')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('defaultShift.start', '09:00:00')
            ->where('rosterMatrix.0.shifts.2026-10-14.shift_name', 'Regular Day Shift (9:00 AM - 6:00 PM)')
            ->where('rosterMatrix.0.shifts.2026-10-14.shift_start', '09:00:00')
            ->where('rosterMatrix.0.shifts.2026-10-14.shift_end', '18:00:00'));
});

test('the other shift templates are removed, and employees on one move to the 9:00 AM - 6:00 PM shift', function () {
    $template = fn (string $code, string $start, string $end) => ShiftTemplate::query()->withoutGlobalScopes()->create([
        'entity_id' => $this->clinic->id, 'code' => $code, 'name' => $code, 'start_time' => $start, 'end_time' => $end,
        'break_minutes' => 60, 'grace_minutes' => 5, 'is_active' => true,
    ]);
    $early = $template('REG-0817', '08:00:00', '17:00:00');
    $mall = $template('MALL-1019', '10:00:00', '19:00:00');
    $this->maria->update(['default_shift_template_id' => $early->id]);
    // A roster made with a template keeps it, deactivated, for its history.
    ShiftRoster::query()->withoutGlobalScopes()->create(['entity_id' => $this->clinic->id, 'employee_id' => $this->maria->id, 'shift_template_id' => $mall->id,
        'roster_date' => '2026-10-01', 'shift_name' => 'Mall', 'shift_start' => '10:00:00', 'shift_end' => '19:00:00', 'break_minutes' => 60, 'grace_minutes' => 5,
        'is_rest_day' => false, 'status' => ShiftRoster::STATUS_PUBLISHED]);

    (require database_path('migrations/2026_10_26_120000_keep_only_the_regular_day_shift.php'))->up();

    expect(ShiftTemplate::query()->withoutGlobalScopes()->find($early->id))->toBeNull()
        ->and(ShiftTemplate::query()->withoutGlobalScopes()->find($mall->id)->is_active)->toBeFalse()
        ->and($this->maria->fresh()->default_shift_template_id)->toBeNull()
        ->and(app(AttendanceCalculator::class)->scheduleFor($this->maria->fresh(), '2026-10-14')->start)->toBe('09:00:00');
});
