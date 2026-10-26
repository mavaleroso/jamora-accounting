<?php

use App\Models\AccountPeriodBalance;
use App\Models\AuditTrail;

/*
|--------------------------------------------------------------------------
| Audit trail
|--------------------------------------------------------------------------
| Every Eloquent create / update / delete / restore is recorded with its before and after values
| (App\Support\Audit\AuditLogger). Write requests that change no model through Eloquent (bulk
| query updates) are recorded as a request entry so no change goes unlogged.
*/

return [

    'enabled' => env('AUDIT_ENABLED', true),

    // Models never audited: the log itself, and derived data rebuilt from other audited records.
    'exclude_models' => [
        AuditTrail::class,
        AccountPeriodBalance::class,
    ],

    // Attributes left out of the diff (noise).
    'ignore_attributes' => ['created_at', 'updated_at', 'remember_token'],

    // Attributes recorded only as "changed" — the value is never stored.
    'masked_attributes' => [
        'password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at',
        'api_token', 'token', 'secret',
    ],

    // Request fields never stored in a request entry's payload.
    'masked_request_fields' => ['password', 'password_confirmation', 'current_password', 'new_password', 'token', '_token'],

    // Routes whose requests are never logged as request entries (model changes are still recorded).
    'exclude_routes' => ['audit-trails.*', 'login.store', 'logout', 'password.*', 'verification.*'],

    // Artisan commands that run unaudited (bulk setup, not user activity).
    'skip_commands' => ['db:seed', 'migrate', 'migrate:fresh', 'migrate:refresh', 'migrate:reset', 'migrate:rollback', 'db:wipe', 'test'],

    // Longest string value stored per attribute.
    'max_value_length' => 2000,
];
