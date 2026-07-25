<?php

use App\Http\Controllers\Accounting\AccountsController;
use App\Http\Controllers\Accounting\DashboardController;
use App\Http\Controllers\Accounting\GeneralLedgerController;
use App\Http\Controllers\Accounting\JournalEntriesController;
use App\Http\Controllers\Accounting\PeriodsController;
use App\Http\Controllers\Reports\BalanceSheetController;
use App\Http\Controllers\Reports\CashFlowController;
use App\Http\Controllers\Reports\IncomeStatementController;
use App\Http\Controllers\Reports\JournalRegisterController;
use App\Http\Controllers\Reports\TrialBalanceController;
use App\Http\Controllers\Admin\AuditTrailsController;
use App\Http\Controllers\Libraries\AccountTypesController;
use App\Http\Controllers\Libraries\CostCentersController;
use App\Http\Controllers\Libraries\JournalsController;
use App\Http\Controllers\Libraries\TaxCodesController;
use App\Http\Controllers\Admin\PermissionsController;
use App\Http\Controllers\Admin\RolesController;
use App\Http\Controllers\Admin\UsersController;
use App\Http\Controllers\Integration\OpticalSyncController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    if (auth()->check()) {
        return redirect()->route('dashboard');
    }

    return redirect()->route('login');
})->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/accounting/dashboard', [DashboardController::class, 'index'])
        ->name('dashboard')
        ->middleware('permission:dashboard.view');
    Route::post('/accounting/dashboard/data', [DashboardController::class, 'data'])
        ->name('dashboard.data')
        ->middleware('permission:dashboard.view');

    Route::prefix('accounting')->group(function () {
        Route::controller(JournalEntriesController::class)->prefix('journal-entries')->name('journal-entries.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:journals.view');
            Route::post('list', 'list')->name('list')->middleware('permission:journals.view');
            Route::get('create', 'create')->name('create')->middleware('permission:journals.create');
            Route::post('/', 'store')->name('store')->middleware('permission:journals.create');
            Route::get('{journalEntry}', 'show')->name('show')->middleware('permission:journals.view');
            Route::get('{journalEntry}/edit', 'edit')->name('edit')->middleware('permission:journals.update');
            Route::put('{journalEntry}', 'update')->name('update')->middleware('permission:journals.update');
            Route::delete('{journalEntry}', 'destroy')->name('destroy')->middleware('permission:journals.delete');
            Route::post('{journalEntry}/post', 'post')->name('post')->middleware('permission:journals.post');
            Route::post('{journalEntry}/void', 'void')->name('void')->middleware('permission:journals.void');
        });

        Route::controller(GeneralLedgerController::class)->prefix('general-ledger')->name('general-ledger.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.general-ledger.view');
            Route::post('data', 'data')->name('data')->middleware('permission:reports.general-ledger.view');
        });

        Route::controller(AccountsController::class)->prefix('chart-of-accounts')->name('chart-of-accounts.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:accounts.view');
            Route::post('/', 'store')->name('store')->middleware('permission:accounts.manage');
            Route::put('{account}', 'update')->name('update')->middleware('permission:accounts.manage');
            Route::delete('{account}', 'destroy')->name('destroy')->middleware('permission:accounts.manage');
        });

        Route::controller(PeriodsController::class)->prefix('periods')->name('periods.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:periods.view');
            Route::post('{period}/soft-close', 'softClose')->name('soft-close')->middleware('permission:periods.close');
            Route::post('{period}/close', 'close')->name('close')->middleware('permission:periods.close');
            Route::post('{period}/reopen', 'reopen')->name('reopen')->middleware('permission:periods.reopen');
        });
    });

    Route::prefix('reports')->name('reports.')->group(function () {
        Route::controller(TrialBalanceController::class)->prefix('trial-balance')->name('trial-balance.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.trial-balance.view');
            Route::post('data', 'data')->name('data')->middleware('permission:reports.trial-balance.view');
            Route::get('export', 'export')->name('export')->middleware('permission:reports.export');
        });

        Route::controller(IncomeStatementController::class)->prefix('income-statement')->name('income-statement.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.income-statement.view');
            Route::post('data', 'data')->name('data')->middleware('permission:reports.income-statement.view');
            Route::get('export', 'export')->name('export')->middleware('permission:reports.export|reports.income-statement.view');
        });

        Route::controller(BalanceSheetController::class)->prefix('balance-sheet')->name('balance-sheet.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.balance-sheet.view');
            Route::post('data', 'data')->name('data')->middleware('permission:reports.balance-sheet.view');
            Route::get('export', 'export')->name('export')->middleware('permission:reports.export|reports.balance-sheet.view');
        });

        Route::controller(CashFlowController::class)->prefix('cash-flow')->name('cash-flow.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.cash-flow.view');
            Route::post('data', 'data')->name('data')->middleware('permission:reports.cash-flow.view');
            Route::get('export', 'export')->name('export')->middleware('permission:reports.export|reports.cash-flow.view');
        });

        Route::controller(JournalRegisterController::class)->prefix('journal-register')->name('journal-register.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.journal-register.view');
            Route::post('list', 'list')->name('list')->middleware('permission:reports.journal-register.view');
            Route::get('export', 'export')->name('export')->middleware('permission:reports.export|reports.journal-register.view');
        });
    });

    Route::prefix('libraries')->group(function () {
        Route::controller(AccountTypesController::class)->prefix('account-types')->name('account-types.')->middleware('permission:libraries.account-types.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{accountType}', 'update')->name('update');
            Route::delete('{accountType}', 'destroy')->name('destroy');
        });

        Route::controller(JournalsController::class)->prefix('journal-types')->name('journal-types.')->middleware('permission:libraries.journals.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{journal}', 'update')->name('update');
            Route::delete('{journal}', 'destroy')->name('destroy');
        });

        Route::controller(CostCentersController::class)->prefix('cost-centers')->name('cost-centers.')->middleware('permission:libraries.cost-centers.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{costCenter}', 'update')->name('update');
            Route::delete('{costCenter}', 'destroy')->name('destroy');
        });

        Route::controller(TaxCodesController::class)->prefix('tax-codes')->name('tax-codes.')->middleware('permission:libraries.tax-codes.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{taxCode}', 'update')->name('update');
            Route::delete('{taxCode}', 'destroy')->name('destroy');
        });
    });

    Route::prefix('admin')->group(function () {
        Route::controller(UsersController::class)->prefix('users')->name('users.')->middleware('permission:admin.users.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{user}', 'update')->name('update');
            Route::patch('{user}/rbac', 'updateRbac')->name('rbac.update');
            Route::patch('{user}/status', 'updateStatus')->name('status.update');
        });

        Route::controller(RolesController::class)->prefix('roles')->name('roles.')->middleware('permission:admin.roles-permissions.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{role}', 'update')->name('update');
            Route::delete('{role}', 'destroy')->name('destroy');
        });

        Route::controller(PermissionsController::class)->prefix('permissions')->name('permissions.')->middleware('permission:admin.roles-permissions.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{permission}', 'update')->name('update');
            Route::delete('{permission}', 'destroy')->name('destroy');
        });

        Route::controller(AuditTrailsController::class)->prefix('audit-trails')->name('audit-trails.')->middleware('permission:admin.audit-trails.view')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('list', 'list')->name('list');
        });
    });

    Route::prefix('integration/optical')->name('integration.optical.')->group(function () {
        Route::controller(OpticalSyncController::class)->group(function () {
            Route::get('/', 'index')
                ->name('index')
                ->middleware('permission:integration.optical.view|integration.optical.sync');

            Route::post('/run', 'run')
                ->name('run')
                ->middleware('permission:integration.optical.sync');

            Route::get('/exceptions', 'exceptions')
                ->name('exceptions')
                ->middleware('permission:integration.optical.view|integration.optical.sync');

            Route::post('/exceptions/{syncDocument}/retry', 'retry')
                ->name('exceptions.retry')
                ->middleware('permission:integration.optical.sync');

            Route::get('/rules', 'rules')
                ->name('rules')
                ->middleware('permission:integration.optical.rules-manage');

            Route::put('/rules/{postingRule}', 'updateRule')
                ->name('rules.update')
                ->middleware('permission:integration.optical.rules-manage');
        });
    });
});

require __DIR__.'/settings.php';
