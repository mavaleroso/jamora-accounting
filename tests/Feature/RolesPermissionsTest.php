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
    $payroll = Role::findByName('Accountant');
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
    $auditor = Role::findByName('Accounting Retainer');

    ($this->as)()->post("/admin/roles/{$auditor->id}/assign", ['user_ids' => [$this->other->id]])->assertSessionHasNoErrors();
    expect($this->other->fresh()->getRoleNames()->all())->toBe(['Accounting Retainer']);

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

test('the built-in roles are the owner, the accountant, the retainer and employees', function () {
    expect(Role::pluck('name')->sort()->values()->all())->toBe(['Accountant', 'Accounting Retainer', 'Admin', 'Employee']);
});

test('the accountant does the work but the owner signs it off', function () {
    $accountant = Role::findByName('Accountant');

    foreach (['journals.create', 'journals.post', 'billing.collect', 'ap.pay', 'banks.reconcile', 'payroll.manage', 'leave.approve', 'attendance.manage', 'compliance.manage', 'portal.view'] as $permission) {
        expect($accountant->hasPermissionTo($permission))->toBeTrue("Accountant should hold {$permission}");
    }
    foreach (['journals.approve', 'payroll.run', 'compliance.verify', 'periods.close', 'periods.reopen', 'journals.void', 'admin.users.manage', 'admin.roles-permissions.manage', 'admin.audit-trails.view'] as $permission) {
        expect($accountant->hasPermissionTo($permission))->toBeFalse("Accountant should not hold {$permission}");
    }
});

test('the accounting retainer reviews everything, drafts adjustments and can verify filings', function () {
    $retainer = Role::findByName('Accounting Retainer');
    $writes = $retainer->permissions->pluck('name')->reject(fn (string $p) => str_ends_with($p, '.view'))->sort()->values()->all();

    expect($writes)->toBe(['compliance.verify', 'journals.create', 'journals.update', 'reports.export', 'settings.profile.manage'])
        ->and($retainer->hasPermissionTo('journals.approve'))->toBeFalse()
        ->and($retainer->hasPermissionTo('admin.audit-trails.view'))->toBeTrue()
        ->and($retainer->hasPermissionTo('payroll.view'))->toBeTrue()
        ->and($retainer->hasPermissionTo('portal.view'))->toBeFalse();
});

test('the recalibration migration moves users off retired roles', function () {
    $legacy = Role::findOrCreate('Payroll', 'web');
    $auditor = Role::findOrCreate('Auditor', 'web');
    $custom = Role::findOrCreate('Branch Cashier', 'web');
    $this->other->syncRoles([$legacy]);
    $reviewer = User::factory()->create();
    $reviewer->assignRole($auditor);
    $cashier = User::factory()->create();
    $cashier->assignRole($custom);

    (require database_path('migrations/2026_10_22_100000_recalibrate_roles.php'))->up();

    expect($this->other->fresh()->getRoleNames()->all())->toBe(['Accountant'])
        ->and($reviewer->fresh()->getRoleNames()->all())->toBe(['Accounting Retainer'])
        ->and($cashier->fresh()->getRoleNames()->all())->toBe(['Branch Cashier'])
        ->and(Role::whereIn('name', ['Payroll', 'Auditor'])->exists())->toBeFalse();
});
