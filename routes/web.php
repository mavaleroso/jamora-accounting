<?php

use App\Enums\RoleEnum;
use App\Http\Controllers\Accounting\AccountsController;
use App\Http\Controllers\Accounting\CashBankTransactionsController;
use App\Http\Controllers\Accounting\DashboardController;
use App\Http\Controllers\Accounting\GeneralLedgerController;
use App\Http\Controllers\Accounting\JournalEntriesController;
use App\Http\Controllers\Accounting\PeriodsController;
use App\Http\Controllers\Admin\AuditTrailsController;
use App\Http\Controllers\Admin\PermissionsController;
use App\Http\Controllers\Admin\RolesController;
use App\Http\Controllers\Admin\SystemSettingsController;
use App\Http\Controllers\Admin\UsersController;
use App\Http\Controllers\Ap\BillsController;
use App\Http\Controllers\Banks\BankAccountsController;
use App\Http\Controllers\Banks\ReconciliationsController;
use App\Http\Controllers\Billing\DepositsController;
use App\Http\Controllers\Billing\InvoicesController;
use App\Http\Controllers\EmployeeManagement\AttendanceController;
use App\Http\Controllers\EmployeeManagement\BenefitsAdministrationController;
use App\Http\Controllers\EmployeeManagement\ComplianceController;
use App\Http\Controllers\EmployeeManagement\EmployeeDashboardController;
use App\Http\Controllers\EmployeeManagement\EmployeePortalController;
use App\Http\Controllers\EmployeeManagement\EmployeeRequestsController;
use App\Http\Controllers\EmployeeManagement\LeaveManagementController;
use App\Http\Controllers\EmployeeManagement\MyPayController;
use App\Http\Controllers\EmployeeManagement\PeopleReportsController;
use App\Http\Controllers\EmployeeManagement\PerformanceEvaluationsController;
use App\Http\Controllers\EmployeeManagement\ShiftRosterController;
use App\Http\Controllers\EntitiesController;
use App\Http\Controllers\Integration\InventoryIntegrationController;
use App\Http\Controllers\Integration\OpticalSyncController;
use App\Http\Controllers\Libraries\AccountTypesController;
use App\Http\Controllers\Libraries\CostCentersController;
use App\Http\Controllers\Libraries\EmployeeOverviewController;
use App\Http\Controllers\Libraries\EmployeesController;
use App\Http\Controllers\Libraries\JournalsController;
use App\Http\Controllers\Libraries\PartnersController;
use App\Http\Controllers\Libraries\ShiftsController;
use App\Http\Controllers\Libraries\TaxCodesController;
use App\Http\Controllers\Libraries\VendorsController;
use App\Http\Controllers\OverviewController;
use App\Http\Controllers\Payroll\DtrController;
use App\Http\Controllers\Payroll\PayrollPeriodsController;
use App\Http\Controllers\Payroll\PayrollRunsController;
use App\Http\Controllers\Reports\ApAgingController;
use App\Http\Controllers\Reports\ArAgingController;
use App\Http\Controllers\Reports\BalanceSheetController;
use App\Http\Controllers\Reports\CashFlowController;
use App\Http\Controllers\Reports\IncomeStatementController;
use App\Http\Controllers\Reports\JournalRegisterController;
use App\Http\Controllers\Reports\OperationalReportsController;
use App\Http\Controllers\Reports\TrialBalanceController;
use App\Http\Controllers\ViewModeController;
use App\Services\Reports\OperationalReportService;
use App\Support\ViewMode;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    if (auth()->check()) {
        $user = auth()->user();
        // Employees, and an Admin in the employee view, land on their portal.
        if ($user->hasRole(RoleEnum::Employee->value) || app(ViewMode::class)->asEmployee($user)) {
            return redirect()->route('employee-management.portal.index');
        }

        // Everyone else lands on the Overview, which lists the modules they can access.
        return redirect()->route('overview');
    }

    return redirect()->route('login');
})->name('home');

