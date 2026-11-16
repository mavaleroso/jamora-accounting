<?php

use App\Http\Middleware\AuditTrailMiddleware;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\KeepOpticalCurrent;
use App\Http\Middleware\RunDueTasks;
use App\Http\Middleware\SetCurrentEntity;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull;
use Illuminate\Foundation\Http\Middleware\TrimStrings;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Support\Env;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;
use Spatie\Permission\Middleware\RoleOrPermissionMiddleware;

// Keep this app's .env values to its own request, out of the process environment. Under a threaded server (Apache
// mod_php on Windows) every site shares one process, so putenv() would let one app's .env leak into another's request,
// e.g. optical-new's password check reading this app's database.
Env::disablePutenv();

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(append: [
            TrimStrings::class,
            ConvertEmptyStringsToNull::class,
            HandleAppearance::class,
            SetCurrentEntity::class,
            KeepOpticalCurrent::class,
            HandleInertiaRequests::class,
            AuditTrailMiddleware::class,
            RunDueTasks::class,
            // Cap the Link preload header so pages with many Vite chunks (e.g. Time & Attendance) never exceed
            // LiteSpeed / Hostinger's LSAPI response header size limit (8 KB), which otherwise causes a 500 error.
            AddLinkHeadersForPreloadedAssets::using(15),
        ]);

        $middleware->alias([
            'role' => RoleMiddleware::class,
            'permission' => PermissionMiddleware::class,
            'role_or_permission' => RoleOrPermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
