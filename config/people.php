<?php

/*
|--------------------------------------------------------------------------
| People / Employee Management Policy
|--------------------------------------------------------------------------
|
| Business rules for rostering, timekeeping, leave, benefits and statutory
| compliance. Defaults follow the Philippine Labor Code and current DOLE,
| SSS, PhilHealth, Pag-IBIG and BIR issuances. Company policy items are
| marked as such and may be tuned per deployment.
|
*/

return [

    /*
    | Schedule used when an employee has no published roster for the day and
    | no default shift template assigned.
    */
    'default_shift' => [
        'name' => 'Regular Day Shift (9:00 AM - 6:00 PM)',
        'start' => '09:00:00',
        'end' => '18:00:00',
        'break_minutes' => 60,
        'grace_minutes' => 5,
    ],

    // 0 = Sunday ... 6 = Saturday. Used when the employee has no rest_days set.
    'default_rest_days' => [0],

    'timekeeping' => [
        // Art. 83 - normal hours of work shall not exceed eight (8) hours a day.
        'regular_hours_per_day' => 8,
        // Company policy: after midnight, punches go to yesterday's open shift if it began within this many hours.
        'max_shift_hours' => 18,
        // Company policy: OT below this threshold is not counted.
        'ot_minimum_minutes' => 30,
        // Company policy: rendered OT is floored to blocks of N minutes.
        'ot_block_minutes' => 15,
        // Company policy: unpaid break between the end of regular hours and the start of OT, so with 60 a shift
        // ending at 6:00 PM counts OT from 7:00 PM. Default only; the owner sets it in Admin > System Settings.
        'ot_break_minutes' => 0,
        // Company policy: OT is not counted past this time of day ("H:i", e.g. "00:00" = midnight); null = no
        // ceiling. Default only; the owner sets it in Admin > System Settings.
        'ot_ceiling' => null,
        // Unpaid meal break deducted when no break punches are recorded and span exceeds this.
        'auto_break_after_minutes' => 300,
        // Company policy: an employee's preset break lasts exactly this long, on any shift that has a break.
        // Co-workers may share the same break time.
        'preset_break_minutes' => 60,
        // Company policy: a break started more than this many minutes from the employee's preset break time is
        // flagged as off-schedule (never refused).
        'break_tolerance_minutes' => 15,
        // Art. 86 - night shift differential: 10% for work between 10:00 PM and 6:00 AM.
        'night_diff_start' => '22:00',
        'night_diff_end' => '06:00',
        'night_diff_rate' => 0.10,
        // Factor used to derive the daily rate of monthly-paid employees (313 = 6-day work week, 261 = 5-day).
        'days_per_year' => 313,
    ],

    /*
    | DOLE premium pay multipliers (Labor Advisory on holiday pay, Arts. 87, 93, 94).
    | "day" = rate for the first 8 hours worked; "ot" = rate per OT hour.
    | "unworked" = pay for the day when not worked (fraction of daily rate).
    */
    'premiums' => [
        'regular' => ['day' => 1.00, 'ot' => 1.25, 'unworked' => 0.0],
        'rest_day' => ['day' => 1.30, 'ot' => 1.69, 'unworked' => 0.0],
        'special_holiday' => ['day' => 1.30, 'ot' => 1.69, 'unworked' => 0.0],
        'special_holiday_rest_day' => ['day' => 1.50, 'ot' => 1.95, 'unworked' => 0.0],
        'regular_holiday' => ['day' => 2.00, 'ot' => 2.60, 'unworked' => 1.0],
        'regular_holiday_rest_day' => ['day' => 2.60, 'ot' => 3.38, 'unworked' => 1.0],
    ],

    /*
    | Statutory contribution tables (monthly).
    */
    'statutory' => [
        // SSS 2025 schedule (RA 11199): 15% of MSC, ER 10% / EE 5%; MSC 5,000 - 35,000 in 500 steps.
        'sss' => [
            'rate_total' => 0.15,
            'rate_employee' => 0.05,
            'rate_employer' => 0.10,
            'msc_min' => 5000,
            'msc_max' => 35000,
            'msc_step' => 500,
            'ec_low' => 10,         // employer EC when MSC < 15,000
            'ec_high' => 30,        // employer EC when MSC >= 15,000
            'ec_threshold' => 15000,
        ],
        // PhilHealth (UHC Act): 5% premium, shared equally; floor 10,000 / ceiling 100,000.
        'philhealth' => [
            'rate' => 0.05,
            'floor' => 10000,
            'ceiling' => 100000,
        ],
        // Pag-IBIG (HDMF Circular 460): 2% EE / 2% ER, max fund salary 10,000; EE 1% when salary <= 1,500.
        'pagibig' => [
            'rate_employee' => 0.02,
            'rate_employee_low' => 0.01,
            'low_threshold' => 1500,
            'rate_employer' => 0.02,
            'max_fund_salary' => 10000,
        ],
    ],

    /*
    | Payroll policy.
    */
    'payroll' => [
        // How the monthly SSS / PhilHealth / Pag-IBIG contribution is deducted on a semi-monthly payroll:
        // "split" = half on each cut-off; "second_cutoff" = all on the 16th–end cut-off. Company policy.
        'contribution_schedule' => 'split',

        // Statutory minimum wage (daily) of the establishment's region. Minimum wage earners are exempt from
        // withholding tax on their SMW, holiday, OT, night differential and hazard pay (RR 11-2018, Sec. 2.78.1(B)(13)).
        // All three entities are in Butuan City: Caraga (Region XIII), PHP 475.00 for every sector (Wage Order RXIII-20,
        // second tranche effective 1 May 2026). Update per wage order / region.
        'minimum_wage_daily' => 475.00,

        // Default pay day for each cut-off of a generated period (day of month; 0 = last day of the month).
        'pay_days' => ['first' => 15, 'second' => 0],

        // BIR revised withholding tax table on compensation, effective 1 January 2023 (RR 11-2018, Annex E).
        // Each bracket: [over, base_tax, rate on excess over "over"].
        'withholding_tax' => [
            'semi_monthly' => [
                [0, 0, 0],
                [10417, 0, 0.15],
                [16667, 937.50, 0.20],
                [33333, 4270.70, 0.25],
                [83333, 16770.70, 0.30],
                [333333, 91770.70, 0.35],
            ],
            'monthly' => [
                [0, 0, 0],
                [20833, 0, 0.15],
                [33333, 1875.00, 0.20],
                [66667, 8541.80, 0.25],
                [166667, 33541.80, 0.30],
                [666667, 183541.80, 0.35],
            ],
        ],

        // General ledger accounts used when a payroll run is posted and released.
        'accounts' => [
            'salaries_expense' => ['code' => '6000', 'name' => 'Salaries and Wages', 'type' => 'Operating Expenses'],
            'employer_contributions' => ['code' => '6010', 'name' => 'Employer Statutory Contributions', 'type' => 'Operating Expenses'],
            'benefits_expense' => ['code' => '6020', 'name' => 'Employee Benefits Expense', 'type' => 'Operating Expenses'],
            'sss_payable' => ['code' => '2400', 'name' => 'SSS Payable', 'type' => 'Current Liabilities'],
            'philhealth_payable' => ['code' => '2410', 'name' => 'PhilHealth Payable', 'type' => 'Current Liabilities'],
            'pagibig_payable' => ['code' => '2420', 'name' => 'Pag-IBIG Payable', 'type' => 'Current Liabilities'],
            'withholding_tax_payable' => ['code' => '2430', 'name' => 'Withholding Tax Payable', 'type' => 'Current Liabilities'],
            'other_deductions_payable' => ['code' => '2440', 'name' => 'Other Payroll Deductions Payable', 'type' => 'Current Liabilities'],
            'benefits_payable' => ['code' => '2450', 'name' => 'Employee Benefits Payable', 'type' => 'Current Liabilities'],
            'salaries_payable' => ['code' => '2500', 'name' => 'Salaries Payable', 'type' => 'Current Liabilities'],
            // Net pay is released from each employee's registered payroll bank, to that bank's own Cash in Bank
            // sub-account (see ChartOfAccounts::ensureBankLedger).
        ],
    ],

    /*
    | Leave filing (company policy). Defaults only: the owner changes them in Admin > System Settings.
    */
    'leave' => [
        // Leave of the types below must be filed at least this many days before it starts.
        'min_notice_days' => 5,
        // Leave that can be planned. Sick, emergency, bereavement, maternity and paternity leave can't always be filed
        // ahead, so they keep only the notice set on their own leave type.
        'notice_leave_types' => ['VL', 'SIL', 'LWOP'],
    ],

    /*
    | Leave types seeded by PeopleSetupSeeder. "VL/SL/EL/BL" are company policy;
    | the rest are statutory. SIL is the legal minimum for staff without VL/SL:
    | 5 days a year once they have served a year, unused days paid in cash.
    */
    'leave_types' => [
        ['code' => 'VL', 'name' => 'Vacation Leave', 'legal_basis' => 'Company policy (satisfies Art. 95 SIL)', 'is_paid' => true, 'balance_tracked' => true, 'annual_entitlement' => 10, 'max_carry_over' => 5, 'is_convertible' => true, 'min_notice_days' => 3, 'sort_order' => 1],
        ['code' => 'SL', 'name' => 'Sick Leave', 'legal_basis' => 'Company policy (satisfies Art. 95 SIL)', 'is_paid' => true, 'balance_tracked' => true, 'annual_entitlement' => 10, 'max_carry_over' => 5, 'attachment_required_after_days' => 2, 'sort_order' => 2],
        ['code' => 'SIL', 'name' => 'Service Incentive Leave', 'legal_basis' => 'Labor Code Art. 95 (5 days/yr after 1 year of service)', 'is_paid' => true, 'balance_tracked' => true, 'annual_entitlement' => 5, 'prorate_first_year' => false, 'is_convertible' => true, 'min_service_months' => 12, 'sort_order' => 3],
        ['code' => 'EL', 'name' => 'Emergency Leave', 'legal_basis' => 'Company policy', 'is_paid' => true, 'balance_tracked' => true, 'annual_entitlement' => 3, 'sort_order' => 4],
        ['code' => 'ML', 'name' => 'Maternity Leave', 'legal_basis' => 'RA 11210 (105 days)', 'is_paid' => true, 'balance_tracked' => false, 'max_days_per_filing' => 105, 'counts_calendar_days' => true, 'gender' => 'female', 'attachment_required_after_days' => 0, 'allow_half_day' => false, 'sort_order' => 5],
        ['code' => 'PL', 'name' => 'Paternity Leave', 'legal_basis' => 'RA 8187 (7 days)', 'is_paid' => true, 'balance_tracked' => false, 'max_days_per_filing' => 7, 'gender' => 'male', 'attachment_required_after_days' => 0, 'allow_half_day' => false, 'sort_order' => 6],
        ['code' => 'BL', 'name' => 'Bereavement Leave', 'legal_basis' => 'Company policy', 'is_paid' => true, 'balance_tracked' => false, 'max_days_per_filing' => 3, 'allow_half_day' => false, 'sort_order' => 7],
        ['code' => 'LWOP', 'name' => 'Leave Without Pay', 'legal_basis' => 'Company policy', 'is_paid' => false, 'balance_tracked' => false, 'sort_order' => 8],
    ],

    /*
    | Statutory compliance calendar templates used by ComplianceCalendar.
    | due: [month_offset, day] relative to the covered month; day 0 = last day of that month.
    | when: monthly | quarter_end | year_end
    */
    'compliance_calendar' => [
        ['form_code' => '1601-C', 'agency' => 'BIR', 'title' => 'BIR 1601-C Monthly Remittance of Withholding Tax on Compensation', 'category' => 'statutory_tax', 'frequency' => 'monthly', 'when' => 'monthly', 'due' => [1, 10], 'owner_role' => 'Accounting'],
        ['form_code' => 'SSS-R5', 'agency' => 'SSS', 'title' => 'SSS Contribution Payment (PRN) & R3 Collection List', 'category' => 'statutory_payroll', 'frequency' => 'monthly', 'when' => 'monthly', 'due' => [1, 0], 'owner_role' => 'HR / Payroll'],
        ['form_code' => 'PHIC-RF1', 'agency' => 'PHIC', 'title' => 'PhilHealth Premium Remittance (RF-1 / EPRS)', 'category' => 'statutory_payroll', 'frequency' => 'monthly', 'when' => 'monthly', 'due' => [1, 15], 'owner_role' => 'HR / Payroll'],
        ['form_code' => 'HDMF-MCRF', 'agency' => 'HDMF', 'title' => 'Pag-IBIG Monthly Contribution Remittance (MCRF)', 'category' => 'statutory_payroll', 'frequency' => 'monthly', 'when' => 'monthly', 'due' => [1, 15], 'owner_role' => 'HR / Payroll'],
        ['form_code' => '0619-E', 'agency' => 'BIR', 'title' => 'BIR 0619-E Monthly Remittance of Creditable Withholding Tax (Expanded)', 'category' => 'statutory_tax', 'frequency' => 'monthly', 'when' => 'monthly_non_quarter', 'due' => [1, 10], 'owner_role' => 'Accounting'],
        ['form_code' => '1601-EQ', 'agency' => 'BIR', 'title' => 'BIR 1601-EQ Quarterly Remittance of Creditable Withholding Tax + QAP', 'category' => 'statutory_tax', 'frequency' => 'quarterly', 'when' => 'quarter_end', 'due' => [1, 0], 'owner_role' => 'Accounting'],
        ['form_code' => '2550Q', 'agency' => 'BIR', 'title' => 'BIR 2550Q Quarterly VAT Return', 'category' => 'statutory_tax', 'frequency' => 'quarterly', 'when' => 'quarter_end', 'due' => [1, 25], 'owner_role' => 'Accounting'],
        ['form_code' => '13TH-MONTH', 'agency' => 'DOLE', 'title' => '13th Month Pay Release (PD 851)', 'category' => 'statutory_payroll', 'frequency' => 'annual', 'when' => 'year_end', 'due' => [0, 24], 'owner_role' => 'HR / Payroll'],
        ['form_code' => '13TH-REPORT', 'agency' => 'DOLE', 'title' => 'DOLE 13th Month Pay Compliance Report', 'category' => 'regulatory', 'frequency' => 'annual', 'when' => 'year_end', 'due' => [1, 15], 'owner_role' => 'HR / Payroll'],
        ['form_code' => '1604-C', 'agency' => 'BIR', 'title' => 'BIR 1604-C Annual Information Return + Alphalist', 'category' => 'statutory_tax', 'frequency' => 'annual', 'when' => 'year_end', 'due' => [1, 31], 'owner_role' => 'Accounting'],
        ['form_code' => '2316', 'agency' => 'BIR', 'title' => 'BIR 2316 Issuance to Employees', 'category' => 'statutory_tax', 'frequency' => 'annual', 'when' => 'year_end', 'due' => [1, 31], 'owner_role' => 'HR / Payroll'],
        ['form_code' => 'BP-RENEWAL', 'agency' => 'LGU', 'title' => "Mayor's / Business Permit Renewal", 'category' => 'local_government', 'frequency' => 'annual', 'when' => 'year_end', 'due' => [1, 20], 'owner_role' => 'Admin'],
        ['form_code' => 'DOLE-AEDR', 'agency' => 'DOLE', 'title' => 'DOLE Annual Work Accident / Illness Exposure Data Report (AEDR)', 'category' => 'regulatory', 'frequency' => 'annual', 'when' => 'year_end', 'due' => [1, 30], 'owner_role' => 'HR'],
    ],
];
