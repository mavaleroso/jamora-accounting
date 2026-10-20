<?php

namespace App\Enums;

/**
 * The company runs lean: the owner (Admin) directs and signs off, one Accountant does the
 * finance and admin work, an outsourced Accounting Retainer reviews it, and every employee
 * uses the self-service portal.
 */
enum RoleEnum: string
{
    case Admin = 'Admin';
    case Accountant = 'Accountant';
    case AccountingRetainer = 'Accounting Retainer';
    case Employee = 'Employee';

    /**
     * Sign-offs the Accountant prepares for but the owner gives: approving manual journal entries,
     * approving and releasing payroll, verifying statutory filings, closing / reopening periods, voiding posted entries,
     * deciding on employees' requests and handling them for employees,
     * plus user and access administration, company-wide system settings and the audit trail that oversees the Accountant.
     */
    public const OWNER_ONLY = [
        'admin.users.manage',
        'admin.roles-permissions.manage',
        'admin.audit-trails.view',
        'admin.system-settings.manage',
        'journals.approve',
        'journals.void',
        'periods.close',
        'periods.reopen',
        'payroll.run',
        'compliance.verify',
        'requests.approve',
        'requests.manage',
    ];

    /** Self-service keys a reviewer outside the company has no use for. */
    private const SELF_SERVICE = ['portal.view', 'attendance.punch', 'leave.file'];

    /**
     * Default permission keys for the role (seeded, and restored by the recalibration migration).
     *
     * @return list<string>
     */
    public function defaultPermissions(): array
    {
        $all = array_map(static fn (PermissionEnum $p) => $p->value, PermissionEnum::cases());

        return array_values(match ($this) {
            self::Admin => $all,
            // Everything day to day, including filing own leave and clocking in. Employees' requests, own
            // included, are decided by the owner.
            self::Accountant => array_diff($all, self::OWNER_ONLY),
            // Sees everything and signs off filings as the second person. Its only change to the books
            // is drafting adjusting entries, which reach the ledger when the owner approves them.
            self::AccountingRetainer => array_unique([
                ...array_filter($all, static fn (string $p) => str_ends_with($p, '.view') && ! in_array($p, self::SELF_SERVICE, true)),
                PermissionEnum::JournalsCreate->value,
                PermissionEnum::JournalsUpdate->value,
                PermissionEnum::ReportsExport->value,
                PermissionEnum::ComplianceVerify->value,
                PermissionEnum::SettingsProfileManage->value,
            ]),
            self::Employee => [
                PermissionEnum::AttendanceView->value,
                PermissionEnum::AttendancePunch->value,
                PermissionEnum::LeaveView->value,
                PermissionEnum::LeaveFile->value,
                PermissionEnum::RosterView->value,
                PermissionEnum::PortalView->value,
                PermissionEnum::SettingsProfileManage->value,
            ],
        });
    }
}
