<?php

use App\Enums\RoleEnum;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\ShiftRoster;
use App\Models\ShiftTemplate;
use App\Models\User;
use App\Services\People\AttendanceCalculator;
use App\Support\EntityContext;
use Carbon\Carbon;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/*
 * Libraries › Shifts: each company's shift library. Shifts are added and edited there and offered when rostering a day;
 * the company default is the shift every employee works unless the roster sets another.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00'); // a Wednesday
    config(['attendance.geofence_enabled' => false]);

    $this->clinic = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    app(EntityContext::class)->clear();
    // As the migration does for every company.
    $this->regular = ShiftTemplate::ensureDefault($this->clinic->id);

    $permissions = ['libraries.shifts.manage', 'libraries.employees.manage', 'roster.view', 'roster.manage'];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->hr = User::factory()->create();
    $this->hr->assignRole(Role::findOrCreate('Timekeeper', 'web')->syncPermissions($permissions));
    $this->hr->entities()->attach($this->clinic->id, ['is_default' => true]);

    $make = fn (string $code, string $first, array $extra = []) => Employee::create([
        'entity_id' => $this->clinic->id, 'employee_code' => $code, 'firstname' => $first, 'lastname' => 'Santos',
        'employment_status' => 'active', 'employment_type' => 'regular', 'is_active' => true, 'pay_type' => 'daily', 'basic_pay' => 475,
        'rest_days' => [0], ...$extra,
    ]);
    $this->maria = $make('001', 'Maria');
    $this->jose = $make('002', 'Jose', ['break_start' => '17:00:00']);

    $this->as = fn (?User $user = null) => $this->actingAs($user ?? $this->hr)->withSession(['current_entity_id' => $this->clinic->id]);
    $this->shift = fn (array $changes = []) => [
        'code' => 'MID-1019', 'name' => 'Mid Shift', 'start_time' => '10:00', 'end_time' => '19:00',
        'break_minutes' => 60, 'grace_minutes' => 10, 'color' => '#10b981', 'is_active' => true, 'is_default' => false, ...$changes,
    ];
    // The form sends every field; $changes override the shift's current values.
    $this->edit = fn (ShiftTemplate $s, array $changes) => ($this->as)()->put("/libraries/shifts/{$s->id}", [
        ...collect($s->fresh()->only(['code', 'name', 'start_time', 'end_time', 'break_minutes', 'grace_minutes', 'color', 'is_active', 'is_default']))->all(),
        ...$changes,
    ]);
});

afterEach(fn () => Carbon::setTestNow());

test('each company starts with its default shift, which the library lists and the roster offers', function () {
    expect($this->regular->only(['code', 'name', 'start_time', 'end_time', 'break_minutes', 'grace_minutes', 'is_default']))->toBe([
        'code' => 'REG', 'name' => 'Regular Day Shift', 'start_time' => '09:00:00', 'end_time' => '18:00:00', 'break_minutes' => 60, 'grace_minutes' => 0, 'is_default' => true,
    ])->and(ShiftTemplate::ensureDefault($this->clinic->id)->id)->toBe($this->regular->id);

    ($this->as)()->get('/libraries/shifts')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('libraries/shifts/page')
            ->has('shifts', 1)
            ->where('shifts.0.code', 'REG')
            ->where('shifts.0.net_hours', 8)
            ->where('defaultShift.id', $this->regular->id)
            ->where('followersCount', 2));

    ($this->as)()->get('/employee-management/roster?week_start=2026-10-12')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('shiftTemplates', 1)
            ->where('defaultShift.id', $this->regular->id)
            ->where('canManageShifts', true)
            ->where('rosterMatrix.0.shifts.2026-10-14.shift_name', 'Regular Day Shift'));
});

test('shifts are added and edited, with their hours checked, and offered when rostering', function () {
    ($this->as)()->post('/libraries/shifts', ($this->shift)(['code' => 'mid-1019']))->assertSessionHasNoErrors();
    $mid = ShiftTemplate::query()->where('code', 'MID-1019')->sole();
    expect($mid->only(['name', 'start_time', 'end_time', 'grace_minutes', 'is_default']))
        ->toBe(['name' => 'Mid Shift', 'start_time' => '10:00:00', 'end_time' => '19:00:00', 'grace_minutes' => 10, 'is_default' => false]);

    ($this->as)()->post('/libraries/shifts', ($this->shift)(['code' => 'Mid-1019']))->assertSessionHasErrors(['code' => 'Another shift of this company already uses this code.']);
    ($this->as)()->post('/libraries/shifts', ($this->shift)(['code' => 'X', 'end_time' => '10:00']))->assertSessionHasErrors(['end_time' => 'The shift must end at a different time than it starts.']);
    ($this->as)()->post('/libraries/shifts', ($this->shift)(['code' => 'X', 'start_time' => '08:00', 'end_time' => '09:00']))->assertSessionHasErrors(['break_minutes' => 'The unpaid break must be shorter than the shift.']);
    ($this->as)()->post('/libraries/shifts', ($this->shift)(['code' => 'X Y']))->assertSessionHasErrors('code');
    ($this->as)()->post('/libraries/shifts', ($this->shift)(['code' => 'X', 'color' => 'red']))->assertSessionHasErrors('color');

    // An overnight shift runs past midnight.
    ($this->as)()->post('/libraries/shifts', ($this->shift)(['code' => 'NIGHT', 'name' => 'Night Shift', 'start_time' => '22:00', 'end_time' => '06:00']))->assertSessionHasNoErrors();
    expect(ShiftTemplate::query()->where('code', 'NIGHT')->sole()->net_hours)->toBe(7.0);

    ($this->edit)($mid, ['name' => 'Mid / Clinic Shift', 'start_time' => '11:00', 'end_time' => '20:00'])->assertSessionHasNoErrors();
    expect($mid->fresh()->only(['name', 'start_time', 'end_time']))->toBe(['name' => 'Mid / Clinic Shift', 'start_time' => '11:00:00', 'end_time' => '20:00:00']);

    // Rostering a day with it takes its hours, break and grace period.
    ($this->as)()->post('/employee-management/roster', [
        'employee_id' => $this->maria->id, 'roster_date' => '2026-10-16', 'shift_template_id' => $mid->id,
    ])->assertSessionHasNoErrors();
    expect(ShiftRoster::query()->where('employee_id', $this->maria->id)->sole()->only(['shift_template_id', 'shift_name', 'shift_start', 'shift_end', 'grace_minutes']))
        ->toBe(['shift_template_id' => $mid->id, 'shift_name' => 'Mid / Clinic Shift', 'shift_start' => '11:00:00', 'shift_end' => '20:00:00', 'grace_minutes' => 10]);
    ($this->as)()->get('/libraries/shifts')->assertInertia(fn (Assert $page) => $page->where('shifts', fn ($shifts) => collect($shifts)->firstWhere('code', 'MID-1019')['rosters_count'] === 1));
});

test('editing the default shift changes everyone\'s hours and recalculates open time records', function () {
    $record = function (string $date, string $status) {
        $dtr = new DtrEntry(['entity_id' => $this->clinic->id, 'employee_id' => $this->maria->id, 'work_date' => $date, 'time_in' => '08:00:00', 'time_out' => '17:00:00', 'status' => $status]);
        app(AttendanceCalculator::class)->compute($dtr, $this->maria)->save();

        return $dtr;
    };
    // Worked 8:00 AM - 5:00 PM against the 9:00 AM - 6:00 PM default: an hour short.
    $open = $record('2026-10-13', DtrEntry::STATUS_OPEN);
    $locked = $record('2026-10-12', DtrEntry::STATUS_LOCKED);
    expect((float) $open->undertime_minutes)->toBe(60.0);

    ($this->edit)($this->regular, ['start_time' => '08:00', 'end_time' => '17:00'])
        ->assertSessionHasNoErrors()
        ->assertSessionHas('status', 'Shift Regular Day Shift saved. 1 open time record recalculated. The preset break of 1 employee no longer fits these hours; update it in the Employee Directory.');

    expect(app(AttendanceCalculator::class)->scheduleFor($this->maria->fresh(), '2026-10-15')->toArray())
        ->toMatchArray(['start' => '08:00:00', 'end' => '17:00:00', 'source' => 'default'])
        ->and((float) $open->fresh()->undertime_minutes)->toBe(0.0)
        ->and((float) $locked->fresh()->undertime_minutes)->toBe(60.0);

    // Renaming alone recalculates nothing.
    ($this->edit)($this->regular, ['name' => 'Clinic Hours'])->assertSessionHas('status', 'Shift Clinic Hours saved.');
});

test('another shift can become the default; the default cannot be unset, deactivated or deleted', function () {
    ($this->as)()->post('/libraries/shifts', ($this->shift)())->assertSessionHasNoErrors();
    $mid = ShiftTemplate::query()->where('code', 'MID-1019')->sole();

    ($this->edit)($this->regular, ['is_default' => false])->assertSessionHasErrors(['is_default' => 'Make another shift the company default instead.']);
    ($this->edit)($this->regular, ['is_active' => false])->assertSessionHasErrors(['is_active' => 'The company default shift must stay active.']);
    ($this->as)()->delete("/libraries/shifts/{$this->regular->id}")->assertSessionHasErrors('shift');

    ($this->edit)($mid, ['is_default' => true])->assertSessionHasNoErrors();
    expect($this->regular->fresh()->is_default)->toBeFalse()
        ->and(ShiftTemplate::defaultShift($this->clinic->id)['id'])->toBe($mid->id)
        ->and(app(AttendanceCalculator::class)->scheduleFor($this->maria, '2026-10-15')->start)->toBe('10:00:00');

    // The former default is an ordinary shift now: deactivated, it is no longer offered; unused, it can be deleted.
    ($this->edit)($this->regular, ['is_active' => false])->assertSessionHasNoErrors();
    ($this->as)()->get('/employee-management/roster?week_start=2026-10-12')
        ->assertInertia(fn (Assert $page) => $page->has('shiftTemplates', 1)->where('shiftTemplates.0.code', 'MID-1019'));
    ($this->as)()->delete("/libraries/shifts/{$this->regular->id}")->assertSessionHasNoErrors();
    expect(ShiftTemplate::query()->find($this->regular->id))->toBeNull();

    // A shift someone works as their own can be neither deactivated nor deleted.
    ($this->as)()->post('/libraries/shifts', ($this->shift)(['code' => 'EARLY', 'start_time' => '07:00', 'end_time' => '16:00']))->assertSessionHasNoErrors();
    $early = ShiftTemplate::query()->where('code', 'EARLY')->sole();
    $this->jose->update(['default_shift_template_id' => $early->id]);
    ($this->edit)($early, ['is_active' => false])->assertSessionHasErrors(['is_active' => '1 employee work this shift. Give them another shift first.']);
    ($this->as)()->delete("/libraries/shifts/{$early->id}")->assertSessionHasErrors('shift');
});

test('the library is the current company\'s, for whoever manages shifts or rosters', function () {
    $other = Entity::create(['code' => 'AL_JAMORA', 'name' => 'AL Jamora Optical', 'is_active' => true]);
    $theirs = ShiftTemplate::ensureDefault($other->id);
    ($this->edit)($theirs, ['name' => 'Mine now'])->assertNotFound();

    $staff = User::factory()->create();
    $staff->givePermissionTo('roster.view');
    $staff->entities()->attach($this->clinic->id, ['is_default' => true]);
    ($this->as)($staff)->get('/libraries/shifts')->assertForbidden();

    expect(RoleEnum::Accountant->defaultPermissions())->toContain('libraries.shifts.manage')
        ->and(RoleEnum::AccountingRetainer->defaultPermissions())->not->toContain('libraries.shifts.manage');
});
