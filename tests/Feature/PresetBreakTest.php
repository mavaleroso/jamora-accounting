<?php

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\ShiftRoster;
use App\Models\ShiftTemplate;
use App\Models\User;
use App\Services\People\AttendanceCalculator;
use App\Services\People\TeamBoard;
use App\Services\People\WorkSchedule;
use App\Support\EntityContext;
use Carbon\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/*
 * Each employee can have a preset break time. It lasts exactly one hour on any shift that has a break, co-workers may
 * share it, and it only guides and flags: it never refuses a punch.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00'); // a Wednesday
    config(['attendance.geofence_enabled' => false]);

    $this->clinic = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    app(EntityContext::class)->clear();

    foreach (['libraries.employees.manage', 'attendance.view', 'attendance.punch'] as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->hr = User::factory()->create();
    $this->hr->assignRole(Role::findOrCreate('Accountant', 'web')->syncPermissions(['libraries.employees.manage']));
    $this->hr->entities()->attach($this->clinic->id, ['is_default' => true]);

    $make = fn (string $code, string $first, array $extra = []) => Employee::create([
        'entity_id' => $this->clinic->id, 'employee_code' => $code, 'firstname' => $first, 'lastname' => 'Santos',
        'employment_status' => 'active', 'employment_type' => 'regular', 'is_active' => true, 'pay_type' => 'daily', 'basic_pay' => 475,
        'rest_days' => [0], ...$extra,
    ]);
    $this->maria = $make('001', 'Maria');
    $this->jose = $make('002', 'Jose', ['break_start' => '12:00:00']);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->clinic->id]);
    $this->save = fn (Employee $e, array $changes = []) => ($this->as)($this->hr)->put("/libraries/employees/{$e->id}", [
        'employee_code' => $e->employee_code, 'firstname' => $e->firstname, 'lastname' => $e->lastname,
        'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'daily', 'basic_pay' => 475, ...$changes,
    ]);
});

afterEach(fn () => Carbon::setTestNow());

test('a preset break is saved with the employee and must fit within their shift', function () {
    // Company default shift: 9:00 AM - 6:00 PM with a 60-minute break.
    ($this->save)($this->maria, ['break_start' => '13:00'])->assertSessionHasNoErrors();
    expect($this->maria->fresh()->break_start)->toBe('13:00:00');

    ($this->save)($this->maria, ['break_start' => '17:30'])->assertSessionHasErrors(['break_start' => 'The 1-hour break must fit within the shift (9:00 AM – 6:00 PM).']);
    ($this->save)($this->maria, ['break_start' => 'noon'])->assertSessionHasErrors('break_start');
    expect($this->maria->fresh()->break_start)->toBe('13:00:00');

    // An overnight shift takes a break after midnight; a shift without a break takes none.
    $night = ShiftTemplate::create(['entity_id' => $this->clinic->id, 'code' => 'NIGHT', 'name' => 'Night', 'start_time' => '22:00:00', 'end_time' => '06:00:00', 'break_minutes' => 60, 'grace_minutes' => 5, 'is_active' => true]);
    $straight = ShiftTemplate::create(['entity_id' => $this->clinic->id, 'code' => 'HALF', 'name' => 'Half day', 'start_time' => '08:00:00', 'end_time' => '12:00:00', 'break_minutes' => 0, 'grace_minutes' => 5, 'is_active' => true]);
    ($this->save)($this->maria, ['default_shift_template_id' => $night->id, 'break_start' => '02:00'])->assertSessionHasNoErrors();
    expect($this->maria->fresh()->break_start)->toBe('02:00:00');
    ($this->save)($this->maria, ['default_shift_template_id' => $straight->id, 'break_start' => '10:00'])
        ->assertSessionHasErrors(['break_start' => 'This shift has no unpaid break. Leave the break time blank or choose a shift with one.']);

    // Blank clears it; leaving the field out keeps it.
    ($this->save)($this->maria, ['default_shift_template_id' => $night->id])->assertSessionHasNoErrors();
    expect($this->maria->fresh()->break_start)->toBe('02:00:00');
    ($this->save)($this->maria, ['break_start' => null])->assertSessionHasNoErrors();
    expect($this->maria->fresh()->break_start)->toBeNull();
});

test('co-workers may share a break time, and the directory lists who is on break when', function () {
    // The same hour as Jose: allowed.
    ($this->save)($this->maria, ['break_start' => '12:00'])->assertSessionHasNoErrors();
    $this->maria->update(['break_start' => '11:00:00']);
    Employee::create(['entity_id' => $this->clinic->id, 'employee_code' => '003', 'firstname' => 'Gone', 'lastname' => 'Santos',
        'employment_status' => 'separated', 'is_active' => false, 'pay_type' => 'daily', 'basic_pay' => 475, 'break_start' => '12:00:00']);

    ($this->as)($this->hr)->get('/libraries/employees')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('breakSlots', 2)
            ->where('breakSlots.0', ['id' => $this->maria->id, 'entity_id' => $this->clinic->id, 'name' => 'Maria Santos', 'break_start' => '11:00:00', 'break_end' => '12:00:00'])
            ->where('breakSlots.1.name', 'Jose Santos')
            ->where('policy.defaultShift', ['name' => 'Regular Day Shift (9:00 AM - 6:00 PM)', 'start' => '09:00:00', 'end' => '18:00:00', 'break_minutes' => 60])
            ->where('policy.presetBreakMinutes', 60));
});

test('the day\'s schedule carries the preset break only when it fits that day\'s shift', function () {
    $calculator = app(AttendanceCalculator::class);

    expect($calculator->scheduleFor($this->jose, '2026-10-14')->toArray())
        ->toMatchArray(['break_start' => '12:00:00', 'break_end' => '13:00:00', 'break_minutes' => 60]);
    expect($calculator->scheduleFor($this->maria, '2026-10-14')->breakStart)->toBeNull();
    expect($calculator->scheduleFor($this->jose, '2026-10-18')->breakStart)->toBeNull(); // Sunday, his rest day

    // The preset break is exactly an hour, whatever break the shift deducts.
    $short = ShiftTemplate::create(['entity_id' => $this->clinic->id, 'code' => 'SHORT', 'name' => 'Short break', 'start_time' => '08:00:00', 'end_time' => '17:00:00', 'break_minutes' => 30, 'grace_minutes' => 5, 'is_active' => true]);
    $this->maria->update(['default_shift_template_id' => $short->id, 'break_start' => '11:30:00']);
    expect($calculator->scheduleFor($this->maria, '2026-10-14')->toArray())->toMatchArray(['break_start' => '11:30:00', 'break_end' => '12:30:00']);

    // A rostered afternoon shift the preset does not fit: no preset break that day.
    ShiftRoster::create(['entity_id' => $this->clinic->id, 'employee_id' => $this->jose->id, 'roster_date' => '2026-10-15',
        'shift_name' => 'Afternoon', 'shift_start' => '13:00:00', 'shift_end' => '22:00:00', 'break_minutes' => 60, 'grace_minutes' => 5,
        'is_rest_day' => false, 'status' => ShiftRoster::STATUS_PUBLISHED]);
    expect($calculator->scheduleFor($this->jose, '2026-10-15')->breakStart)->toBeNull();

    // The employee's clock and roster show it.
    $staff = User::factory()->create();
    $staff->assignRole(Role::findOrCreate('Employee', 'web')->syncPermissions(['attendance.view', 'attendance.punch']));
    $staff->entities()->attach($this->clinic->id, ['is_default' => true]);
    $this->jose->update(['user_id' => $staff->id]);
    ($this->as)($staff)->get('/employee-management/attendance?view=clock')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('myDay.schedule.break_start', '12:00:00')->where('myDay.schedule.break_end', '13:00:00'));
});

test('a break taken away from the preset time is flagged, never refused', function () {
    $staff = User::factory()->create();
    $staff->assignRole(Role::findOrCreate('Employee', 'web')->syncPermissions(['attendance.view', 'attendance.punch']));
    $staff->entities()->attach($this->clinic->id, ['is_default' => true]);
    $this->jose->update(['user_id' => $staff->id]);
    $punch = fn (string $type) => ($this->as)($staff)->post('/employee-management/attendance/punch', ['employee_id' => $this->jose->id, 'punch_type' => $type]);

    $punch('check_in')->assertSessionHasNoErrors();
    Carbon::setTestNow('2026-10-14 10:30:00');
    $punch('break_out')->assertSessionHasNoErrors()
        ->assertSessionHas('status', "Break started at 10:30 AM. Your scheduled break is 12:00 PM – 1:00 PM, so let your team know you're stepping out.");
    expect(DtrEntry::where('employee_id', $this->jose->id)->value('break_out'))->toBe('10:30:00');

    $row = fn () => collect(app(EntityContext::class)->runAs($this->clinic, fn () => app(TeamBoard::class)->build($this->clinic->id))['rows'])
        ->firstWhere('employee.id', $this->jose->id);
    expect($row())->toMatchArray(['status' => 'on_break', 'break_off_schedule' => true])
        ->and($row()['schedule'])->toMatchArray(['break_start' => '12:00:00', 'break_end' => '13:00:00']);

    // Within the 15-minute tolerance it is on schedule.
    DtrEntry::where('employee_id', $this->jose->id)->update(['break_out' => '12:10:00']);
    expect($row()['break_off_schedule'])->toBeFalse();
});

test('break windows handle shifts that cross midnight', function () {
    expect(WorkSchedule::fitBreak('23:30', '22:00:00', '06:00:00', 60))->toBe(['23:30:00', '00:30:00'])
        ->and(WorkSchedule::fitBreak('05:30', '22:00:00', '06:00:00', 60))->toBeNull()
        ->and(WorkSchedule::fitBreak('21:00', '22:00:00', '06:00:00', 60))->toBeNull()
        ->and(WorkSchedule::fitBreak('12:00', '09:00:00', '18:00:00', 0))->toBeNull();

    $night = new WorkSchedule(null, 'Night', '22:00:00', '06:00:00', 60, 5, false, 'template', '23:50:00', '00:50:00');
    expect($night->isOffBreakSchedule('00:02:00'))->toBeFalse()
        ->and($night->isOffBreakSchedule('00:20:00'))->toBeTrue();
});
