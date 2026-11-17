<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

test('guests are redirected to login from the reports page', function () {
    $this->get(route('reports.index'))->assertRedirect(route('login'));
});

test('the reports page opens for a signed-in user; each report keeps its own permission', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('reports.index'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('reports/index'));

    $this->actingAs($user)->get(route('reports.trial-balance.index'))->assertForbidden();
});
