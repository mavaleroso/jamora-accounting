<?php

namespace App\Enums;

enum PermissionEnum: string
{
    case DashboardView = 'dashboard.view';
    case AccountsView = 'accounts.view';
    case AccountsManage = 'accounts.manage';
    case JournalsView = 'journals.view';
    case JournalsCreate = 'journals.create';
    case JournalsUpdate = 'journals.update';
    case JournalsDelete = 'journals.delete';
    case JournalsPost = 'journals.post';
    case JournalsVoid = 'journals.void';
    case JournalsApprove = 'journals.approve';
    case PeriodsView = 'periods.view';
    case PeriodsManage = 'periods.manage';
    case PeriodsClose = 'periods.close';
    case PeriodsReopen = 'periods.reopen';
    case ReportsTrialBalanceView = 'reports.trial-balance.view';
    case ReportsGeneralLedgerView = 'reports.general-ledger.view';
    case ReportsJournalRegisterView = 'reports.journal-register.view';
    case ReportsIncomeStatementView = 'reports.income-statement.view';
    case ReportsBalanceSheetView = 'reports.balance-sheet.view';
    case ReportsCashFlowView = 'reports.cash-flow.view';
    case ReportsExport = 'reports.export';
    case IntegrationOpticalView = 'integration.optical.view';
    case IntegrationOpticalSync = 'integration.optical.sync';
    case IntegrationOpticalRulesManage = 'integration.optical.rules-manage';
    case LibrariesAccountTypesManage = 'libraries.account-types.manage';
    case LibrariesJournalsManage = 'libraries.journals.manage';
    case LibrariesCostCentersManage = 'libraries.cost-centers.manage';
    case LibrariesTaxCodesManage = 'libraries.tax-codes.manage';
    case AdminUsersManage = 'admin.users.manage';
    case AdminRolesPermissionsManage = 'admin.roles-permissions.manage';
    case AdminAuditTrailsView = 'admin.audit-trails.view';
    case SettingsProfileManage = 'settings.profile.manage';
}
