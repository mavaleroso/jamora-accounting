<?php

namespace App\Enums;

enum RoleEnum: string
{
    case Admin = 'Admin';
    case FinanceManager = 'Finance Manager';
    case SeniorAccountant = 'Senior Accountant';
    case AccountingStaff = 'Accounting Staff';
    case Auditor = 'Auditor';
    case Management = 'Management';
}
