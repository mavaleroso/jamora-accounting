<?php

use App\Models\User;

/** Accounts are created by an administrator (Admin › Users, or with an employee); nobody can sign themselves up. */
test('registration is turned off', function () {
    $this->get('/register')->assertNotFound();

    $this->post('/register', [
        'name' => 'Test User',
        'email' => 'test@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertNotFound();

    $this->assertGuest();
    expect(User::query()->where('email', 'test@example.com')->exists())->toBeFalse();
});
