<?php

use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/** The settings pages need the settings.profile.manage permission, which every role is given. */
beforeEach(function () {
    $this->user = User::factory()->create();
    $this->user->givePermissionTo(Permission::findOrCreate('settings.profile.manage', 'web'));
});

test('profile page is displayed', function () {
    $user = $this->user;

    $response = $this
        ->actingAs($user)
        ->get('/settings/profile');

    $response->assertOk();
});

test('profile information can be updated', function () {
    $user = $this->user;

    $response = $this
        ->actingAs($user)
        ->patch('/settings/profile', [
            'firstname' => 'Test',
            'lastname' => 'User',
            'email' => 'test@example.com',
        ]);

    $response
        ->assertSessionHasNoErrors()
        ->assertRedirect('/settings/profile');

    $user->refresh();

    expect($user->name)->toBe('Test User'); // firstname + lastname
    expect($user->email)->toBe('test@example.com');
    expect($user->email_verified_at)->toBeNull();
});

test('email verification status is unchanged when the email address is unchanged', function () {
    $user = $this->user;

    $response = $this
        ->actingAs($user)
        ->patch('/settings/profile', [
            'firstname' => 'Test',
            'lastname' => 'User',
            'email' => $user->email,
        ]);

    $response
        ->assertSessionHasNoErrors()
        ->assertRedirect('/settings/profile');

    expect($user->refresh()->email_verified_at)->not->toBeNull();
});

test('user can delete their account', function () {
    $user = $this->user;

    $response = $this
        ->actingAs($user)
        ->delete('/settings/profile', [
            'password' => 'password',
        ]);

    $response
        ->assertSessionHasNoErrors()
        ->assertRedirect('/');

    $this->assertGuest();
    expect($user->fresh())->toBeNull();
});

test('correct password must be provided to delete account', function () {
    $user = $this->user;

    $response = $this
        ->actingAs($user)
        ->from('/settings/profile')
        ->delete('/settings/profile', [
            'password' => 'wrong-password',
        ]);

    $response
        ->assertSessionHasErrors('password')
        ->assertRedirect('/settings/profile');

    expect($user->fresh())->not->toBeNull();
});

