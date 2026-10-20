<?php

use App\Models\User;
use Spatie\Permission\Models\Role;

/** The home page only sends people where they belong. */
test('guests are sent to the login page', function () {
    $this->get('/')->assertRedirect(route('login'));
});

test('employees land on their portal and everyone else on the overview', function () {
    $employee = User::factory()->create();
    $employee->assignRole(Role::findOrCreate('Employee', 'web'));
    $this->actingAs($employee)->get('/')->assertRedirect(route('employee-management.portal.index'));

    $accountant = User::factory()->create();
    $accountant->assignRole(Role::findOrCreate('Accountant', 'web'));
    $this->actingAs($accountant)->get('/')->assertRedirect(route('overview'));
});
