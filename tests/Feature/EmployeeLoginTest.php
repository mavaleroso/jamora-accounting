<?php

use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->entity = Entity::create(['code' => 'EMP', 'name' => 'Employee Clinic', 'is_active' => true]);
    Permission::findOrCreate('libraries.employees.manage', 'web');
    Role::findOrCreate('Employee', 'web');

    $this->hr = User::factory()->create();
    $this->hr->assignRole(Role::findOrCreate('Accountant', 'web')->syncPermissions(['libraries.employees.manage']));
    $this->hr->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->as = fn () => $this->actingAs($this->hr)->withSession(['current_entity_id' => $this->entity->id]);
    $this->payload = fn (array $extra = []) => [
        'employee_code' => 'E-100', 'firstname' => 'Maria', 'lastname' => 'Santos', 'email' => 'maria@clinic.ph', 'phone' => '0917 000 0000',
        'position' => 'Optical Assistant', 'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'monthly', 'basic_pay' => 20000,
        ...$extra,
    ];
});

test('adding an employee creates their login with the Employee role and access to the branch', function () {
    ($this->as)()->post('/libraries/employees', ($this->payload)(['account' => 'new', 'username' => 'maria.santos', 'password' => 'Secret-pass-123']))
        ->assertSessionHasNoErrors();

    $employee = Employee::where('employee_code', 'E-100')->firstOrFail();
    $user = $employee->user;

    expect($user)->not->toBeNull()
        ->and($user->username)->toBe('maria.santos')
        ->and($user->email)->toBe('maria@clinic.ph')
        ->and($user->firstname)->toBe('Maria')
        ->and($user->contact_number)->toBe('0917 000 0000')
        ->and($user->status)->toBeTrue()
        ->and(Hash::check('Secret-pass-123', $user->password))->toBeTrue()
        ->and($user->getRoleNames()->all())->toBe(['Employee'])
        ->and($user->entities()->where('entities.id', $this->entity->id)->exists())->toBeTrue();

    // And they can sign in with it.
    auth()->logout();
    $this->post('/login', ['username' => 'maria.santos', 'password' => 'Secret-pass-123']);
    $this->assertAuthenticatedAs($user);
});

test('an employee cannot be added without a login', function () {
    ($this->as)()->post('/libraries/employees', ($this->payload)())->assertSessionHasErrors('account');
    ($this->as)()->post('/libraries/employees', ($this->payload)(['account' => 'new']))->assertSessionHasErrors(['username', 'password']);

    expect(Employee::count())->toBe(0)->and(User::where('username', 'maria.santos')->exists())->toBeFalse();
});

test('a taken username or an email that already has a login is rejected', function () {
    User::factory()->create(['username' => 'maria.santos']);
    ($this->as)()->post('/libraries/employees', ($this->payload)(['account' => 'new', 'username' => 'maria.santos', 'password' => 'Secret-pass-123']))
        ->assertSessionHasErrors('username');

    User::factory()->create(['email' => 'maria@clinic.ph']);
    ($this->as)()->post('/libraries/employees', ($this->payload)(['account' => 'new', 'username' => 'maria2', 'password' => 'Secret-pass-123']))
        ->assertSessionHasErrors('email');
});

test('an existing user can be linked instead, keeping their role', function () {
    $accountant = User::factory()->create(['email' => 'acct@clinic.ph']);
    $accountant->assignRole('Accountant');

    ($this->as)()->get('/libraries/employees')->assertInertia(fn (Assert $page) => $page
        ->where('linkableUsers', fn ($users) => collect($users)->pluck('id')->contains($accountant->id)));

    ($this->as)()->post('/libraries/employees', ($this->payload)(['email' => 'acct@clinic.ph', 'account' => 'existing', 'link_user_id' => $accountant->id]))
        ->assertSessionHasNoErrors();

    $employee = Employee::where('employee_code', 'E-100')->firstOrFail();
    expect($employee->user_id)->toBe($accountant->id)
        ->and($accountant->fresh()->getRoleNames()->all())->toBe(['Accountant'])
        ->and($accountant->entities()->where('entities.id', $this->entity->id)->exists())->toBeTrue();

    // Already linked: not offered again, and cannot be linked to a second employee.
    ($this->as)()->get('/libraries/employees')->assertInertia(fn (Assert $page) => $page
        ->where('linkableUsers', fn ($users) => ! collect($users)->pluck('id')->contains($accountant->id)));
    ($this->as)()->post('/libraries/employees', ($this->payload)(['employee_code' => 'E-101', 'email' => null, 'account' => 'existing', 'link_user_id' => $accountant->id]))
        ->assertSessionHasErrors('link_user_id');
});

test('an older employee without a login can be edited as is, or given one', function () {
    $employee = Employee::create(['entity_id' => $this->entity->id, 'employee_code' => 'E-OLD', 'firstname' => 'Jun', 'lastname' => 'Reyes',
        'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'monthly', 'basic_pay' => 18000, 'is_active' => true]);
    $base = ['employee_code' => 'E-OLD', 'firstname' => 'Jun', 'lastname' => 'Reyes', 'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'monthly', 'basic_pay' => 18500];

    ($this->as)()->put("/libraries/employees/{$employee->id}", [...$base, 'account' => 'none'])->assertSessionHasNoErrors();
    expect($employee->fresh()->user_id)->toBeNull()->and((float) $employee->fresh()->basic_pay)->toBe(18500.0);

    ($this->as)()->put("/libraries/employees/{$employee->id}", [...$base, 'account' => 'new', 'username' => 'jun.reyes', 'password' => 'Secret-pass-123'])->assertSessionHasNoErrors();
    expect($employee->fresh()->user?->username)->toBe('jun.reyes');

    // Once linked, login fields are ignored on edit.
    ($this->as)()->put("/libraries/employees/{$employee->id}", [...$base, 'account' => 'new', 'username' => 'someone.else', 'password' => 'x'])->assertSessionHasNoErrors();
    expect($employee->fresh()->user?->username)->toBe('jun.reyes')->and(User::where('username', 'someone.else')->exists())->toBeFalse();
});
