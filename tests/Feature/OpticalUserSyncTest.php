<?php

use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use App\Services\Optical\OpticalSyncService;
use App\Support\EntityContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

/*
 * optical-new users → copied logins with an employee record each, against a fake GET /users.
 */
beforeEach(function () {
    foreach (['JAM_OPTICUS' => 'JAM Opticus', 'A_JAMORA' => 'A. Jamora Optical', 'AL_JAMORA' => 'AL Jamora Optical'] as $code => $name) {
        Entity::create(['code' => $code, 'name' => $name, 'is_active' => true]);
    }
    app(EntityContext::class)->clear();
    Storage::fake('public');

    config([
        'optical.api.base_url' => 'http://optical.test',
        'optical.api.token' => 'secret-token',
    ]);

    $this->users = [];
    $this->passwords = []; // optical-new user id => password
    $this->opticalDown = false;
    Http::fake(function (Request $request) {
        if (str_contains($request->url(), '/storage/avatars/')) {
            return Http::response('photo-bytes');
        }
        if (preg_match('#/users/(\d+)/check-password$#', $request->url(), $m)) {
            return $this->opticalDown
                ? Http::failedConnection()
                : Http::response(['valid' => ($this->passwords[(int) $m[1]] ?? null) === $request['password']]);
        }
        $path = trim(str_replace('http://optical.test/api/v1/accounting/', '', strtok($request->url(), '?')), '/');

        return Http::response(['data' => $path === 'users' ? array_values($this->users) : [], 'meta' => ['last_page' => 1]]);
    });

    $this->sync = fn () => app(OpticalSyncService::class)->run(null, ['streams' => ['users']]);
});

function opticalUser(array $overrides = []): array
{
    return array_merge([
        'id' => 11,
        'username' => 'eandong',
        'email' => null,
        'firstname' => 'Ethel',
        'middlename' => null,
        'lastname' => 'Andong',
        'sex' => 'Female',
        'contact_number' => null,
        'address' => null,
        'birthdate' => '1990-05-01',
        'position' => 'Staff',
        'date_started' => null,
        'avatar_url' => null,
        'status' => true,
        'roles' => ['Sales Associate'],
        'updated_at' => now()->toIso8601String(),
    ], $overrides);
}

function employeeOf(User $user): Employee
{
    return Employee::query()->withoutGlobalScopes()->where('user_id', $user->id)->sole();
}

test('every optical-new user is copied as a login, value for value, with an employee record', function () {
    $this->users = [
        opticalUser(),
        opticalUser([
            'id' => 15, 'username' => 'rcarillo', 'email' => 'roselyn@jamora.ph', 'firstname' => 'Roselyn', 'middlename' => 'Ranoco', 'lastname' => 'Carillo',
            'contact_number' => '0917 555 0101', 'address' => 'Butuan City', 'date_started' => '2024-09-25',
            'avatar_url' => 'http://optical.test/storage/avatars/roselyn.webp', 'roles' => ['Wholesale'],
        ]),
        opticalUser(['id' => 1, 'username' => 'admin', 'firstname' => 'Admin', 'lastname' => 'User', 'position' => 'Administrator', 'roles' => ['Admin']]),
        opticalUser(['id' => 25, 'username' => 'jtanieo', 'firstname' => 'Jeffrey', 'contact_number' => 'none']),
    ];

    $run = ($this->sync)();

    expect($run->status)->toBe('completed')
        ->and($run->message)->toContain('users: 4 read, 4 saved')
        ->and(User::where('username', 'admin')->value('optical_user_id'))->toBe(1);

    $ethel = User::where('optical_user_id', 11)->sole();
    expect($ethel->only(['username', 'email', 'firstname', 'middlename', 'lastname', 'sex', 'contact_number', 'address', 'position', 'status']))->toBe([
        'username' => 'eandong', 'email' => null, 'firstname' => 'Ethel', 'middlename' => null, 'lastname' => 'Andong', 'sex' => 'Female',
        'contact_number' => null, 'address' => null, 'position' => 'Staff', 'status' => true,
    ])
        ->and($ethel->birthdate->toDateString())->toBe('1990-05-01')
        ->and($ethel->getRoleNames()->all())->toBe(['Employee'])
        ->and(Hash::check('password', $ethel->password))->toBeFalse();

    // The employee record marks what optical-new doesn't have with "-".
    $employee = employeeOf($ethel);
    expect($employee->entity_id)->toBe(Entity::where('code', 'A_JAMORA')->value('id'))
        ->and($employee->employee_code)->toBe('OPT-0011')
        ->and($employee->name)->toBe('Ethel Andong')
        ->and($employee->gender)->toBe('female')
        ->and($employee->only(['middlename', 'phone', 'sss_number', 'philhealth_number', 'pagibig_number', 'tin', 'bank_name', 'bank_account_no']))
        ->each->toBe('-')
        ->and($employee->email)->toBeNull()
        ->and($employee->hire_date)->toBeNull()
        ->and($employee->employment_status)->toBe('active')
        ->and((float) $employee->basic_pay)->toBe(0.0)
        ->and($ethel->entities()->pluck('entities.id')->all())->toBe([$employee->entity_id]);

    // The photo is copied into this app's storage.
    $roselyn = User::where('optical_user_id', 15)->sole();
    Storage::disk('public')->assertExists('avatars/roselyn.webp');
    expect($roselyn->avatar)->toBe('avatars/roselyn.webp')
        ->and(employeeOf($roselyn)->entity_id)->toBe(Entity::where('code', 'JAM_OPTICUS')->value('id'))
        ->and(employeeOf($roselyn)->avatar_url)->toBe('/storage/avatars/roselyn.webp')
        ->and(employeeOf($roselyn)->hire_date->toDateString())->toBe('2024-09-25');

    // Copied as typed on the login; "none" counts as missing on the employee record.
    $jeffrey = User::where('optical_user_id', 25)->sole();
    expect($jeffrey->contact_number)->toBe('none')
        ->and(employeeOf($jeffrey)->phone)->toBe('-');
});

