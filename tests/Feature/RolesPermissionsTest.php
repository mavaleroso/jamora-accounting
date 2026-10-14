<?php

use App\Models\Entity;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->entity = Entity::create(['code' => 'RBAC', 'name' => 'RBAC Clinic', 'is_active' => true]);

    $this->admin = User::factory()->create();
    $this->admin->assignRole('Admin');
    $this->admin->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->other = User::factory()->create();
    $this->other->assignRole('Employee');

    $this->as = fn () => $this->actingAs($this->admin)->withSession(['current_entity_id' => $this->entity->id]);
});

test('the workspace lists roles, labelled permissions, modules and users', function () {
    ($this->as)()->get('/admin/roles?tab=matrix')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/roles-permissions/page')
            ->where('tab', 'matrix')
            ->where('currentUserId', $this->admin->id)
            ->has('modules')
            ->where('roles', fn ($roles) => collect($roles)->firstWhere('name', 'Admin')['isSystem'] === true)
            ->where('permissions', fn ($perms) => collect($perms)->firstWhere('key', 'payroll.run')['label'] === 'Run payroll')
            ->has('users', 2));
});

test('People Access redirects to user assignments', function () {
    ($this->as)()->get('/employee-management/access')->assertRedirect('/admin/roles?tab=users');
});

test('roles can be created from a copy, renamed and deleted', function () {
    $payroll = Role::findByName('Payroll');
    ($this->as)()->post('/admin/roles', ['name' => 'Branch Cashier', 'description' => 'Front desk cash only', 'copy_from' => $payroll->id])
        ->assertSessionHasNoErrors();

    $role = Role::findByName('Branch Cashier');
    expect($role->description)->toBe('Front desk cash only')
        ->and($role->permissions->pluck('name')->sort()->values()->all())->toBe($payroll->permissions->pluck('name')->sort()->values()->all());

    ($this->as)()->put("/admin/roles/{$role->id}", ['name' => 'Cashier', 'permissions' => ['billing.view', 'billing.collect']])->assertSessionHasNoErrors();
    expect($role->fresh()->name)->toBe('Cashier')->and($role->fresh()->permissions)->toHaveCount(2);

    ($this->as)()->delete("/admin/roles/{$role->id}")->assertSessionHasNoErrors();
    expect(Role::where('name', 'Cashier')->exists())->toBeFalse();
});

test('built-in roles cannot be renamed or deleted', function () {
    $employee = Role::findByName('Employee');

    ($this->as)()->put("/admin/roles/{$employee->id}", ['name' => 'Staff', 'permissions' => []])->assertSessionHasErrors('name');
    ($this->as)()->delete("/admin/roles/{$employee->id}")->assertSessionHasErrors('role');
    expect(Role::where('name', 'Employee')->exists())->toBeTrue();
});

test('the Admin role cannot lose access administration', function () {
    $admin = Role::findByName('Admin');

    ($this->as)()->put("/admin/roles/{$admin->id}", ['name' => 'Admin', 'permissions' => ['dashboard.view']])->assertSessionHasErrors('permissions');
    expect($admin->fresh()->hasPermissionTo('admin.roles-permissions.manage'))->toBeTrue();
});

test('users are assigned a role, replacing their current one, but not their own', function () {
    $auditor = Role::findByName('Auditor');

    ($this->as)()->post("/admin/roles/{$auditor->id}/assign", ['user_ids' => [$this->other->id]])->assertSessionHasNoErrors();
    expect($this->other->fresh()->getRoleNames()->all())->toBe(['Auditor']);

    ($this->as)()->post("/admin/roles/{$auditor->id}/assign", ['user_ids' => [$this->admin->id]])->assertSessionHasErrors('user_ids');
    expect($this->admin->fresh()->hasRole('Admin'))->toBeTrue();
});

test('built-in permission keys cannot be renamed or deleted; custom keys can', function () {
    $builtin = Permission::findByName('payroll.run');
    ($this->as)()->put("/admin/permissions/{$builtin->id}", ['name' => 'payroll.execute', 'roles' => []])->assertSessionHasErrors('name');
    ($this->as)()->delete("/admin/permissions/{$builtin->id}")->assertSessionHasErrors('name');

    ($this->as)()->post('/admin/permissions', ['name' => 'inventory.adjust', 'roles' => []])->assertSessionHasNoErrors();
    $custom = Permission::findByName('inventory.adjust');
    ($this->as)()->delete("/admin/permissions/{$custom->id}")->assertSessionHasNoErrors();
    expect(Permission::where('name', 'inventory.adjust')->exists())->toBeFalse();
});
