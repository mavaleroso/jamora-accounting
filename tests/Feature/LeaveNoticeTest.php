<?php

use App\Enums\RoleEnum;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use Carbon\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

/*
 * Leave that can be planned must be filed a number of days before it starts: 5 by default, for Vacation, Service
 * Incentive and Leave Without Pay. The owner changes the notice and the leave types it covers in Admin › System
 * Settings. Leave left out (sick, emergency, …) keeps only the notice set on its own leave type.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00'); // a Wednesday

    $this->entity = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    $make = function (RoleEnum $role) {
        $user = User::factory()->create();
        $user->assignRole($role->value);
        $user->entities()->attach($this->entity->id, ['is_default' => true]);

        return $user;
    };
    $this->owner = $make(RoleEnum::Admin);
    $this->accountant = $make(RoleEnum::Accountant);
    $this->staff = $make(RoleEnum::Employee);
    Employee::create([
        'entity_id' => $this->entity->id, 'user_id' => $this->staff->id, 'employee_code' => 'STF-1', 'firstname' => 'Sam', 'lastname' => 'Santos',
        'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 30000, 'rest_days' => ['sun'],
    ]);

    $type = fn (string $code, string $name, int $order) => LeaveType::create([
        'code' => $code, 'name' => $name, 'is_paid' => true, 'balance_tracked' => false, 'is_active' => true, 'sort_order' => $order,
    ]);
    $this->vl = $type('VL', 'Vacation Leave', 1);
    $this->sl = $type('SL', 'Sick Leave', 2);
    $this->sil = $type('SIL', 'Service Incentive Leave', 3);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
    $this->file = fn (LeaveType $type, string $start) => ($this->as)($this->staff)->post('/employee-management/requests', [
        'kind' => 'leave', 'leave_type_id' => $type->id, 'start_date' => $start, 'end_date' => $start, 'reason' => 'Personal errand',
    ]);
    $this->notices = fn () => collect(($this->as)($this->staff)->get('/employee-management/requests')->viewData('page')['props']['leaveTypes'])
        ->pluck('min_notice_days', 'code')->all();
});

afterEach(fn () => Carbon::setTestNow());

test('planned leave must be filed at least a week ahead by default, while sick leave can start today', function () {
    ($this->file)($this->vl, '2026-10-16')->assertSessionHasErrors([
        'start_date' => 'Vacation Leave must be filed at least 7 days before it starts: the earliest start date today is Oct 21, 2026.',
    ]);
    ($this->file)($this->sil, '2026-10-16')->assertSessionHasErrors('start_date');

    ($this->file)($this->vl, '2026-10-21')->assertSessionHasNoErrors();
    ($this->file)($this->sl, '2026-10-14')->assertSessionHasNoErrors();
    expect(LeaveRequest::query()->withoutGlobalScopes()->count())->toBe(2);

    // The filing form is told the notice in force for each leave type.
    expect(($this->notices)())->toEqual(['VL' => 7, 'SL' => 0, 'SIL' => 7]);
});

test('a longer notice set on the leave type itself still applies', function () {
    $this->vl->update(['min_notice_days' => 10]);

    ($this->file)($this->vl, '2026-10-21')->assertSessionHasErrors([
        'start_date' => 'Vacation Leave must be filed at least 10 days before it starts: the earliest start date today is Oct 24, 2026.',
    ]);
    ($this->file)($this->vl, '2026-10-24')->assertSessionHasNoErrors();
    expect(($this->notices)()['VL'])->toBe(10);
});

test('planned leave of more than 7 days in a row must be filed 4 weeks ahead', function () {
    $file = fn (LeaveType $type, string $start, string $end) => ($this->as)($this->staff)->post('/employee-management/requests', [
        'kind' => 'leave', 'leave_type_id' => $type->id, 'start_date' => $start, 'end_date' => $end, 'reason' => 'Family trip',
    ]);

    // Oct 21–30 is 10 days in a row: a week's notice is not enough.
    $file($this->vl, '2026-10-21', '2026-10-30')->assertSessionHasErrors([
        'start_date' => 'Vacation Leave must be filed at least 28 days before it starts (filings of more than 7 consecutive days): the earliest start date today is Nov 11, 2026.',
    ]);
    // Exactly 7 days needs only the usual week; sick leave is not covered at all.
    $file($this->vl, '2026-10-21', '2026-10-27')->assertSessionHasNoErrors();
    $file($this->sl, '2026-10-28', '2026-11-06')->assertSessionHasNoErrors();
    $file($this->sil, '2026-11-11', '2026-11-20')->assertSessionHasNoErrors();

    $longNotice = collect(($this->as)($this->staff)->get('/employee-management/requests')->viewData('page')['props']['leaveTypes'])->pluck('long_notice', 'code');
    expect($longNotice['VL'])->toBe(['days' => 7, 'notice' => 28])
        ->and($longNotice['SL'])->toBeNull();
});

test('the owner changes the notice and the leave types it covers in System Settings', function () {
    ($this->as)($this->owner)->get('/admin/system-settings')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('leave.min_notice_days', 7)
            ->where('leave.long_leave_days', 7)
            ->where('leave.long_leave_notice_days', 28)
            ->where('leave.leave_types', ['VL', 'SIL', 'LWOP'])
            ->where('leave.types.0', ['code' => 'VL', 'name' => 'Vacation Leave', 'own_notice_days' => 0])
            ->where('today', '2026-10-14')
            ->where('lastChange.leave', null));

    // Two days' notice, for sick leave only.
    $save = fn (array $data) => ($this->as)($this->owner)->put('/admin/system-settings/leave', $data);
    $save(['min_notice_days' => 2, 'leave_types' => ['SL']])
        ->assertSessionHasNoErrors()
        ->assertSessionHas('status', 'Leave settings saved. They apply to leave filed from now on; requests already filed are not affected.');

    expect(($this->notices)())->toEqual(['VL' => 0, 'SL' => 2, 'SIL' => 0]);
    ($this->file)($this->sl, '2026-10-15')->assertSessionHasErrors('start_date');
    ($this->file)($this->vl, '2026-10-15')->assertSessionHasNoErrors();

    $save(['min_notice_days' => 2, 'leave_types' => ['SL']])->assertSessionHas('status', 'Leave settings saved. Nothing changed.');
    ($this->as)($this->owner)->get('/admin/system-settings')
        ->assertInertia(fn (Assert $page) => $page->where('leave.leave_types', ['SL'])->where('lastChange.leave.by', $this->owner->name));

    // Covering no leave type at all is allowed; unknown types and very long notices are not.
    $save(['min_notice_days' => 5, 'leave_types' => []])->assertSessionHasNoErrors();
    expect(($this->notices)())->toEqual(['VL' => 0, 'SL' => 0, 'SIL' => 0]);
    $save(['min_notice_days' => 5, 'leave_types' => ['XX']])->assertSessionHasErrors('leave_types.0');
    $save(['min_notice_days' => 91, 'leave_types' => ['VL']])->assertSessionHasErrors(['min_notice_days' => 'The notice cannot be longer than 90 days.']);

    // Owner only.
    ($this->as)($this->accountant)->put('/admin/system-settings/leave', ['min_notice_days' => 0, 'leave_types' => []])->assertForbidden();
});
