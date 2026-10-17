<?php

use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->entity = Entity::create(['code' => 'CON', 'name' => 'Contribution Clinic', 'is_active' => true]);
    Permission::findOrCreate('libraries.employees.manage', 'web');
    Role::findOrCreate('Employee', 'web');

    $this->hr = User::factory()->create();
    $this->hr->assignRole(Role::findOrCreate('Accountant', 'web')->syncPermissions(['libraries.employees.manage']));
    $this->hr->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->as = fn () => $this->actingAs($this->hr)->withSession(['current_entity_id' => $this->entity->id]);
    $this->payload = fn (array $contributions) => [
        'employee_code' => 'E-200', 'firstname' => 'Ana', 'lastname' => 'Cruz', 'employment_status' => 'active', 'employment_type' => 'regular',
        'pay_type' => 'monthly', 'basic_pay' => 25000, 'account' => 'new', 'username' => 'ana.cruz', 'password' => 'Secret-pass-123',
        'contribution_settings' => $contributions,
    ];
});

test('only contributions not deducted are saved; everything else is automatic', function () {
    ($this->as)()->post('/libraries/employees', ($this->payload)([
        'sss' => ['mode' => 'auto'],
        'philhealth' => ['mode' => 'none'],
        'pagibig' => ['mode' => 'auto'],
    ]))->assertSessionHasNoErrors();

    $employee = Employee::where('employee_code', 'E-200')->firstOrFail();
    expect($employee->contribution_settings)->toBe(['philhealth' => ['mode' => 'none']])
        ->and($employee->contributionMode('sss'))->toBe('auto')
        ->and($employee->contributionMode('philhealth'))->toBe('none');

    // Back to all automatic: stored as nothing.
    ($this->as)()->put("/libraries/employees/{$employee->id}", [
        ...($this->payload)(collect(['sss', 'philhealth', 'pagibig'])->mapWithKeys(fn ($a) => [$a => ['mode' => 'auto']])->all()),
    ])->assertSessionHasNoErrors();
    expect($employee->fresh()->contribution_settings)->toBeNull();
});

test('a fixed amount is no longer accepted', function () {
    ($this->as)()->post('/libraries/employees', ($this->payload)(['sss' => ['mode' => 'fixed', 'employee' => '750']]))
        ->assertSessionHasErrors('contribution_settings.sss.mode');

    expect(Employee::count())->toBe(0);
});

test('the directory sends the contribution tables for the form estimate', function () {
    ($this->as)()->get('/libraries/employees')->assertInertia(fn (Assert $page) => $page
        ->where('policy.statutory.sss.rate_employee', 0.05)
        ->where('policy.statutory.pagibig.max_fund_salary', 10000));
});
