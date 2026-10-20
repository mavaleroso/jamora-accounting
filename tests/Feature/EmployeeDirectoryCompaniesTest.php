<?php

use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use App\Support\EntityContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

/*
 * The Employee Directory lists the employees of every company the user can open, each with its company.
 */
beforeEach(function () {
    $this->jam = Entity::create(['code' => 'JAM_OPTICUS', 'name' => 'JAM Opticus', 'is_active' => true]);
    $this->aj = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    $this->other = Entity::create(['code' => 'OTHER', 'name' => 'Not Mine Optical', 'is_active' => true]);
    app(EntityContext::class)->clear();

    Permission::findOrCreate('libraries.employees.manage', 'web');
    Role::findOrCreate('Employee', 'web');
    $this->hr = User::factory()->create();
    // An HR clerk; the Admin and the Accountant list every company (AdminCompanyAccessTest).
    $this->hr->assignRole(Role::findOrCreate('HR Clerk', 'web')->syncPermissions(['libraries.employees.manage']));
    $this->hr->entities()->attach($this->aj->id, ['is_default' => true]);
    $this->hr->entities()->attach($this->jam->id, ['is_default' => false]);

    $make = fn (Entity $entity, string $code, string $first) => Employee::create([
        'entity_id' => $entity->id, 'employee_code' => $code, 'firstname' => $first, 'lastname' => 'Test',
        'employment_status' => 'active', 'employment_type' => 'regular', 'is_active' => true, 'pay_type' => 'daily', 'basic_pay' => 475,
    ]);
    $this->juniza = $make($this->aj, '088', 'Juniza');
    $this->sheila = $make($this->jam, '014', 'Sheila');
    $this->stranger = $make($this->other, '900', 'Stranger');

    // The current branch is A. Jamora Optical.
    $this->as = fn () => $this->actingAs($this->hr)->withSession(['current_entity_id' => $this->aj->id]);
    $this->payload = fn (Employee $e, array $changes = []) => [
        'employee_code' => $e->employee_code, 'firstname' => $e->firstname, 'lastname' => $e->lastname,
        'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'daily', 'basic_pay' => 475, ...$changes,
    ];
});

test('the directory lists every company the user can open, with each employee\'s company', function () {
    ($this->as)()->get('/libraries/employees')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('employees', 2)
            ->where('stats.total', 2)
            ->where('companies.0.name', 'A. Jamora Optical')
            ->where('companies.1.name', 'JAM Opticus')
            ->where('currentCompanyId', $this->aj->id)
            ->where('employees.0.entity.name', 'JAM Opticus')     // sorted by code: 014, then 088
            ->where('employees.1.entity.name', 'A. Jamora Optical'));

    // Filtered to one company, and sorted by company.
    ($this->as)()->get("/libraries/employees?company={$this->jam->id}")
        ->assertInertia(fn (Assert $page) => $page->has('employees', 1)->where('employees.0.employee_code', '014')->where('filters.company', (string) $this->jam->id));
    ($this->as)()->get('/libraries/employees?sort=company')
        ->assertInertia(fn (Assert $page) => $page->where('employees.0.entity.name', 'A. Jamora Optical'));
});

test('an employee of another company opens, saves and is validated in their own company', function () {
    // The code 088 is taken in A. Jamora Optical but free in JAM Opticus.
    ($this->as)()->put("/libraries/employees/{$this->sheila->id}", ($this->payload)($this->sheila, ['employee_code' => '088', 'basic_pay' => 500]))
        ->assertSessionHasNoErrors();
    expect($this->sheila->fresh()->only(['employee_code', 'entity_id']))->toBe(['employee_code' => '088', 'entity_id' => $this->jam->id]);

    ($this->as)()->getJson("/libraries/employees/{$this->sheila->id}/overview")->assertOk()->assertJsonStructure(['leave', 'contributions']);

    // A company the user can't open stays closed.
    ($this->as)()->put("/libraries/employees/{$this->stranger->id}", ($this->payload)($this->stranger))->assertNotFound();
    ($this->as)()->getJson("/libraries/employees/{$this->stranger->id}/overview")->assertNotFound();
    ($this->as)()->delete("/libraries/employees/{$this->stranger->id}")->assertNotFound();
    expect($this->stranger->fresh())->not->toBeNull();
});

test('a new employee is added to the company picked, with the login\'s access', function () {
    ($this->as)()->post('/libraries/employees', [
        ...($this->payload)($this->juniza, ['employee_code' => '1109', 'firstname' => 'Jeffrey']),
        'entity_id' => $this->jam->id, 'account' => 'new', 'username' => 'jtanieo', 'password' => 'Secret-pass-123',
    ])->assertSessionHasNoErrors();

    $jeffrey = Employee::query()->withoutGlobalScopes()->where('employee_code', '1109')->sole();
    expect($jeffrey->entity_id)->toBe($this->jam->id)
        ->and($jeffrey->user->entities()->pluck('entities.id')->all())->toBe([$this->jam->id]);

    // No company picked: the current branch. A company the user can't open: refused.
    ($this->as)()->post('/libraries/employees', [...($this->payload)($this->juniza, ['employee_code' => '1110']), 'account' => 'new', 'username' => 'u1110', 'password' => 'Secret-pass-123'])
        ->assertSessionHasNoErrors();
    expect(Employee::query()->withoutGlobalScopes()->where('employee_code', '1110')->value('entity_id'))->toBe($this->aj->id);

    ($this->as)()->post('/libraries/employees', [...($this->payload)($this->juniza, ['employee_code' => '1111']), 'entity_id' => $this->other->id, 'account' => 'new', 'username' => 'u1111', 'password' => 'Secret-pass-123'])
        ->assertSessionHasErrors('entity_id');
});
