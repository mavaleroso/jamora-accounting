<?php

use App\Enums\RoleEnum;
use App\Models\AttendanceRequest;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\User;
use Carbon\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

/*
 * Employees' requests (leave, overtime, time corrections, official business) are decided by the owner: approving or
 * declining them (requests.approve) and handling them for employees (requests.manage) are Admin-only. The Accountant
 * runs time records and payroll and sees everyone's requests, read only.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00'); // a Wednesday
    config(['attendance.geofence_enabled' => false, 'people.leave.min_notice_days' => 0]);

    $this->entity = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    $make = function (RoleEnum $role, string $code) {
        $user = User::factory()->create();
        $user->assignRole($role->value);
        $user->entities()->attach($this->entity->id, ['is_default' => true]);
        $employee = Employee::create(['entity_id' => $this->entity->id, 'user_id' => $user->id, 'employee_code' => $code, 'firstname' => $code, 'lastname' => 'Test',
            'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 30000, 'rest_days' => ['sun'], 'is_active' => true]);

        return [$user, $employee];
    };
    [$this->owner] = $make(RoleEnum::Admin, 'OWN');
    [$this->accountant, $this->accountantEmployee] = $make(RoleEnum::Accountant, 'ACC');
    [$this->staff, $this->staffEmployee] = $make(RoleEnum::Employee, 'STF');
    $this->vl = LeaveType::create(['code' => 'VL', 'name' => 'Vacation Leave', 'is_paid' => true, 'balance_tracked' => false, 'is_active' => true, 'sort_order' => 1]);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
    $this->fileLeave = fn (User $user, array $extra = []) => ($this->as)($user)->post('/employee-management/requests', [
        'kind' => 'leave', 'leave_type_id' => $this->vl->id, 'start_date' => '2026-10-16', 'end_date' => '2026-10-16', 'reason' => 'Personal errand', ...$extra,
    ]);
    $this->fileOvertime = fn (User $user, array $extra = []) => ($this->as)($user)->post('/employee-management/requests', [
        'kind' => 'overtime', 'work_date' => '2026-10-14', 'reason' => 'Month-end inventory', ...$extra,
    ]);
});

afterEach(fn () => Carbon::setTestNow());

test('only the owner holds the permissions to decide on and handle employees\' requests', function () {
    expect($this->owner->can('requests.approve'))->toBeTrue()
        ->and($this->owner->can('requests.manage'))->toBeTrue()
        ->and($this->accountant->can('requests.approve'))->toBeFalse()
        ->and($this->accountant->can('requests.manage'))->toBeFalse()
        // The Accountant still runs time records and payroll.
        ->and($this->accountant->can('attendance.manage'))->toBeTrue()
        ->and($this->accountant->can('payroll.manage'))->toBeTrue();
});

test('the accountant sees everyone\'s requests but cannot decide on them or handle them for employees', function () {
    ($this->fileLeave)($this->staff)->assertSessionHasNoErrors();
    ($this->fileOvertime)($this->staff)->assertSessionHasNoErrors();
    $leave = LeaveRequest::query()->withoutGlobalScopes()->where('employee_id', $this->staffEmployee->id)->sole();
    $overtime = AttendanceRequest::query()->withoutGlobalScopes()->where('employee_id', $this->staffEmployee->id)->sole();

    ($this->as)($this->accountant)->get('/employee-management/requests')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('perspective.canReview', false)
            ->where('perspective.canViewTeam', true)
            ->where('perspective.canFileOnBehalf', false)
            ->where('views', fn ($views) => ! collect($views)->contains('inbox')));
    ($this->as)($this->accountant)->get('/employee-management/attendance')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('perspective.canReviewRequests', false)->where('perspective.canHandleRequests', false));

    // No deciding, in either module.
    ($this->as)($this->accountant)->post("/employee-management/requests/leave/{$leave->id}/review", ['decision' => 'approved'])->assertForbidden();
    ($this->as)($this->accountant)->post("/employee-management/requests/attendance/{$overtime->id}/review", ['decision' => 'approved'])->assertForbidden();
    ($this->as)($this->accountant)->post("/employee-management/attendance/requests/{$overtime->id}/review", ['status' => 'approved'])->assertForbidden();

    // No cancelling, filing for or opening the documents of another employee.
    ($this->as)($this->accountant)->post("/employee-management/requests/leave/{$leave->id}/cancel")->assertForbidden();
    ($this->as)($this->accountant)->post("/employee-management/requests/attendance/{$overtime->id}/cancel")->assertForbidden();
    ($this->as)($this->accountant)->get("/employee-management/requests/leave/{$leave->id}/attachment")->assertForbidden();
    ($this->fileOvertime)($this->accountant, ['employee_id' => $this->staffEmployee->id, 'work_date' => '2026-10-15'])->assertSessionHasNoErrors();
    expect(AttendanceRequest::query()->withoutGlobalScopes()->where('employee_id', $this->staffEmployee->id)->count())->toBe(1); // filed as their own instead

    expect($leave->fresh()->status)->toBe('pending')->and($overtime->fresh()->status)->toBe('pending');
});

test('the owner decides employees\' requests, the accountant\'s own included, and handles them for employees', function () {
    ($this->fileLeave)($this->accountant)->assertSessionHasNoErrors();
    $own = LeaveRequest::query()->withoutGlobalScopes()->where('employee_id', $this->accountantEmployee->id)->sole();

    ($this->as)($this->owner)->get('/employee-management/requests')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('perspective.canReview', true)->where('perspective.canFileOnBehalf', true));
    ($this->as)($this->owner)->post("/employee-management/requests/leave/{$own->id}/review", ['decision' => 'approved'])->assertSessionHasNoErrors();
    expect($own->fresh()->status)->toBe(LeaveRequest::STATUS_APPROVED);

    // Filing for an employee, and approving it from Time & Attendance.
    ($this->fileOvertime)($this->owner, ['employee_id' => $this->staffEmployee->id])->assertSessionHasNoErrors();
    $overtime = AttendanceRequest::query()->withoutGlobalScopes()->where('employee_id', $this->staffEmployee->id)->sole();
    ($this->as)($this->owner)->post("/employee-management/attendance/requests/{$overtime->id}/review", ['status' => 'approved'])->assertSessionHasNoErrors();
    expect($overtime->fresh()->status)->toBe('approved');
});
