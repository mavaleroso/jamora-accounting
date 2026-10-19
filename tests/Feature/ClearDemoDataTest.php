<?php

use App\Models\Account;
use App\Models\BenefitProgram;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use App\Models\Vendor;
use App\Support\EntityContext;
use Database\Seeders\AccountingSetupSeeder;
use Database\Seeders\DemoUserSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->entity = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    $this->seed([RolesAndPermissionsSeeder::class, AccountingSetupSeeder::class, UserSeeder::class, DemoUserSeeder::class]);
    app(EntityContext::class)->clear();

    Employee::query()->create(['entity_id' => $this->entity->id, 'employee_code' => 'EMP-1001', 'firstname' => 'Maria', 'lastname' => 'Dela Cruz', 'basic_pay' => 20000]);
    Vendor::query()->create(['entity_id' => $this->entity->id, 'code' => 'V-1', 'name' => 'Lens Supplier', 'is_active' => true]);
    BenefitProgram::query()->create(['code' => 'SSS', 'name' => 'SSS', 'category' => 'statutory']);
    BenefitProgram::query()->create(['code' => 'RICE_SUBSIDY', 'name' => 'Rice Subsidy', 'category' => 'allowance']);
    $this->staff = User::factory()->create(['username' => 'eandong', 'email' => 'ethel@jamora.ph']);
});

test('without --force it only reports what it would delete', function () {
    $this->artisan('accounting:clear-demo-data')
        ->expectsOutputToContain('Nothing deleted')
        ->assertSuccessful();

    expect(Employee::query()->withoutGlobalScopes()->count())->toBe(1)
        ->and(User::count())->toBe(5);
});

test('it deletes the sample records and demo logins and keeps the setup, the admin and other logins', function () {
    $accounts = Account::withoutGlobalScope('entity')->count();

    $this->artisan('accounting:clear-demo-data', ['--force' => true])->assertSuccessful();

    expect(Employee::query()->withoutGlobalScopes()->count())->toBe(0)
        ->and(Vendor::withoutGlobalScope('entity')->count())->toBe(0)
        ->and(BenefitProgram::query()->withoutGlobalScopes()->pluck('code')->all())->toBe(['SSS'])
        ->and(User::orderBy('username')->pluck('username')->all())->toBe(['admin', 'eandong'])
        ->and(User::where('username', 'admin')->sole()->hasRole('Admin'))->toBeTrue()
        ->and(Account::withoutGlobalScope('entity')->count())->toBe($accounts)
        ->and(Entity::count())->toBe(1);
});
