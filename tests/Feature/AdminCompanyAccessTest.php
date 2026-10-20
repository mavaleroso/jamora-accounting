<?php

use App\Models\BankAccount;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use App\Support\EntityContext;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/*
 * The Admin role (the owner) opens every active company without being given each one. Everyone else opens the
 * companies they were given. The company switcher, the current company and the all-company pages follow this, except
 * the Employee Directory: the Accountant, who keeps every company's employee records, lists them all there too.
 */
beforeEach(function () {
    $this->jam = Entity::create(['code' => 'JAM_OPTICUS', 'name' => 'JAM Opticus', 'is_active' => true]);
    $this->aj = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    $this->al = Entity::create(['code' => 'AL_JAMORA', 'name' => 'AL Jamora Optical', 'is_active' => true]);
    $this->closed = Entity::create(['code' => 'CLOSED', 'name' => 'Closed Branch', 'is_active' => false]);
    app(EntityContext::class)->clear();

    $permissions = ['libraries.employees.manage', 'banks.view'];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }
    // The owner was given only JAM Opticus (as the optical sync does); the Accountant too.
    $this->owner = User::factory()->create();
    $this->owner->assignRole(Role::findOrCreate('Admin', 'web')->syncPermissions($permissions));
    $this->owner->entities()->attach($this->jam->id, ['is_default' => true]);
    $this->accountant = User::factory()->create();
    $this->accountant->assignRole(Role::findOrCreate('Accountant', 'web')->syncPermissions($permissions));
    $this->accountant->entities()->attach($this->jam->id, ['is_default' => true]);

    foreach ([[$this->jam, '001'], [$this->aj, '002'], [$this->al, '003'], [$this->closed, '004']] as [$company, $code]) {
        Employee::create(['entity_id' => $company->id, 'employee_code' => $code, 'firstname' => 'Staff', 'lastname' => $code,
            'employment_status' => 'active', 'employment_type' => 'regular', 'is_active' => true, 'pay_type' => 'daily', 'basic_pay' => 475]);
        BankAccount::query()->withoutGlobalScope('entity')->create(['entity_id' => $company->id, 'code' => "B-{$code}", 'name' => "Bank {$code}", 'bank_name' => 'BDO', 'is_active' => true]);
    }
});

test('an admin opens every active company without being given each one', function () {
    expect($this->owner->accessibleEntities()->orderBy('name')->pluck('code')->all())->toBe(['A_JAMORA', 'AL_JAMORA', 'JAM_OPTICUS'])
        ->and($this->owner->canOpenEntity($this->closed->id))->toBeFalse();

    // The switcher offers every company; the directory and bank accounts list all of them.
    $this->actingAs($this->owner)->get('/libraries/employees')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('entity.available', fn ($companies) => collect($companies)->pluck('code')->sort()->values()->all() === ['AL_JAMORA', 'A_JAMORA', 'JAM_OPTICUS'])
            ->where('entity.current.code', 'JAM_OPTICUS') // their own default company first
            ->has('employees', 3)
            ->has('companies', 3));
    $this->actingAs($this->owner)->get('/banks/accounts')->assertOk()->assertInertia(fn (Assert $page) => $page->has('bankAccounts', 3));

    // Switching to a company they were not given works, and does not add it to them.
    $this->actingAs($this->owner)->post('/entities/switch', ['entity_id' => $this->al->id])->assertRedirect();
    expect(session('current_entity_id'))->toBe($this->al->id)
        ->and($this->owner->entities()->pluck('entities.id')->all())->toBe([$this->jam->id]);
    $this->actingAs($this->owner)->post('/entities/switch', ['entity_id' => $this->closed->id])->assertNotFound();
});

test('an admin given no company still has a current one', function () {
    $this->owner->entities()->detach();

    $this->actingAs($this->owner)->get('/libraries/employees')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('entity.current.code', 'A_JAMORA')->has('employees', 3));
});

test('everyone else opens only the companies they were given', function () {
    expect($this->accountant->accessibleEntities()->pluck('code')->all())->toBe(['JAM_OPTICUS']);

    $this->actingAs($this->accountant)->get('/banks/accounts')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('entity.available', 1)->has('bankAccounts', 1));
    $this->actingAs($this->accountant)->post('/entities/switch', ['entity_id' => $this->al->id])->assertForbidden();

    // Losing the Admin role takes away the companies an admin was never given.
    $this->owner->syncRoles(['Accountant']);
    expect($this->owner->fresh()->accessibleEntities()->pluck('code')->all())->toBe(['JAM_OPTICUS']);
});

test("the accountant's employee directory lists every active company's employees", function () {
    $employee = fn (Entity $company) => Employee::query()->withoutGlobalScopes()->where('entity_id', $company->id)->sole();

    $this->actingAs($this->accountant)->get('/libraries/employees')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('entity.available', 1) // the switcher still offers only their own company
            ->has('employees', 3)
            ->where('companies', fn ($companies) => collect($companies)->pluck('code')->sort()->values()->all() === ['AL_JAMORA', 'A_JAMORA', 'JAM_OPTICUS']));
    $this->actingAs($this->accountant)->get("/libraries/employees/{$employee($this->al)->id}/overview")->assertOk();
    $this->actingAs($this->accountant)->get("/libraries/employees/{$employee($this->closed)->id}/overview")->assertNotFound();

    // Other roles keep to the companies they were given.
    $clerk = User::factory()->create();
    $clerk->givePermissionTo('libraries.employees.manage');
    $clerk->entities()->attach($this->jam->id, ['is_default' => true]);
    $this->actingAs($clerk)->get('/libraries/employees')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('employees', 1)->has('companies', 1));
    $this->actingAs($clerk)->get("/libraries/employees/{$employee($this->al)->id}/overview")->assertNotFound();
});
