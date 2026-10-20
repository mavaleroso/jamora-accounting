<?php

use App\Models\User;
use Spatie\Permission\Models\Role;

/** Users sign in with their username, and only with a role assigned. */
test('login screen can be rendered', function () {
    $response = $this->get('/login');

    $response->assertStatus(200);
});

test('users can authenticate using the login screen', function () {
    $user = User::factory()->create();
    $user->assignRole(Role::findOrCreate('Accountant', 'web'));

    $response = $this->post('/login', [
        'username' => $user->username,
        'password' => 'password',
    ]);

    $this->assertAuthenticatedAs($user);
    $response->assertRedirect(route('home', absolute: false));
});

test('users can not authenticate with invalid password', function () {
    $user = User::factory()->create();
    $user->assignRole(Role::findOrCreate('Accountant', 'web'));

    $this->post('/login', [
        'username' => $user->username,
        'password' => 'wrong-password',
    ]);

    $this->assertGuest();
});

test('users without a role can not authenticate', function () {
    $user = User::factory()->create();

    $this->post('/login', ['username' => $user->username, 'password' => 'password'])
        ->assertSessionHasErrors(['username' => 'Your account has no role assigned. Please contact an administrator.']);

    $this->assertGuest();
});

test('users can logout', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/logout');

    $this->assertGuest();
    $response->assertRedirect('/');
});
