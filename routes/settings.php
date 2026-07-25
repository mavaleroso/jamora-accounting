<?php

use App\Http\Controllers\Settings\PasswordController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\TwoFactorAuthenticationController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth'])->group(function () {
    Route::redirect('settings', '/settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])
        ->middleware('permission:settings.profile.manage')
        ->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])
        ->middleware('permission:settings.profile.manage')
        ->name('profile.update');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])
        ->middleware('permission:settings.profile.manage')
        ->name('profile.destroy');

    Route::get('settings/password', [PasswordController::class, 'edit'])
        ->middleware('permission:settings.profile.manage')
        ->name('user-password.edit');

    Route::put('settings/password', [PasswordController::class, 'update'])
        ->middleware('permission:settings.profile.manage')
        ->middleware('throttle:6,1')
        ->name('user-password.update');

    Route::get('settings/appearance', function () {
        return Inertia::render('settings/appearance');
    })->middleware('permission:settings.profile.manage')->name('appearance.edit');

    Route::get('settings/two-factor', [TwoFactorAuthenticationController::class, 'show'])
        ->middleware('permission:settings.profile.manage')
        ->name('two-factor.show');
});
