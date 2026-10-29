<?php

use App\Enums\RoleEnum;
use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\People\AttendanceCalculator;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

/*
 * Admin › System Settings: company-wide policy only the owner changes. Overtime starts after an unpaid break once
 * the shift ends and stops at an optional ceiling: on the 9:00 AM – 6:00 PM shift, a 1-hour break and a midnight
 * ceiling count overtime from 7:00 PM to 12:00 AM.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00'); // a Wednesday

    $this->entity = Entity::create(['code' => 'SET-BRANCH', 'name' => 'Settings Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP', 'geofence_enforced' => false]);

    $makeUser = function (RoleEnum $role) {
        $user = User::factory()->create();
        $user->assignRole($role->value);
        $user->entities()->attach($this->entity->id, ['is_default' => true]);

        return $user;
    };
    $this->owner = $makeUser(RoleEnum::Admin);
    $this->accountant = $makeUser(RoleEnum::Accountant);

    $this->staff = Employee::create([
        'entity_id' => $this->entity->id, 'employee_code' => 'STF-1', 'firstname' => 'Sam', 'lastname' => 'Test', 'position' => 'Staff',
        'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 30000, 'rest_days' => ['sun'],
    ]);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
    $this->saveSettings = fn (int $breakMinutes, ?string $ceiling) => ($this->as)($this->owner)
        ->put('/admin/system-settings', ['overtime_break_minutes' => $breakMinutes, 'overtime_ceiling' => $ceiling]);

    // A day worked 9:00 AM to $out with a 12:00–1:00 PM lunch break, on which overtime was approved.
    $this->workOvertime = function (string $date, string $out): DtrEntry {
        AttendanceRequest::create([
            'entity_id' => $this->entity->id, 'employee_id' => $this->staff->id, 'request_type' => AttendanceRequest::TYPE_OVERTIME,
            'work_date' => $date, 'reason' => 'Month-end inventory', 'status' => 'approved',
        ]);
        $dtr = new DtrEntry([
            'entity_id' => $this->entity->id, 'employee_id' => $this->staff->id, 'work_date' => $date,
            'time_in' => '09:00:00', 'break_out' => '12:00:00', 'break_in' => '13:00:00', 'time_out' => $out, 'status' => DtrEntry::STATUS_OPEN,
            'accomplishment' => '<p>Inventory count</p>',
        ]);
        app(AttendanceCalculator::class)->compute($dtr, $this->staff)->save();

        return $dtr;
    };
});

afterEach(fn () => Carbon::setTestNow());

test('only the owner can open and change system settings', function () {
    expect(Role::findByName(RoleEnum::Admin->value)->hasPermissionTo('admin.system-settings.manage'))->toBeTrue()
        ->and(Role::findByName(RoleEnum::Accountant->value)->hasPermissionTo('admin.system-settings.manage'))->toBeFalse()
        ->and(Role::findByName(RoleEnum::AccountingRetainer->value)->hasPermissionTo('admin.system-settings.manage'))->toBeFalse()
        ->and(Role::findByName(RoleEnum::Employee->value)->hasPermissionTo('admin.system-settings.manage'))->toBeFalse();

    // Nothing saved yet: the config defaults (no break, no ceiling) apply.
    ($this->as)($this->owner)->get('/admin/system-settings')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/system-settings/page')
            ->where('overtime.break_minutes', 0)
            ->where('overtime.ceiling', null)
            ->where('defaultShift.end', '18:00:00')
            ->where('lastChange.overtime', null));

    ($this->as)($this->accountant)->get('/admin/system-settings')->assertForbidden();
    ($this->as)($this->accountant)->put('/admin/system-settings', ['overtime_break_minutes' => 60, 'overtime_ceiling' => '00:00'])->assertForbidden();
    expect(SystemSetting::count())->toBe(0);

    ($this->saveSettings)(60, '00:00')->assertSessionHasNoErrors();
    $break = SystemSetting::findOrFail('overtime.break_minutes');
    expect($break->value)->toBe(60)
        ->and($break->updated_by)->toBe($this->owner->id)
        ->and(SystemSetting::findOrFail('overtime.ceiling')->value)->toBe('00:00');

    ($this->as)($this->owner)->get('/admin/system-settings')
        ->assertInertia(fn (Assert $page) => $page
            ->where('overtime.break_minutes', 60)
            ->where('overtime.ceiling', '00:00')
            ->where('lastChange.overtime.by', $this->owner->name));
});

test('overtime counts from the end of the break after the shift up to the ceiling', function () {
    ($this->saveSettings)(60, '00:00')->assertSessionHasNoErrors();

    // Shift ends 6:00 PM, 6:00–7:00 PM is the break: out at 11:00 PM is 4 hours of overtime, not 5.
    $evening = ($this->workOvertime)('2026-10-12', '23:00:00');
    expect((float) $evening->ot_hours)->toBe(4.0)
        ->and((float) $evening->ot_hours_approved)->toBe(4.0)
        ->and((float) $evening->regular_hours)->toBe(8.0)
        ->and((float) $evening->night_diff_hours)->toBe(1.0);

    // Out at 2:00 AM: overtime stops at midnight (7:00 PM – 12:00 AM), and so does night differential.
    $late = ($this->workOvertime)('2026-10-13', '02:00:00');
    expect((float) $late->ot_hours)->toBe(5.0)
        ->and((float) $late->ot_hours_approved)->toBe(5.0)
        ->and((float) $late->night_diff_hours)->toBe(2.0);

    // Leaving during the break renders no overtime.
    expect((float) ($this->workOvertime)('2026-10-14', '18:45:00')->ot_hours)->toBe(0.0);
});

test('without a ceiling overtime counts until clock-out, and with no break it starts when the shift ends', function () {
    ($this->saveSettings)(60, null)->assertSessionHasNoErrors();
    $late = ($this->workOvertime)('2026-10-12', '02:00:00');
    expect((float) $late->ot_hours)->toBe(7.0)
        ->and((float) $late->night_diff_hours)->toBe(4.0);

    ($this->saveSettings)(0, '22:00')->assertSessionHasNoErrors();
    $capped = ($this->workOvertime)('2026-10-13', '23:00:00');
    expect((float) $capped->ot_hours)->toBe(4.0)
        ->and((float) $capped->night_diff_hours)->toBe(0.0);
});

test('on a rest day the break follows the 8th hour worked', function () {
    ($this->saveSettings)(60, '00:00')->assertSessionHasNoErrors();

    // Sunday rest day, 9:00 AM – 9:00 PM with lunch: 8 regular hours end at 6:00 PM, overtime counts from 7:00 PM.
    $sunday = ($this->workOvertime)('2026-10-11', '21:00:00');
    expect($sunday->day_type)->toBe('rest_day')
        ->and((float) $sunday->regular_hours)->toBe(8.0)
        ->and((float) $sunday->ot_hours)->toBe(2.0);
});

test('saving recalculates time records payroll has not locked, and leaves locked ones alone', function () {
    // Under the defaults overtime starts at 6:00 PM: 5 hours to 11:00 PM.
    $open = ($this->workOvertime)('2026-10-12', '23:00:00');
    $locked = ($this->workOvertime)('2026-10-13', '23:00:00');
    $locked->update(['status' => DtrEntry::STATUS_LOCKED]);
    expect((float) $open->ot_hours_approved)->toBe(5.0);

    ($this->saveSettings)(60, '00:00')
        ->assertSessionHasNoErrors()
        ->assertSessionHas('status', 'Overtime settings saved. 1 open time record recalculated.');

    expect((float) $open->fresh()->ot_hours_approved)->toBe(4.0)
        ->and((float) $locked->fresh()->ot_hours_approved)->toBe(5.0);

    // Saving the same values again changes nothing.
    ($this->saveSettings)(60, '00:00')->assertSessionHas('status', 'Overtime settings saved. Nothing changed.');
});

test('the break and ceiling are validated', function () {
    ($this->saveSettings)(-5, null)->assertSessionHasErrors('overtime_break_minutes');
    ($this->saveSettings)(300, null)->assertSessionHasErrors(['overtime_break_minutes' => 'The break before overtime cannot be longer than 4 hours (240 minutes).']);
    ($this->as)($this->owner)->put('/admin/system-settings', ['overtime_ceiling' => '00:00'])->assertSessionHasErrors('overtime_break_minutes');
    ($this->saveSettings)(60, '25:00')->assertSessionHasErrors('overtime_ceiling');
    ($this->saveSettings)(60, 'midnight')->assertSessionHasErrors(['overtime_ceiling' => 'Enter the ceiling as a time of day, e.g. 12:00 AM.']);

    expect(SystemSetting::count())->toBe(0);
});

test('the overtime form tells staff when overtime counts', function () {
    ($this->saveSettings)(60, '00:00')->assertSessionHasNoErrors();

    ($this->as)($this->owner)->get('/employee-management/requests')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('overtimePolicy', ['break_minutes' => 60, 'ceiling' => '00:00']));
});
