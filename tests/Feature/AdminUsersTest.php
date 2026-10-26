<?php

use App\Models\Account;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\Journal;
use App\Models\User;
use App\Services\Accounting\JournalPostingService;
use App\Support\EntityContext;
use Database\Seeders\AccountingSetupSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->entity = Entity::create(['code' => 'USR', 'name' => 'Users Clinic', 'is_active' => true]);

    $this->admin = User::factory()->create(['firstname' => 'Ada', 'lastname' => 'Admin']);
    $this->admin->assignRole('Admin');
    $this->admin->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->staff = User::factory()->create(['firstname' => 'Sam', 'lastname' => 'Staff', 'status' => false]);
    $this->staff->assignRole('Employee');

    $this->as = fn () => $this->actingAs($this->admin)->withSession(['current_entity_id' => $this->entity->id]);
});

test('the users list returns summary, catalog and filters by role and status', function () {
    ($this->as)()->get('/admin/users')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/users/page')
            ->where('currentUserId', $this->admin->id)
            ->where('summary.total', 2)
            ->where('summary.active', 1)
            ->where('summary.disabled', 1)
            ->has('modules')
            ->where('permissions', fn ($perms) => collect($perms)->firstWhere('key', 'payroll.run')['label'] === 'Run payroll')
            ->has('users', 2));

    ($this->as)()->get('/admin/users?role=Employee')
        ->assertInertia(fn (Assert $page) => $page->has('users', 1)->where('users.0.id', $this->staff->id));

    ($this->as)()->get('/admin/users?status=active')
        ->assertInertia(fn (Assert $page) => $page->has('users', 1)->where('users.0.id', $this->admin->id));
});

test('an admin cannot disable their own account', function () {
    ($this->as)()->patch("/admin/users/{$this->admin->id}/status", ['status' => false])->assertSessionHasErrors('status');
    expect($this->admin->fresh()->status)->toBeTrue();

    ($this->as)()->patch("/admin/users/{$this->staff->id}/status", ['status' => true])->assertSessionHasNoErrors();
    expect($this->staff->fresh()->status)->toBeTrue();
});

test('an admin cannot remove their own user and role management access', function () {
    ($this->as)()->patch("/admin/users/{$this->admin->id}/rbac", ['role' => 'Employee', 'permissions' => [], 'permissions_present' => true])
        ->assertSessionHasErrors('role');
    expect($this->admin->fresh()->hasRole('Admin'))->toBeTrue();

    // Keeping the two admin permissions as extras is allowed
    ($this->as)()->patch("/admin/users/{$this->admin->id}/rbac", [
        'role' => 'Employee',
        'permissions' => ['admin.users.manage', 'admin.roles-permissions.manage'],
        'permissions_present' => true,
    ])->assertSessionHasNoErrors();
});

test('extra permissions are stored as direct permissions on top of the role', function () {
    ($this->as)()->patch("/admin/users/{$this->staff->id}/rbac", ['role' => 'Employee', 'permissions' => ['reports.trial-balance.view'], 'permissions_present' => true])
        ->assertSessionHasNoErrors();

    $staff = $this->staff->fresh();
    expect($staff->hasRole('Employee'))->toBeTrue()
        ->and($staff->getDirectPermissions()->pluck('name')->all())->toBe(['reports.trial-balance.view']);
});

test('an admin deletes a user, keeping their linked employee without a login', function () {
    $employee = Employee::create(['entity_id' => $this->entity->id, 'employee_code' => 'EE-1', 'firstname' => 'Sam', 'lastname' => 'Staff', 'user_id' => $this->staff->id]);

    ($this->as)()->delete("/admin/users/{$this->staff->id}")->assertSessionHasNoErrors()->assertSessionHas('status', 'Sam Staff deleted.');

    expect(User::find($this->staff->id))->toBeNull()
        ->and($employee->fresh()->user_id)->toBeNull()
        ->and(DB::table('model_has_roles')->where('model_id', $this->staff->id)->exists())->toBeFalse();
});

test('an admin cannot delete their own account', function () {
    ($this->as)()->delete("/admin/users/{$this->admin->id}")->assertSessionHasErrors('user');

    expect(User::find($this->admin->id))->not->toBeNull();
});

test('only the Admin role can delete users, even with user management access', function () {
    $manager = User::factory()->create();
    $manager->assignRole('Accountant');
    $manager->givePermissionTo('admin.users.manage');
    $manager->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->actingAs($manager)->withSession(['current_entity_id' => $this->entity->id])
        ->delete("/admin/users/{$this->staff->id}")->assertForbidden();

    expect(User::find($this->staff->id))->not->toBeNull();

    $this->actingAs($manager)->withSession(['current_entity_id' => $this->entity->id])
        ->get('/admin/users')->assertInertia(fn (Assert $page) => $page->where('canDelete', false));
    ($this->as)()->get('/admin/users')->assertInertia(fn (Assert $page) => $page->where('canDelete', true));
});

test('a user who touched journal entries cannot be deleted', function () {
    $this->seed(AccountingSetupSeeder::class);
    app(EntityContext::class)->set($this->entity);
    $entry = app(JournalPostingService::class)->create([
        'journal_id' => Journal::where('code', 'GJ')->value('id'),
        'entry_date' => now()->toDateString(),
        'memo' => 'Reclass',
    ], [
        ['account_id' => Account::where('code', '6100')->value('id'), 'debit' => 500, 'credit' => 0],
        ['account_id' => Account::where('code', '6200')->value('id'), 'debit' => 0, 'credit' => 500],
    ], $this->staff);
    $entry->delete();

    ($this->as)()->delete("/admin/users/{$this->staff->id}")->assertSessionHasErrors('user');

    expect(User::find($this->staff->id))->not->toBeNull();
});
