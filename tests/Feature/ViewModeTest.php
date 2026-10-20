<?php

use App\Enums\RoleEnum;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use App\Support\EntityContext;
use App\Support\ViewMode;
use Carbon\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

/*
 * An Admin who is also an employee switches between the admin view and the employee view in the header. The employee
 * view is the employee's own side of the system (portal, attendance, requests, schedule), in their own company.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00');
    config(['attendance.geofence_enabled' => false]);

    $this->jam = Entity::create(['code' => 'JAM_OPTICUS', 'name' => 'JAM Opticus', 'is_active' => true]);
    $this->aj = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    app(EntityContext::class)->clear();

    $make = function (RoleEnum $role, ?Entity $employer) {
        $user = User::factory()->create();
        $user->assignRole($role->value);
        $user->entities()->attach($this->jam->id, ['is_default' => true]);
        if ($employer) {
            Employee::create(['entity_id' => $employer->id, 'user_id' => $user->id, 'employee_code' => 'E-'.$user->id, 'firstname' => 'Staff', 'lastname' => (string) $user->id,
                'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 30000, 'rest_days' => ['sun'], 'is_active' => true]);
        }

        return $user;
    };
    // The owner works for A. Jamora Optical but opens JAM Opticus by default.
    $this->owner = $make(RoleEnum::Admin, $this->aj);
    $this->otherAdmin = $make(RoleEnum::Admin, null);
    $this->accountant = $make(RoleEnum::Accountant, $this->jam);

    $this->as = fn (User $user, ?Entity $company = null) => $this->actingAs($user)->withSession(['current_entity_id' => ($company ?? $this->jam)->id]);
});

afterEach(fn () => Carbon::setTestNow());

test('an admin who is also an employee switches to the employee view and back', function () {
    ($this->as)($this->owner, $this->aj)->get('/employee-management/requests')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('auth.viewMode', 'admin')->where('perspective.canReview', true));

    // To the employee view: their portal, in their own company.
    ($this->as)($this->owner)->post('/view-mode', ['mode' => 'employee'])
        ->assertRedirect(route('employee-management.portal.index'))
        ->assertSessionHas(ViewMode::SESSION_KEY, 'employee')
        ->assertSessionHas('current_entity_id', $this->aj->id);

    $employeeView = fn () => $this->actingAs($this->owner)->withSession(['current_entity_id' => $this->aj->id, ViewMode::SESSION_KEY => 'employee']);
    $employeeView()->get('/employee-management/requests')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('auth.viewMode', 'employee')
            ->where('perspective.hasSelf', true)
            ->where('perspective.canReview', false)
            ->where('perspective.canViewTeam', false));
    $employeeView()->get('/employee-management/attendance')->assertOk()->assertInertia(fn (Assert $page) => $page->where('perspective.canManage', false));
    $employeeView()->get('/employee-management/roster')->assertOk()->assertInertia(fn (Assert $page) => $page->component('employee-management/roster/my-schedule'));
    $employeeView()->get('/')->assertRedirect(route('employee-management.portal.index'));

    // And back: the admin view, with the team's side of each page.
    $employeeView()->post('/view-mode', ['mode' => 'admin'])->assertRedirect(route('overview'))->assertSessionHas(ViewMode::SESSION_KEY, 'admin');
    ($this->as)($this->owner, $this->aj)->withSession([ViewMode::SESSION_KEY => 'admin'])->get('/employee-management/roster')
        ->assertInertia(fn (Assert $page) => $page->component('employee-management/roster/page'));
});

test('only an admin with an employee record can switch', function () {
    ($this->as)($this->otherAdmin)->get('/employee-management/requests')->assertInertia(fn (Assert $page) => $page->where('auth.viewMode', null));
    ($this->as)($this->otherAdmin)->post('/view-mode', ['mode' => 'employee'])->assertForbidden();

    // Other roles keep their one view; an employee view left in the session counts for nothing.
    ($this->as)($this->accountant)->withSession([ViewMode::SESSION_KEY => 'employee'])->get('/employee-management/requests')
        ->assertInertia(fn (Assert $page) => $page->where('auth.viewMode', null)->where('perspective.canViewTeam', true));
    ($this->as)($this->accountant)->post('/view-mode', ['mode' => 'employee'])->assertForbidden();

    ($this->as)($this->owner)->post('/view-mode', ['mode' => 'auditor'])->assertSessionHasErrors('mode');
});
