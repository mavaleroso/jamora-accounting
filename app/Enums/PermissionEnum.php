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
    case ReportsArAgingView = 'reports.ar-aging.view';
    case ReportsApAgingView = 'reports.ap-aging.view';
    case ReportsVatSummaryView = 'reports.vat-summary.view';
    case ReportsDailySalesView = 'reports.daily-sales.view';
    case ReportsExport = 'reports.export';
    case IntegrationOpticalView = 'integration.optical.view';
    case IntegrationOpticalSync = 'integration.optical.sync';
    case IntegrationOpticalRulesManage = 'integration.optical.rules-manage';
    case LibrariesAccountTypesManage = 'libraries.account-types.manage';
    case LibrariesJournalsManage = 'libraries.journals.manage';
    case LibrariesCostCentersManage = 'libraries.cost-centers.manage';
    case LibrariesTaxCodesManage = 'libraries.tax-codes.manage';
    case LibrariesEmployeesManage = 'libraries.employees.manage';
    case LibrariesPartnersManage = 'libraries.partners.manage';
    case LibrariesVendorsManage = 'libraries.vendors.manage';
    case BillingView = 'billing.view';
    case BillingManage = 'billing.manage';
    case BillingCollect = 'billing.collect';
    case PayrollView = 'payroll.view';
    case PayrollManage = 'payroll.manage';
    case PayrollRun = 'payroll.run';
    case ApView = 'ap.view';
    case ApManage = 'ap.manage';
    case ApPay = 'ap.pay';
    case BanksView = 'banks.view';
    case BanksManage = 'banks.manage';
    case BanksReconcile = 'banks.reconcile';
    case AdminUsersManage = 'admin.users.manage';
    case AdminRolesPermissionsManage = 'admin.roles-permissions.manage';
    case AdminAuditTrailsView = 'admin.audit-trails.view';
    case SettingsProfileManage = 'settings.profile.manage';

    // Employee Management Permissions
    case AttendanceView = 'attendance.view';
    case AttendancePunch = 'attendance.punch';
    case AttendanceManage = 'attendance.manage';
    case LeaveView = 'leave.view';
    case LeaveFile = 'leave.file';
    case LeaveApprove = 'leave.approve';
    case RosterView = 'roster.view';
    case RosterManage = 'roster.manage';
    case PortalView = 'portal.view';
}
