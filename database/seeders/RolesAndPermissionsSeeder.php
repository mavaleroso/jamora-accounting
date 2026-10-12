<?php

namespace Database\Seeders;

use App\Enums\PermissionEnum;
use App\Enums\RoleEnum;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = array_map(
            static fn (PermissionEnum $permission) => $permission->value,
            PermissionEnum::cases()
        );

        foreach ($permissions as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        $admin = Role::findOrCreate(RoleEnum::Admin->value, 'web');
        $financeManager = Role::findOrCreate(RoleEnum::FinanceManager->value, 'web');
        $seniorAccountant = Role::findOrCreate(RoleEnum::SeniorAccountant->value, 'web');
        $accountingStaff = Role::findOrCreate(RoleEnum::AccountingStaff->value, 'web');
        $frontDesk = Role::findOrCreate(RoleEnum::FrontDeskBilling->value, 'web');
        $payroll = Role::findOrCreate(RoleEnum::Payroll->value, 'web');
        $auditor = Role::findOrCreate(RoleEnum::Auditor->value, 'web');
        $management = Role::findOrCreate(RoleEnum::Management->value, 'web');
        $employee = Role::findOrCreate(RoleEnum::Employee->value, 'web');

        $admin->syncPermissions($permissions);

        $financeManager->syncPermissions(array_values(array_filter(
            $permissions,
            static fn (string $permission) => ! in_array($permission, [
                PermissionEnum::AdminUsersManage->value,
                PermissionEnum::AdminRolesPermissionsManage->value,
            ], true)
        )));

        $seniorAccountant->syncPermissions([
            PermissionEnum::DashboardView->value,
            PermissionEnum::AccountsView->value,
            PermissionEnum::AccountsManage->value,
            PermissionEnum::JournalsView->value,
            PermissionEnum::JournalsCreate->value,
            PermissionEnum::JournalsUpdate->value,
            PermissionEnum::JournalsPost->value,
            PermissionEnum::PeriodsView->value,
            PermissionEnum::ReportsTrialBalanceView->value,
            PermissionEnum::ReportsGeneralLedgerView->value,
            PermissionEnum::ReportsJournalRegisterView->value,
            PermissionEnum::ReportsIncomeStatementView->value,
            PermissionEnum::ReportsBalanceSheetView->value,
            PermissionEnum::ReportsCashFlowView->value,
            PermissionEnum::ReportsArAgingView->value,
            PermissionEnum::ReportsApAgingView->value,
            PermissionEnum::ReportsVatSummaryView->value,
            PermissionEnum::ReportsDailySalesView->value,
            PermissionEnum::ReportsExport->value,
            PermissionEnum::IntegrationOpticalView->value,
            PermissionEnum::LibrariesAccountTypesManage->value,
            PermissionEnum::LibrariesJournalsManage->value,
            PermissionEnum::LibrariesCostCentersManage->value,
            PermissionEnum::LibrariesTaxCodesManage->value,
            PermissionEnum::LibrariesEmployeesManage->value,
            PermissionEnum::LibrariesPartnersManage->value,
            PermissionEnum::LibrariesVendorsManage->value,
            PermissionEnum::BillingView->value,
            PermissionEnum::BillingManage->value,
            PermissionEnum::BillingCollect->value,
            PermissionEnum::PayrollView->value,
            PermissionEnum::ApView->value,
            PermissionEnum::ApManage->value,
            PermissionEnum::ApPay->value,
            PermissionEnum::BanksView->value,
            PermissionEnum::BanksManage->value,
            PermissionEnum::BanksReconcile->value,
            PermissionEnum::SettingsProfileManage->value,
        ]);

        $accountingStaff->syncPermissions([
            PermissionEnum::DashboardView->value,
            PermissionEnum::AccountsView->value,
            PermissionEnum::JournalsView->value,
            PermissionEnum::JournalsCreate->value,
            PermissionEnum::JournalsUpdate->value,
            PermissionEnum::ReportsTrialBalanceView->value,
            PermissionEnum::ReportsGeneralLedgerView->value,
            PermissionEnum::ReportsArAgingView->value,
            PermissionEnum::ReportsApAgingView->value,
            PermissionEnum::IntegrationOpticalView->value,
            PermissionEnum::BillingView->value,
            PermissionEnum::BillingManage->value,
            PermissionEnum::ApView->value,
            PermissionEnum::ApManage->value,
            PermissionEnum::BanksView->value,
            PermissionEnum::SettingsProfileManage->value,
        ]);

        $frontDesk->syncPermissions([
            PermissionEnum::DashboardView->value,
            PermissionEnum::BillingView->value,
            PermissionEnum::BillingManage->value,
            PermissionEnum::BillingCollect->value,
            PermissionEnum::LibrariesPartnersManage->value,
            PermissionEnum::ReportsDailySalesView->value,
            PermissionEnum::ReportsArAgingView->value,
            PermissionEnum::SettingsProfileManage->value,
        ]);

        $payroll->syncPermissions([
            PermissionEnum::DashboardView->value,
            PermissionEnum::LibrariesEmployeesManage->value,
            PermissionEnum::PayrollView->value,
            PermissionEnum::PayrollManage->value,
            PermissionEnum::PayrollRun->value,
            PermissionEnum::AttendanceView->value,
            PermissionEnum::AttendancePunch->value,
            PermissionEnum::AttendanceManage->value,
            PermissionEnum::LeaveView->value,
            PermissionEnum::LeaveFile->value,
            PermissionEnum::LeaveApprove->value,
            PermissionEnum::RosterView->value,
            PermissionEnum::RosterManage->value,
            PermissionEnum::PortalView->value,
            PermissionEnum::SettingsProfileManage->value,
        ]);

        $employee->syncPermissions([
            PermissionEnum::AttendanceView->value,
            PermissionEnum::AttendancePunch->value,
            PermissionEnum::LeaveView->value,
            PermissionEnum::LeaveFile->value,
            PermissionEnum::RosterView->value,
            PermissionEnum::PortalView->value,
            PermissionEnum::SettingsProfileManage->value,
        ]);

        $viewPermissions = array_values(array_filter(
            $permissions,
            static fn (string $permission) => str_ends_with($permission, '.view')
        ));

        $auditor->syncPermissions(array_values(array_unique(array_merge(
            $viewPermissions,
            [
                PermissionEnum::ReportsExport->value,
                PermissionEnum::SettingsProfileManage->value,
            ]
        ))));

        $management->syncPermissions([
            PermissionEnum::DashboardView->value,
            PermissionEnum::ReportsIncomeStatementView->value,
            PermissionEnum::ReportsBalanceSheetView->value,
            PermissionEnum::ReportsCashFlowView->value,
            PermissionEnum::ReportsArAgingView->value,
            PermissionEnum::ReportsApAgingView->value,
            PermissionEnum::ReportsDailySalesView->value,
            PermissionEnum::SettingsProfileManage->value,
        ]);
    }
}
