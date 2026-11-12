<?php

use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use App\Services\Optical\OpticalSource;
use App\Services\Optical\OpticalSyncService;
use App\Support\EntityContext;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\Support\FakeOpticalSource;

uses(RefreshDatabase::class);

/*
 * optical-new users → copied logins with an employee record each, against a stand-in POS.
 */
beforeEach(function () {
    foreach (['JAM_OPTICUS' => 'JAM Opticus', 'A_JAMORA' => 'A. Jamora Optical', 'AL_JAMORA' => 'AL Jamora Optical'] as $code => $name) {
        Entity::create(['code' => $code, 'name' => $name, 'is_active' => true]);
    }
    app(EntityContext::class)->clear();
    Storage::fake('public');

    $this->pos = new FakeOpticalSource;
    app()->instance(OpticalSource::class, $this->pos);
    // A photo that is not on this server is fetched from the POS's site.
    Http::fake(fn () => Http::response('photo-bytes'));

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
    $this->pos['users'] = [
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
    $this->pos['users'] = [opticalUser(['contact_number' => '0917 111 2222'])];
    ($this->sync)();

    $user = User::where('optical_user_id', 11)->sole();
    employeeOf($user)->update(['sss_number' => '34-1234567-8', 'tin' => '123-456-789-000', 'basic_pay' => 18000]);

    $this->pos['users'] = [opticalUser(['username' => 'ethel.andong', 'lastname' => 'Andong-Reyes', 'middlename' => 'Cruz', 'contact_number' => null])];
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
    $this->pos['users'] = [opticalUser()];
    ($this->sync)();
    $user = User::where('optical_user_id', 11)->sole();

    $this->pos['users'] = [opticalUser(['status' => false])];
    ($this->sync)();
    expect($user->fresh()->status)->toBeFalse()
        ->and(employeeOf($user)->only(['employment_status', 'is_active']))->toBe(['employment_status' => 'inactive', 'is_active' => false]);

    $this->pos['users'] = [opticalUser(['status' => true])];
    ($this->sync)();
    expect($user->fresh()->status)->toBeTrue()
        ->and(employeeOf($user)->only(['employment_status', 'is_active']))->toBe(['employment_status' => 'active', 'is_active' => true]);
});

test('a user removed from optical-new is disabled here', function () {
    $this->pos['users'] = [opticalUser(), opticalUser(['id' => 12, 'username' => 'drmarquez', 'firstname' => 'Daisy Rose', 'lastname' => 'Marquez'])];
    ($this->sync)();

    $this->pos['users'] = [opticalUser()];
    ($this->sync)();

    $gone = User::where('optical_user_id', 12)->sole();
    expect($gone->status)->toBeFalse()
        ->and(employeeOf($gone)->employment_status)->toBe('inactive')
        ->and(User::where('optical_user_id', 11)->value('status'))->toBeTrue();
});

test('a login made here under the same username becomes the copy and keeps its roles; a deleted employee stays deleted', function () {
    $owner = User::factory()->create(['username' => 'lajamora', 'email' => 'owner@jamora.local']);
    $owner->assignRole(Role::findOrCreate('Admin', 'web'));

    $this->pos['users'] = [opticalUser(['id' => 23, 'username' => 'lajamora', 'firstname' => 'Joseph Lawrence', 'lastname' => 'Jamora', 'roles' => ['Admin']])];
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
    $this->pos['users'] = [opticalUser()];
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

test('a copied user signs in with their optical-new password, checked against the POS', function () {
    config(['optical.password_check' => true]);
    $this->pos['users'] = [opticalUser()];
    $this->pos->passwords = [11 => 'Optical-pass-1'];
    ($this->sync)();

    $this->post('/login', ['username' => 'eandong', 'password' => 'wrong'])->assertSessionHasErrors('username');
    $this->assertGuest();

    $this->post('/login', ['username' => 'eandong', 'password' => 'Optical-pass-1']);
    $this->assertAuthenticatedAs(User::where('optical_user_id', 11)->sole());

    expect($this->pos->passwordChecks)->toContain([11, 'Optical-pass-1']);
});

test('when the POS can\'t be read, the password kept here counts', function () {
    config(['optical.password_check' => true]);
    $this->pos['users'] = [opticalUser()];
    ($this->sync)();
    $user = User::where('optical_user_id', 11)->sole();
    $user->update(['password' => 'Local-pass-1']);
    $this->pos->down = true;

    $this->post('/login', ['username' => 'eandong', 'password' => 'Local-pass-1']);
    $this->assertAuthenticatedAs($user);
});

test('with the optical-new password check off, a copied user signs in with the password kept here', function () {
    config(['optical.password_check' => false]);
    $this->pos['users'] = [opticalUser()];
    $this->pos->passwords = [11 => 'Optical-pass-1'];
    ($this->sync)();
    $user = User::where('optical_user_id', 11)->sole();
    $user->update(['password' => 'Local-pass-1']);

    $this->post('/login', ['username' => 'eandong', 'password' => 'Optical-pass-1'])->assertSessionHasErrors('username');
    $this->assertGuest();

    $this->post('/login', ['username' => 'eandong', 'password' => 'Local-pass-1']);
    $this->assertAuthenticatedAs($user);
    expect($this->pos->passwordChecks)->toBe([]);
});

test('a login not copied from optical-new keeps its own password', function () {
    $owner = User::factory()->create(['username' => 'owner', 'password' => 'Owner-pass-1']);
    $owner->assignRole(Role::findOrCreate('Admin', 'web'));

    $this->post('/login', ['username' => 'owner', 'password' => 'Owner-pass-1']);
    $this->assertAuthenticatedAs($owner);
    expect($this->pos->passwordChecks)->toBe([]);
});

test('the employee record takes the birth date and address, but not a placeholder birth date', function () {
    $this->pos['users'] = [
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