test('a re-sync copies optical-new\'s changes and keeps what was entered on the employee record', function () {
    $this->users = [opticalUser(['contact_number' => '0917 111 2222'])];
    ($this->sync)();

    $user = User::where('optical_user_id', 11)->sole();
    employeeOf($user)->update(['sss_number' => '34-1234567-8', 'tin' => '123-456-789-000', 'basic_pay' => 18000]);

    $this->users = [opticalUser(['username' => 'ethel.andong', 'lastname' => 'Andong-Reyes', 'middlename' => 'Cruz', 'contact_number' => null])];
    $run = ($this->sync)();

    $user->refresh();
    $employee = employeeOf($user);
    expect($run->message)->toContain('users: 1 read, 1 saved')
        ->and(User::count())->toBe(1)
        ->and($user->username)->toBe('ethel.andong')
        ->and($user->contact_number)->toBeNull()
        ->and($user->name)->toBe('Ethel Cruz Andong-Reyes')
        ->and($employee->name)->toBe('Ethel Cruz Andong-Reyes')
        ->and($employee->phone)->toBe('0917 111 2222')
        ->and($employee->sss_number)->toBe('34-1234567-8')
        ->and($employee->tin)->toBe('123-456-789-000')
        ->and((float) $employee->basic_pay)->toBe(18000.0);

    // Nothing changed: nothing saved.
    expect(($this->sync)()->message)->toContain('users: 1 read, 0 saved');
});

test('the login follows optical-new\'s status, and the employee follows the login', function () {
    $this->users = [opticalUser()];
    ($this->sync)();
    $user = User::where('optical_user_id', 11)->sole();

    $this->users = [opticalUser(['status' => false])];
    ($this->sync)();
    expect($user->fresh()->status)->toBeFalse()
        ->and(employeeOf($user)->only(['employment_status', 'is_active']))->toBe(['employment_status' => 'inactive', 'is_active' => false]);

    $this->users = [opticalUser(['status' => true])];
    ($this->sync)();
    expect($user->fresh()->status)->toBeTrue()
        ->and(employeeOf($user)->only(['employment_status', 'is_active']))->toBe(['employment_status' => 'active', 'is_active' => true]);
});

test('a user removed from optical-new is disabled here', function () {
    $this->users = [opticalUser(), opticalUser(['id' => 12, 'username' => 'drmarquez', 'firstname' => 'Daisy Rose', 'lastname' => 'Marquez'])];
    ($this->sync)();

    $this->users = [opticalUser()];
    ($this->sync)();

    $gone = User::where('optical_user_id', 12)->sole();
    expect($gone->status)->toBeFalse()
        ->and(employeeOf($gone)->employment_status)->toBe('inactive')
        ->and(User::where('optical_user_id', 11)->value('status'))->toBeTrue();
});

