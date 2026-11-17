<?php

use App\Models\User;
use App\Support\ViewMode;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

uses(RefreshDatabase::class);

/*
 * Requests overlap: a slow one must not undo what a quicker one saved to the session while it ran (the admin/employee
 * view, the company open). Each request saves only what it changed itself.
 */

/** What another request, finishing while this one runs, leaves saved in the session. */
function savedMeanwhile(array $changes): void
{
    $session = session();
    $saved = [...$session->all(), ...$changes];
    $session->getHandler()->write($session->getId(), serialize($saved));
}

beforeEach(function () {
    Route::middleware('web')->get('/_test/slow-page', function () {
        // While this page is being built, the user switches to the employee view and changes something else.
        savedMeanwhile([ViewMode::SESSION_KEY => 'employee', 'another_choice' => 7]);

        return 'ok';
    });

    Route::middleware('web')->get('/_test/slow-page-that-writes', function () {
        savedMeanwhile([ViewMode::SESSION_KEY => 'employee']);
        session()->put('own_change', 'kept');
        session()->forget('own_removal');

        return 'ok';
    });
});

test('a slow request does not undo a switch saved while it ran', function () {
    $this->actingAs(User::factory()->create())
        ->withSession([ViewMode::SESSION_KEY => 'admin', 'another_choice' => 1])
        ->get('/_test/slow-page')
        ->assertOk()
        ->assertSessionHas(ViewMode::SESSION_KEY, 'employee')
        ->assertSessionHas('another_choice', 7);
});

test('a request still saves what it changed itself', function () {
    $this->actingAs(User::factory()->create())
        ->withSession([ViewMode::SESSION_KEY => 'admin', 'own_removal' => 'gone'])
        ->get('/_test/slow-page-that-writes')
        ->assertOk()
        ->assertSessionHas(ViewMode::SESSION_KEY, 'employee')
        ->assertSessionHas('own_change', 'kept')
        ->assertSessionMissing('own_removal');
});

test('switching the view is itself saved', function () {
    // Covered in full by ViewModeTest; here only that the merge keeps a request's own switch.
    Route::middleware('web')->post('/_test/switch', function () {
        session()->put(ViewMode::SESSION_KEY, 'employee');

        return 'ok';
    });

    $this->actingAs(User::factory()->create())
        ->withSession([ViewMode::SESSION_KEY => 'admin'])
        ->post('/_test/switch')
        ->assertOk()
        ->assertSessionHas(ViewMode::SESSION_KEY, 'employee');
});