describe('employee records', function () {
    beforeEach(function () {
        $this->a = Entity::create(['code' => 'AJOC', 'name' => 'Jamora Clinic', 'is_active' => true]);
        $this->b = Entity::create(['code' => 'ALJO', 'name' => 'AL Jamora Optical', 'is_active' => true]);
        $this->user->update(['firstname' => 'Maria', 'lastname' => 'Santos', 'address' => '-', 'contact_number' => null]);
        $this->user->entities()->attach($this->a->id, ['is_default' => true]);
        $this->user->assignRole(Role::findOrCreate('Employee', 'web'));
        $make = fn (Entity $entity, string $code, array $extra = []) => Employee::create([
            'entity_id' => $entity->id, 'user_id' => $this->user->id, 'employee_code' => $code, 'firstname' => 'Maria', 'lastname' => 'Santos',
            'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'monthly', 'basic_pay' => 20000, 'is_active' => true,
            'hire_date' => '2024-03-01', 'position' => 'Optometrist', ...$extra,
        ]);
        $this->first = $make($this->a, 'E-1', ['address' => 'Davao City', 'phone' => '09171234567', 'gender' => 'female', 'sss_number' => '34-1234567-8', 'bank_account_no' => '001234567890']);
        $this->second = $make($this->b, 'E-7');
    });

    test('the profile shows the login and employee records, filling gaps from the directory', function () {
        $this->actingAs($this->user)->withSession(['current_entity_id' => $this->a->id])
            ->get('/settings/profile')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('settings/profile')
                ->where('profile.address', 'Davao City') // the login's "-" counts as none
                ->where('profile.contact_number', '09171234567')
                ->where('profile.sex', 'Female')
                ->where('account.username', $this->user->username)
                ->where('account.role', 'Employee')
                ->has('employments', 2)
                ->where('employments.0.employee_code', 'E-1')
                ->where('employments.0.position', 'Optometrist')
                ->where('employments.0.ids.sss_number', '34-1234567-8')
                ->where('employments.0.ids.tin', null)
                ->where('employments.0.bank.account_no', '•••• 7890')
                ->where('employments.1.company.code', 'ALJO'));
    });

    test('saving updates the login and every linked employee record', function () {
        $this->actingAs($this->user)
            ->patch('/settings/profile', [
                'firstname' => 'Maria', 'middlename' => 'Cruz', 'lastname' => 'Reyes', 'email' => 'maria@example.com',
                'contact_number' => '09998887777', 'address' => 'Tagum City', 'sex' => 'Female', 'birthdate' => '1990-05-04',
                'civil_status' => 'married', 'emergency_contact_name' => 'Jose Reyes', 'emergency_contact_relationship' => 'Spouse', 'emergency_contact_phone' => '09181112222',
            ])
            ->assertSessionHasNoErrors()
            ->assertRedirect('/settings/profile');

        expect($this->user->refresh())
            ->name->toBe('Maria Cruz Reyes')
            ->contact_number->toBe('09998887777')
            ->address->toBe('Tagum City');

        foreach ([$this->first, $this->second] as $employee) {
            expect($employee->refresh())
                ->lastname->toBe('Reyes')
                ->email->toBe('maria@example.com')
                ->phone->toBe('09998887777')
                ->address->toBe('Tagum City')
                ->gender->toBe('female')
                ->birth_date->format('Y-m-d')->toBe('1990-05-04')
                ->civil_status->toBe('married')
                ->emergency_contact_relationship->toBe('Spouse')
                // Kept by HR: not touched from the profile.
                ->position->toBe('Optometrist')
                ->employee_code->not->toBeEmpty();
        }
        expect($this->first->sss_number)->toBe('34-1234567-8');
    });

    test('a new photo is copied to each employee record', function () {
        Storage::fake('public');

        $this->actingAs($this->user)
            ->patch('/settings/profile', ['firstname' => 'Maria', 'lastname' => 'Santos', 'avatar' => UploadedFile::fake()->image('me.jpg')])
            ->assertSessionHasNoErrors();

        $login = $this->user->refresh()->avatar;
        Storage::disk('public')->assertExists($login);
        foreach ([$this->first, $this->second] as $employee) {
            $photo = $employee->refresh()->avatar;
            expect($photo)->toStartWith('employee-avatars/')->not->toBe($login);
            Storage::disk('public')->assertExists($photo);
        }
    });

    test('removing the photo removes it from the login and the employee records', function () {
        Storage::fake('public');
        $this->actingAs($this->user)
            ->patch('/settings/profile', ['firstname' => 'Maria', 'lastname' => 'Santos', 'avatar' => UploadedFile::fake()->image('me.jpg')]);
        $files = [$this->user->refresh()->avatar, $this->first->refresh()->avatar, $this->second->refresh()->avatar];

        $this->actingAs($this->user)
            ->patch('/settings/profile', ['firstname' => 'Maria', 'lastname' => 'Santos', 'remove_avatar' => true])
            ->assertSessionHasNoErrors();

        expect($this->user->refresh()->avatar)->toBeNull()
            ->and($this->first->refresh()->avatar)->toBeNull()
            ->and($this->second->refresh()->avatar)->toBeNull();
        foreach ($files as $file) {
            Storage::disk('public')->assertMissing($file);
        }
    });

    test('an employee cannot give a birth date too recent to be working', function () {
        $this->actingAs($this->user)
            ->patch('/settings/profile', ['firstname' => 'Maria', 'lastname' => 'Santos', 'birthdate' => now()->subYears(10)->toDateString()])
            ->assertSessionHasErrors('birthdate');
    });

    test('username, role and position cannot be changed from the profile', function () {
        $this->actingAs($this->user)
            ->patch('/settings/profile', ['firstname' => 'Maria', 'lastname' => 'Santos', 'username' => 'boss', 'position' => 'Owner', 'date_started' => '2020-01-01'])
            ->assertSessionHasNoErrors();

        expect($this->user->refresh())->username->not->toBe('boss')->position->not->toBe('Owner');
        expect($this->first->refresh()->position)->toBe('Optometrist');
    });
});
