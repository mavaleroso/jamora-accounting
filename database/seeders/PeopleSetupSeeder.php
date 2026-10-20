<?php

namespace Database\Seeders;

use App\Models\BenefitProgram;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\Holiday;
use App\Models\LeaveType;
use App\Models\ShiftTemplate;
use App\Services\People\LeaveService;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

class PeopleSetupSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Seed Leave Types Catalogue
        $leaveTypesConfig = config('people.leave_types', []);
        foreach ($leaveTypesConfig as $typeData) {
            LeaveType::updateOrCreate(
                ['code' => $typeData['code']],
                $typeData
            );
        }

        // 2. Seed National Regular & Special Holidays for current and surrounding years
        $currentYear = (int) date('Y');
        foreach ([$currentYear - 1, $currentYear, $currentYear + 1] as $yr) {
            $holidays = [
                ['holiday_date' => "{$yr}-01-01", 'name' => "New Year's Day", 'type' => 'regular'],
                ['holiday_date' => "{$yr}-04-09", 'name' => 'Araw ng Kagitingan', 'type' => 'regular'],
                ['holiday_date' => "{$yr}-05-01", 'name' => 'Labor Day', 'type' => 'regular'],
                ['holiday_date' => "{$yr}-06-12", 'name' => 'Independence Day', 'type' => 'regular'],
                ['holiday_date' => "{$yr}-08-25", 'name' => 'National Heroes Day', 'type' => 'regular'],
                ['holiday_date' => "{$yr}-11-30", 'name' => 'Bonifacio Day', 'type' => 'regular'],
                ['holiday_date' => "{$yr}-12-25", 'name' => 'Christmas Day', 'type' => 'regular'],
                ['holiday_date' => "{$yr}-12-30", 'name' => 'Rizal Day', 'type' => 'regular'],
                ['holiday_date' => "{$yr}-08-21", 'name' => 'Ninoy Aquino Day', 'type' => 'special'],
                ['holiday_date' => "{$yr}-11-01", 'name' => "All Saints' Day", 'type' => 'special'],
                ['holiday_date' => "{$yr}-12-08", 'name' => 'Feast of the Immaculate Conception', 'type' => 'special'],
                ['holiday_date' => "{$yr}-12-31", 'name' => 'Last Day of the Year', 'type' => 'special'],
            ];

            foreach ($holidays as $h) {
                Holiday::updateOrCreate(
                    ['entity_id' => null, 'holiday_date' => $h['holiday_date']],
                    $h
                );
            }
        }

        // 3. Shifts: each company's shift library starts with its default shift (config people.default_shift, 9:00 AM -
        // 6:00 PM), the one every employee works; more are added in Libraries › Shifts. Employees without rest days get
        // the company default.
        foreach (Entity::query()->pluck('id') as $entityId) {
            ShiftTemplate::ensureDefault((int) $entityId);
        }
        Employee::withoutEntityScope()
            ->whereNull('rest_days')
            ->update(['rest_days' => json_encode(config('people.default_rest_days', [0]))]);

        // 4. Seed Standard Statutory Benefit Programs (global or per entity)
        BenefitProgram::updateOrCreate(
            ['code' => 'SSS'],
            [
                'name' => 'Social Security System (SSS)',
                'category' => 'statutory',
                'payroll_mode' => 'statutory',
                'contribution_basis' => 'statutory_sss',
                'description' => 'Mandatory SSS monthly contributions and EC coverage',
                'is_active' => true,
            ]
        );

        BenefitProgram::updateOrCreate(
            ['code' => 'PHILHEALTH'],
            [
                'name' => 'Philippine Health Insurance (PhilHealth)',
                'category' => 'statutory',
                'payroll_mode' => 'statutory',
                'contribution_basis' => 'statutory_philhealth',
                'description' => 'Universal Health Care statutory premium',
                'is_active' => true,
            ]
        );

        BenefitProgram::updateOrCreate(
            ['code' => 'PAGIBIG'],
            [
                'name' => 'Home Development Mutual Fund (Pag-IBIG)',
                'category' => 'statutory',
                'payroll_mode' => 'statutory',
                'contribution_basis' => 'statutory_pagibig',
                'description' => 'Mandatory HDMF savings contribution',
                'is_active' => true,
            ]
        );

        // 5. Initialize leave balances for current employees
        $leaveService = app(LeaveService::class);
        $trackedTypes = LeaveType::where('balance_tracked', true)->where('is_active', true)->get();
        $employees = Employee::withoutEntityScope()->where('is_active', true)->get();

        foreach ($employees as $employee) {
            foreach ($trackedTypes as $type) {
                $leaveService->getOrCreateBalance($employee, $type, $currentYear);
            }
        }
    }
}