test('a login made here under the same username becomes the copy and keeps its roles; a deleted employee stays deleted', function () {
    $owner = User::factory()->create(['username' => 'lajamora', 'email' => 'owner@jamora.local']);
    $owner->assignRole(Role::findOrCreate('Admin', 'web'));

    $this->users = [opticalUser(['id' => 23, 'username' => 'lajamora', 'firstname' => 'Joseph Lawrence', 'lastname' => 'Jamora', 'roles' => ['Admin']])];
    ($this->sync)();

    $owner->refresh();
    expect(User::count())->toBe(1)
        ->and($owner->optical_user_id)->toBe(23)
        ->and($owner->email)->toBeNull()
        ->and($owner->name)->toBe('Joseph Lawrence Jamora')
        ->and($owner->getRoleNames()->all())->toBe(['Admin'])
        ->and(employeeOf($owner)->entity_id)->toBe(Entity::where('code', 'JAM_OPTICUS')->value('id'));

    employeeOf($owner)->delete();
    ($this->sync)();
    expect(Employee::query()->withoutGlobalScopes()->where('user_id', $owner->id)->sole()->trashed())->toBeTrue();
});

test('the employee directory counts "-" government IDs as missing and leaves "-" out of its filters', function () {
    $this->users = [opticalUser()];
    ($this->sync)();

    $clinic = Entity::where('code', 'A_JAMORA')->firstOrFail();
    Permission::findOrCreate('libraries.employees.manage', 'web');
    $hr = User::factory()->create();
    $hr->givePermissionTo('libraries.employees.manage');
    $hr->entities()->attach($clinic->id, ['is_default' => true]);

    $this->actingAs($hr)->withSession(['current_entity_id' => $clinic->id])
        ->get('/libraries/employees')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('stats.incomplete_statutory', 1)
            ->where('positions', ['Staff']));
});

test('a copied user signs in with their optical-new password, checked by optical-new', function () {
    $this->users = [opticalUser()];
    $this->passwords = [11 => 'Optical-pass-1'];
    ($this->sync)();

    $this->post('/login', ['username' => 'eandong', 'password' => 'wrong'])->assertSessionHasErrors('username');
    $this->assertGuest();

    $this->post('/login', ['username' => 'eandong', 'password' => 'Optical-pass-1']);
    $this->assertAuthenticatedAs(User::where('optical_user_id', 11)->sole());

    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/users/11/check-password') && $r['password'] === 'Optical-pass-1');
});

test('when optical-new can\'t be reached, the password kept here counts', function () {
    $this->users = [opticalUser()];
    ($this->sync)();
    $user = User::where('optical_user_id', 11)->sole();
    $user->update(['password' => 'Local-pass-1']);
    $this->opticalDown = true;

    $this->post('/login', ['username' => 'eandong', 'password' => 'Local-pass-1']);
    $this->assertAuthenticatedAs($user);
});

test('a login not copied from optical-new keeps its own password', function () {
    $owner = User::factory()->create(['username' => 'owner', 'password' => 'Owner-pass-1']);
    $owner->assignRole(Role::findOrCreate('Admin', 'web'));

    $this->post('/login', ['username' => 'owner', 'password' => 'Owner-pass-1']);
    $this->assertAuthenticatedAs($owner);
    Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'check-password'));
});

test('the employee record takes the birth date and address, but not a placeholder birth date', function () {
    $this->users = [
        opticalUser(['address' => 'Butuan City']),
        // optical-new's placeholder: a birth date no working employee can have.
        opticalUser(['id' => 12, 'username' => 'drmarquez', 'firstname' => 'Daisy Rose', 'lastname' => 'Marquez', 'birthdate' => '2024-09-25']),
    ];

    ($this->sync)();

    $ethel = employeeOf(User::where('optical_user_id', 11)->sole());
    $daisy = employeeOf(User::where('optical_user_id', 12)->sole());
    expect($ethel->birth_date->toDateString())->toBe('1990-05-01')
        ->and($ethel->address)->toBe('Butuan City')
        ->and($daisy->birth_date)->toBeNull()
        ->and($daisy->only(['address', 'emergency_contact_name', 'emergency_contact_phone', 'bank_account_name']))->each->toBe('-');
});
