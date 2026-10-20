<?php

use App\Models\Entity;
use App\Models\User;
use Spatie\Permission\Models\Role;

/** The dashboard is the accounting dashboard; the old /dashboard address points to it. */
test('guests are redirected to the login page', function () {
    $this->get('/dashboard')->assertRedirect(route('dashboard'));
    $this->get(route('dashboard'))->assertRedirect('/login');
});

test('authenticated users can visit the dashboard', function () {
    $entity = Entity::create(['code' => 'JAM', 'name' => 'JAM Opticus', 'is_active' => true]);
    $user = User::factory()->create();
    $user->assignRole(Role::findOrCreate('Accountant', 'web'));
    $user->entities()->attach($entity->id, ['is_default' => true]);

    $this->actingAs($user)->get('/dashboard')->assertRedirect(route('dashboard'));
    $this->actingAs($user)->withSession(['current_entity_id' => $entity->id])->get(route('dashboard'))->assertOk();
});
