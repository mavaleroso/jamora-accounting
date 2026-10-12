<?php

namespace App\Enums;

enum RoleEnum: string
{
    case Admin = 'Admin';
    case FinanceManager = 'Finance Manager';
    case SeniorAccountant = 'Senior Accountant';
    case AccountingStaff = 'Accounting Staff';
    case FrontDeskBilling = 'Front-desk Billing';
    case Payroll = 'Payroll';
    case Auditor = 'Auditor';
    case Management = 'Management';
    case Employee = 'Employee';
}