Route::get('/dashboard', function () {
    return redirect()->route('dashboard');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/overview', [OverviewController::class, 'index'])->name('overview');

    Route::post('/entities/switch', [EntitiesController::class, 'switch'])->name('entities.switch');
    // An Admin who is also an employee switches between the admin and the employee view.
    Route::post('/view-mode', ViewModeController::class)->name('view-mode.switch');

    Route::get('/accounting/dashboard', [DashboardController::class, 'index'])
        ->name('dashboard');
    Route::post('/accounting/dashboard/data', [DashboardController::class, 'data'])
        ->name('dashboard.data')
        ->middleware('permission:dashboard.view');

    Route::prefix('accounting')->group(function () {
        Route::controller(JournalEntriesController::class)->prefix('journal-entries')->name('journal-entries.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:journals.view');
            Route::post('list', 'list')->name('list')->middleware('permission:journals.view');
            Route::get('create', 'create')->name('create')->middleware('permission:journals.create');
            Route::post('/', 'store')->name('store')->middleware('permission:journals.create');
            Route::post('approve-pending', 'approvePending')->name('approve-pending')->middleware('permission:journals.approve');
            Route::get('{journalEntry}', 'show')->name('show')->middleware('permission:journals.view');
            Route::get('{journalEntry}/edit', 'edit')->name('edit')->middleware('permission:journals.update');
            Route::put('{journalEntry}', 'update')->name('update')->middleware('permission:journals.update');
            Route::delete('{journalEntry}', 'destroy')->name('destroy')->middleware('permission:journals.delete');
            Route::post('{journalEntry}/post', 'post')->name('post')->middleware('permission:journals.post|journals.approve');
            Route::post('{journalEntry}/void', 'void')->name('void')->middleware('permission:journals.void');
        });

        Route::controller(GeneralLedgerController::class)->prefix('general-ledger')->name('general-ledger.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.general-ledger.view');
            Route::post('data', 'data')->name('data')->middleware('permission:reports.general-ledger.view');
            Route::get('export', 'export')->name('export')->middleware('permission:reports.general-ledger.view');
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

        Route::controller(CashBankTransactionsController::class)->prefix('cash-bank-records')->name('cash-bank.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:banks.view|journals.view');
            Route::post('/', 'store')->name('store')->middleware('permission:banks.manage|journals.create');
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

        Route::controller(ArAgingController::class)->prefix('ar-aging')->name('ar-aging.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.ar-aging.view');
            Route::post('data', 'data')->name('data')->middleware('permission:reports.ar-aging.view');
            Route::get('export', 'export')->name('export')->middleware('permission:reports.ar-aging.view');
        });

        Route::controller(ApAgingController::class)->prefix('ap-aging')->name('ap-aging.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:reports.ap-aging.view');
            Route::post('data', 'data')->name('data')->middleware('permission:reports.ap-aging.view');
            Route::get('export', 'export')->name('export')->middleware('permission:reports.ap-aging.view');
        });

        // Daily sales, VAT summary, COGS, collections by method, deposits liability (each checks its own permission).
        Route::controller(OperationalReportsController::class)->prefix('operations')->name('operations.')->group(function () {
            Route::get('{report}', 'show')->name('show')->whereIn('report', array_keys(OperationalReportService::REPORTS));
            Route::get('{report}/export', 'export')->name('export')->whereIn('report', array_keys(OperationalReportService::REPORTS));
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

        Route::controller(PartnersController::class)->prefix('partners')->name('partners.')->middleware('permission:libraries.partners.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{partner}', 'update')->name('update');
            Route::delete('{partner}', 'destroy')->name('destroy');
        });

        // The current company's shift library; whoever manages rosters may maintain it too.
        Route::controller(ShiftsController::class)->prefix('shifts')->name('shifts.')->middleware('permission:libraries.shifts.manage|roster.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{shift}', 'update')->name('update');
            Route::delete('{shift}', 'destroy')->name('destroy');
        });

        Route::controller(EmployeesController::class)->prefix('employees')->name('employees.')->middleware('permission:libraries.employees.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            // Profile view: balances, payroll, requests, time records and activity, loaded on open.
            // Employees of any company in the user's directory, not just the current one (resolved in the controllers).
            Route::get('{employee}/overview', EmployeeOverviewController::class)->name('overview')->whereNumber('employee');
            Route::put('{employee}', 'update')->name('update')->whereNumber('employee');
            Route::delete('{employee}', 'destroy')->name('destroy')->whereNumber('employee');
        });

        Route::controller(VendorsController::class)->prefix('vendors')->name('vendors.')->middleware('permission:libraries.vendors.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{vendor}', 'update')->name('update');
            Route::delete('{vendor}', 'destroy')->name('destroy');
        });
    });

    Route::prefix('billing')->name('billing.')->group(function () {
        Route::controller(InvoicesController::class)->prefix('invoices')->name('invoices.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:billing.view');
            Route::get('create', 'create')->name('create')->middleware('permission:billing.manage');
            Route::post('/', 'store')->name('store')->middleware('permission:billing.manage');
            Route::get('{invoice}', 'show')->name('show')->middleware('permission:billing.view');
            Route::post('{invoice}/confirm', 'confirm')->name('confirm')->middleware('permission:billing.manage');
            Route::post('{invoice}/collect', 'collect')->name('collect')->middleware('permission:billing.collect');
            Route::post('{invoice}/apply-deposit', 'applyDeposit')->name('apply-deposit')->middleware('permission:billing.collect');
            Route::delete('{invoice}', 'destroy')->name('destroy')->middleware('permission:billing.manage');
        });

        Route::controller(DepositsController::class)->prefix('deposits')->name('deposits.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:billing.view');
            Route::post('/', 'store')->name('store')->middleware('permission:billing.manage|billing.collect');
        });
    });

    Route::prefix('payroll')->name('payroll.')->group(function () {
        Route::controller(PayrollPeriodsController::class)->prefix('periods')->name('periods.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:payroll.view');
            Route::post('/', 'store')->name('store')->middleware('permission:payroll.manage');
            Route::post('generate', 'generate')->name('generate')->middleware('permission:payroll.manage');
            Route::put('{payrollPeriod}', 'update')->name('update')->middleware('permission:payroll.manage');
            Route::delete('{payrollPeriod}', 'destroy')->name('destroy')->middleware('permission:payroll.manage');
        });

        Route::controller(DtrController::class)->prefix('dtr')->name('dtr.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:payroll.view');
            Route::post('/', 'store')->name('store')->middleware('permission:payroll.manage');
            Route::post('import', 'import')->name('import')->middleware('permission:payroll.manage');
        });

        // Draft work (compute, adjust, void) needs payroll.manage; approving, posting and releasing need payroll.run.
        Route::controller(PayrollRunsController::class)->prefix('runs')->name('runs.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:payroll.view');
            Route::post('periods/{payrollPeriod}/compute', 'compute')->name('compute')->middleware('permission:payroll.manage|payroll.run');
            Route::get('{payrollRun}', 'show')->name('show')->middleware('permission:payroll.view');
            Route::get('{payrollRun}/export/{type}', 'export')->name('export')->middleware('permission:payroll.view');
            Route::post('{payrollRun}/recompute', 'recompute')->name('recompute')->middleware('permission:payroll.manage|payroll.run');
            Route::post('{payrollRun}/adjustments', 'storeAdjustment')->name('adjustments.store')->middleware('permission:payroll.manage');
            Route::delete('{payrollRun}/adjustments/{adjustment}', 'destroyAdjustment')->name('adjustments.destroy')->middleware('permission:payroll.manage');
            Route::post('{payrollRun}/void', 'void')->name('void')->middleware('permission:payroll.manage');
            Route::post('{payrollRun}/approve', 'approve')->name('approve')->middleware('permission:payroll.run');
            Route::post('{payrollRun}/reopen', 'reopen')->name('reopen')->middleware('permission:payroll.run');
            Route::post('{payrollRun}/post', 'post')->name('post')->middleware('permission:payroll.run');
            Route::post('{payrollRun}/pay', 'pay')->name('pay')->middleware('permission:payroll.run');
        });
    });

    Route::prefix('ap')->name('ap.')->group(function () {
        Route::controller(BillsController::class)->prefix('bills')->name('bills.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:ap.view');
            Route::get('create', 'create')->name('create')->middleware('permission:ap.manage');
            Route::post('/', 'store')->name('store')->middleware('permission:ap.manage');
            Route::get('{bill}', 'show')->name('show')->middleware('permission:ap.view');
            Route::delete('{bill}', 'destroy')->name('destroy')->middleware('permission:ap.manage');
            Route::post('{bill}/post', 'post')->name('post')->middleware('permission:ap.manage');
            Route::post('{bill}/pay', 'pay')->name('pay')->middleware('permission:ap.pay');
        });
    });

    Route::prefix('banks')->name('banks.')->group(function () {
        Route::controller(BankAccountsController::class)->prefix('accounts')->name('accounts.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:banks.view');
            Route::post('/', 'store')->name('store')->middleware('permission:banks.manage');
            Route::put('{bankAccount}', 'update')->name('update')->middleware('permission:banks.manage');
            Route::get('{bankAccount}', 'show')->name('show')->middleware('permission:banks.view');
        });

        Route::controller(ReconciliationsController::class)->prefix('reconciliations')->name('reconciliations.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:banks.view');
            Route::post('/', 'store')->name('store')->middleware('permission:banks.reconcile');
            Route::get('{bankReconciliation}', 'show')->name('show')->middleware('permission:banks.view');
            Route::post('{bankReconciliation}/items', 'toggleItems')->name('items')->middleware('permission:banks.reconcile');
            Route::post('{bankReconciliation}/complete', 'complete')->name('complete')->middleware('permission:banks.reconcile');
            Route::delete('{bankReconciliation}', 'destroy')->name('destroy')->middleware('permission:banks.reconcile');
        });
    });

    Route::prefix('admin')->group(function () {
        Route::controller(UsersController::class)->prefix('users')->name('users.')->middleware('permission:admin.users.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{user}', 'update')->name('update');
            Route::patch('{user}/rbac', 'updateRbac')->name('rbac.update');
            Route::patch('{user}/status', 'updateStatus')->name('status.update');
            Route::delete('{user}', 'destroy')->name('destroy')->middleware('role:'.RoleEnum::Admin->value);
        });

        Route::controller(RolesController::class)->prefix('roles')->name('roles.')->middleware('permission:admin.roles-permissions.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{role}', 'update')->name('update');
            Route::delete('{role}', 'destroy')->name('destroy');
            Route::post('{role}/assign', 'assign')->name('assign');
        });

        Route::controller(PermissionsController::class)->prefix('permissions')->name('permissions.')->middleware('permission:admin.roles-permissions.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::post('/', 'store')->name('store');
            Route::put('{permission}', 'update')->name('update');
            Route::delete('{permission}', 'destroy')->name('destroy');
        });

        Route::controller(AuditTrailsController::class)->prefix('audit-trails')->name('audit-trails.')->middleware('permission:admin.audit-trails.view')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::get('export', 'export')->name('export');
        });

        Route::controller(SystemSettingsController::class)->prefix('system-settings')->name('system-settings.')->middleware('permission:admin.system-settings.manage')->group(function () {
            Route::get('/', 'index')->name('index');
            Route::put('/', 'update')->name('update');
            Route::put('leave', 'updateLeave')->name('leave.update');
            Route::put('accounting', 'updateAccounting')->name('accounting.update');
        });
    });

    Route::prefix('integration/inventory')->name('integration.inventory.')->group(function () {
        Route::controller(InventoryIntegrationController::class)->group(function () {
            // Same gates as the sidebar link: integration staff, or accounting/billing who reconcile stock to the books.
            Route::get('/', 'index')->name('index')->middleware('permission:integration.optical.view|journals.view|billing.view');
            // Stock is recorded in the optical POS; accounting only reviews what the sync booked.
            Route::post('movements/{movement}/review', 'markReviewed')->name('movements.review')->middleware('permission:integration.optical.sync|journals.post|journals.create');
        });
    });

    Route::prefix('employee-management')->name('employee-management.')->group(function () {
        Route::get('/', [EmployeeDashboardController::class, 'index'])->name('dashboard')
            ->middleware('permission:attendance.manage|requests.approve|payroll.view|payroll.manage|payroll.run|roster.manage|libraries.employees.manage|compliance.view');

        Route::controller(ShiftRosterController::class)->prefix('roster')->name('roster.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:roster.view|payroll.view');
            Route::post('/', 'store')->name('store')->middleware('permission:roster.manage|payroll.manage');
            Route::post('publish', 'publish')->name('publish')->middleware('permission:roster.manage|payroll.manage');
            Route::post('copy-previous-week', 'copyPreviousWeek')->name('copy-previous')->middleware('permission:roster.manage|payroll.manage');
            // Shifts are added and edited in Libraries › Shifts.
            Route::delete('{roster}', 'destroy')->name('destroy')->middleware('permission:roster.manage|payroll.manage');
        });

        Route::controller(AttendanceController::class)->prefix('attendance')->name('attendance.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:attendance.view|payroll.view');
            Route::post('punch', 'recordPunch')->name('punch')->middleware('permission:attendance.punch|payroll.manage');
            Route::post('accomplishments', 'updateAccomplishment')->name('accomplishments.update')->middleware('permission:attendance.view|attendance.punch');
            Route::post('geofence', 'updateGeofence')->name('geofence')->middleware('permission:attendance.manage|payroll.manage');
            Route::post('requests', 'storeRequest')->name('requests.store')->middleware('permission:attendance.view|attendance.punch|payroll.view');
            Route::post('requests/{attendanceRequest}/review', 'reviewRequest')->name('requests.review')->middleware('permission:requests.approve');
            Route::post('requests/{attendanceRequest}/cancel', 'cancelRequest')->name('requests.cancel')->middleware('permission:attendance.view|attendance.punch|payroll.view');
            Route::post('daily-close', 'runDailyClose')->name('daily-close')->middleware('permission:attendance.manage|payroll.manage');
            Route::post('approve-bulk', 'approveBulk')->name('approve-bulk')->middleware('permission:attendance.manage|payroll.manage');
            Route::post('reopen-bulk', 'reopenBulk')->name('reopen-bulk')->middleware('permission:attendance.manage|payroll.manage');
            Route::post('{dtr}/verify', 'verifyPunch')->name('verify')->middleware('permission:attendance.manage|payroll.manage');
            Route::post('{dtr}/approve', 'approveDtr')->name('approve')->middleware('permission:attendance.manage|payroll.manage');
            Route::post('{dtr}/reject', 'rejectDtr')->name('reject')->middleware('permission:attendance.manage|payroll.manage');
            Route::post('{dtr}/reopen', 'reopenDtr')->name('reopen')->middleware('permission:attendance.manage|payroll.manage');
        });

        Route::controller(EmployeeRequestsController::class)->prefix('requests')->name('requests.')->group(function () {
            $any = 'permission:leave.view|leave.file|requests.approve|requests.manage|attendance.view|attendance.punch|attendance.manage|payroll.view|payroll.manage';
            Route::get('/', 'index')->name('index')->middleware($any);
            Route::post('/', 'store')->name('store')->middleware($any);
            Route::post('leave/{leaveRequest}/review', 'reviewLeave')->name('leave.review')->middleware('permission:requests.approve');
            Route::post('leave/{leaveRequest}/cancel', 'cancelLeave')->name('leave.cancel')->middleware($any);
            Route::get('leave/{leaveRequest}/attachment', 'leaveAttachment')->name('leave.attachment')->middleware($any);
            Route::post('attendance/{attendanceRequest}/review', 'reviewAttendance')->name('attendance.review')->middleware('permission:requests.approve');
            Route::post('attendance/{attendanceRequest}/cancel', 'cancelAttendance')->name('attendance.cancel')->middleware($any);
            Route::get('attendance/{attendanceRequest}/attachment', 'attendanceAttachment')->name('attendance.attachment')->middleware($any);
        });

        // Old Leave page address; leave is filed, decided and cancelled in Employee Requests.
        Route::get('leave', [LeaveManagementController::class, 'index'])->name('leave.index')
            ->middleware('permission:leave.view|leave.file|requests.approve|payroll.view');

        Route::controller(BenefitsAdministrationController::class)->prefix('benefits')->name('benefits.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:payroll.manage|libraries.employees.manage');
            Route::middleware('permission:payroll.manage|libraries.employees.manage')->group(function () {
                Route::post('programs', 'storeProgram')->name('programs.store');
                Route::put('programs/{benefitProgram}', 'updateProgram')->name('programs.update');
                Route::post('programs/{benefitProgram}/toggle', 'toggleProgram')->name('programs.toggle');
                Route::post('enroll', 'enroll')->name('enroll');
                Route::put('enrollments/{employeeBenefit}', 'updateEnrollment')->name('enrollments.update');
                Route::post('enrollments/{employeeBenefit}/end', 'endEnrollment')->name('enrollments.end');
                Route::delete('enrollments/{employeeBenefit}', 'destroyEnrollment')->name('enrollments.destroy');
            });
        });

        Route::controller(EmployeePortalController::class)->prefix('portal')->name('portal.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:portal.view|payroll.view');
        });

        // The employee's own pay history: payslips, contributions, tax and benefits.
        Route::get('my-pay', [MyPayController::class, 'index'])->name('my-pay.index')->middleware('permission:portal.view');

        Route::controller(PeopleReportsController::class)->prefix('reports')->name('reports.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:payroll.view|dashboard.view');
            Route::get('export', 'export')->name('export')->middleware('permission:payroll.view|dashboard.view');
        });

        // Performance reviews: reviewers write and share them; employees read and acknowledge their own.
        Route::controller(PerformanceEvaluationsController::class)->prefix('performance')->name('performance.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:evaluations.manage|portal.view');
            Route::post('/', 'store')->name('store')->middleware('permission:evaluations.manage');
            Route::put('{id}', 'update')->name('update')->whereNumber('id')->middleware('permission:evaluations.manage');
            Route::post('{id}/share', 'share')->name('share')->whereNumber('id')->middleware('permission:evaluations.manage');
            Route::delete('{id}', 'destroy')->name('destroy')->whereNumber('id')->middleware('permission:evaluations.manage');
            Route::post('{id}/acknowledge', 'acknowledge')->name('acknowledge')->whereNumber('id')->middleware('permission:portal.view');
        });

        // People Access moved into Admin › Roles & Permissions.
        Route::redirect('access', '/admin/roles?tab=users');

        Route::controller(ComplianceController::class)->prefix('compliance')->name('compliance.')->group(function () {
            Route::get('/', 'index')->name('index')->middleware('permission:compliance.view|compliance.manage|compliance.verify');
            Route::post('/', 'store')->name('store')->middleware('permission:compliance.manage');
            Route::post('generate-calendar', 'generateCalendar')->name('generate-calendar')->middleware('permission:compliance.manage');
            Route::get('{complianceItem}/evidence', 'evidence')->name('evidence')->middleware('permission:compliance.view|compliance.manage|compliance.verify');
            Route::post('{complianceItem}/status', 'updateStatus')->name('status')->middleware('permission:compliance.manage');
            Route::post('{complianceItem}/verify', 'verify')->name('verify')->middleware('permission:compliance.verify');
            Route::post('{complianceItem}/return', 'returnForCorrection')->name('return')->middleware('permission:compliance.verify');
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
                ->whereNumber('postingRule')
                ->middleware('permission:integration.optical.rules-manage');

            Route::post('/rules/services', 'saveServiceRule')
                ->name('rules.services.save')
                ->middleware('permission:integration.optical.rules-manage');

            Route::delete('/rules/services/{postingRule}', 'destroyServiceRule')
                ->name('rules.services.destroy')
                ->whereNumber('postingRule')
                ->middleware('permission:integration.optical.rules-manage');
        });
    });
});

require __DIR__.'/settings.php';
