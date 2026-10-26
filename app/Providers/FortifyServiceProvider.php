<?php

namespace App\Providers;

use App\Actions\Fortify\ResetUserPassword;
use App\Models\User;
use App\Services\Optical\OpticalApiClient;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Laravel\Fortify\Features;
use Laravel\Fortify\Fortify;

class FortifyServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureActions();
        $this->configureViews();
        $this->configureAuthentication();
        $this->configureRateLimiting();
    }

    /**
     * Configure Fortify actions.
     */
    private function configureActions(): void
    {
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
    }

    /**
     * Configure authentication behavior.
     */
    private function configureAuthentication(): void
    {
        Fortify::authenticateUsing(function (Request $request) {
            $username = $request->input(Fortify::username());
            $password = $request->input('password');

            if (! is_string($username) || $username === '' || ! is_string($password)) {
                return null;
            }

            $user = User::query()->where(Fortify::username(), $username)->first();

            if (! $user || ! $this->passwordMatches($user, $password)) {
                return null;
            }

            if ($user->status !== true) {
                throw ValidationException::withMessages([
                    Fortify::username() => 'Your account is inactive.',
                ]);
            }

            if (! $user->roles()->exists()) {
                throw ValidationException::withMessages([
                    Fortify::username() => 'Your account has no role assigned. Please contact an administrator.',
                ]);
            }

            return $user;
        });

        Fortify::confirmPasswordsUsing(fn (User $user, ?string $password) => is_string($password) && $this->passwordMatches($user, $password));
    }

    /**
     * With optical.password_check on, users copied from optical-new sign in with their optical-new password, which
     * optical-new checks; only when it can't be reached does the password kept here count. Off, it always counts.
     */
    private function passwordMatches(User $user, string $password): bool
    {
        if ($user->optical_user_id && config('optical.password_check')) {
            $valid = app(OpticalApiClient::class)->checkPassword((int) $user->optical_user_id, $password);

            if ($valid !== null) {
                return $valid;
            }
        }

        return Hash::check($password, $user->password);
    }

    /**
     * Configure Fortify views.
     */
    private function configureViews(): void
    {
        Fortify::loginView(fn (Request $request) => Inertia::render('auth/login', [
            'canResetPassword' => Features::enabled(Features::resetPasswords()),
            'status' => $request->session()->get('status'),
        ]));

        Fortify::resetPasswordView(fn (Request $request) => Inertia::render('auth/reset-password', [
            'email' => $request->email,
            'token' => $request->route('token'),
        ]));

        Fortify::requestPasswordResetLinkView(fn (Request $request) => Inertia::render('auth/forgot-password', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::verifyEmailView(fn (Request $request) => Inertia::render('auth/verify-email', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::confirmPasswordView(fn () => Inertia::render('auth/confirm-password'));
    }

    /**
     * Configure rate limiting.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('login', function (Request $request) {
            $throttleKey = Str::transliterate(Str::lower($request->input(Fortify::username())).'|'.$request->ip());

            return Limit::perMinute(5)->by($throttleKey);
        });
    }
}
