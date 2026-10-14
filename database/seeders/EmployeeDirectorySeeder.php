<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\Entity;
use App\Models\LeaveType;
use App\Models\ShiftTemplate;
use App\Services\People\LeaveService;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

/**
 * 20 sample employees for the Employee Directory (default entity).
 *
 * Idempotent: rows are keyed on employee_code. Hire dates are relative to
 * today so probation timelines stay meaningful whenever this is run.
 * A few records are intentionally incomplete (missing gov't IDs / biometric).
 */
class EmployeeDirectorySeeder extends Seeder
{
    public function run(): void
    {
        $entity = Entity::query()->where('code', 'A_JAMORA')->first() ?? Entity::query()->first();

        if (! $entity) {
            $this->command?->warn('No entity found — run EntitySeeder first.');

            return;
        }

        $shifts = ShiftTemplate::query()->withoutGlobalScopes()
            ->where('entity_id', $entity->id)
            ->pluck('id', 'code');

        $today = Carbon::today();

        // [code, first, middle, last, sex, civil, position, department, type, status, hired (months ago), pay type, rate, shift, rest days, bio, complete IDs]
        $rows = [
            ['EMP-1001', 'Maria Teresa', 'Santos', 'Dela Cruz', 'female', 'married', 'Branch Manager', 'Administration & HR', 'regular', 'active', 74, 'monthly', 48000, 'REG-0817', [0], true, true],
            ['EMP-1002', 'Jose Miguel', 'Reyes', 'Bautista', 'male', 'married', 'Lead Optometrist', 'Clinical Optometry', 'regular', 'active', 62, 'monthly', 45000, 'REG-0817', [0], true, true],
            ['EMP-1003', 'Angelica', 'Ramos', 'Villanueva', 'female', 'single', 'Consultant Optometrist', 'Clinical Optometry', 'regular', 'active', 38, 'monthly', 38000, 'MALL-1019', [1], true, true],
            ['EMP-1004', 'Kristine Joy', 'Mendoza', 'Garcia', 'female', 'single', 'Senior Optical Stylist', 'Optical Sales & Lab', 'regular', 'active', 41, 'monthly', 24000, 'MALL-1019', [2], true, true],
            ['EMP-1005', 'Mark Anthony', 'Cruz', 'Navarro', 'male', 'married', 'Optical Technician & Edger', 'Optical Sales & Lab', 'regular', 'active', 55, 'monthly', 22000, 'REG-0817', [0], true, true],
            ['EMP-1006', 'Rhea Mae', 'Torres', 'Aquino', 'female', 'solo_parent', 'Finance & Accounting Officer', 'Finance & Accounting', 'regular', 'active', 29, 'monthly', 32000, 'REG-0817', [0, 6], true, true],
            ['EMP-1007', 'John Paul', 'Lim', 'Castillo', 'male', 'single', 'Sales Associate & Dispenser', 'Optical Sales & Lab', 'regular', 'active', 22, 'daily', 695, 'MALL-1019', [3], true, true],
            ['EMP-1008', 'Princess', 'Ocampo', 'Fernandez', 'female', 'single', 'Sales Associate & Dispenser', 'Optical Sales & Lab', 'regular', 'active', 18, 'daily', 695, 'CLOSE-1221', [4], true, true],
            ['EMP-1009', 'Carlo', 'Domingo', 'Mercado', 'male', 'single', 'Optical Technician & Edger', 'Optical Sales & Lab', 'regular', 'active', 15, 'daily', 720, 'REG-0817', [0], true, false],
            ['EMP-1010', 'Jasmine', 'Pascual', 'Rivera', 'female', 'married', 'Front Desk Receptionist', 'Front Desk & Cashiering', 'regular', 'active', 33, 'monthly', 19500, 'MALL-1019', [5], true, true],
            ['EMP-1011', 'Ramon', 'Salazar', 'Gonzales', 'male', 'widowed', 'Inventory & Billing Clerk', 'Finance & Accounting', 'regular', 'active', 47, 'monthly', 21000, 'REG-0817', [0], true, true],
            ['EMP-1012', 'Bianca', 'Velasco', 'Morales', 'female', 'single', 'Front Desk Receptionist', 'Front Desk & Cashiering', 'probationary', 'active', 4, 'daily', 695, 'CLOSE-1221', [1], true, false],
            ['EMP-1013', 'Kenneth', 'Ignacio', 'Santiago', 'male', 'single', 'Sales Associate & Dispenser', 'Optical Sales & Lab', 'probationary', 'active', 2, 'daily', 695, 'MALL-1019', [2], false, false],
            ['EMP-1014', 'Danica', 'Herrera', 'Flores', 'female', 'single', 'Consultant Optometrist', 'Clinical Optometry', 'probationary', 'active', 5, 'monthly', 34000, 'REG-0817', [0], true, true],
            // Probation already past 6 months without a regularization date -> "review due"
            ['EMP-1015', 'Paolo', 'Aguilar', 'De Leon', 'male', 'married', 'Optical Technician & Edger', 'Optical Sales & Lab', 'probationary', 'active', 7, 'daily', 720, 'REG-0817', [0], true, true],
            ['EMP-1016', 'Shiela', 'Cortez', 'Manalo', 'female', 'single', 'Sales Associate & Dispenser', 'Optical Sales & Lab', 'contractual', 'active', 3, 'daily', 695, 'CLOSE-1221', [3], false, false],
            ['EMP-1017', 'Vincent', 'Robles', 'Tan', 'male', 'single', 'Inventory & Billing Clerk', 'Finance & Accounting', 'project', 'active', 1, 'hourly', 95, 'REG-0817', [0, 6], true, false],
            ['EMP-1018', 'Lorraine', 'Esguerra', 'Padilla', 'female', 'married', 'Senior Optical Stylist', 'Optical Sales & Lab', 'regular', 'inactive', 26, 'monthly', 23000, 'MALL-1019', [1], true, true],
            ['EMP-1019', 'Eduardo', 'Valdez', 'Soriano', 'male', 'married', 'Optical Technician & Edger', 'Optical Sales & Lab', 'regular', 'separated', 51, 'monthly', 21500, 'REG-0817', [0], true, true],
            ['EMP-1020', 'Camille', 'Andrada', 'Lopez', 'female', 'single', 'Front Desk Receptionist', 'Front Desk & Cashiering', 'seasonal', 'active', 1, 'daily', 695, 'MALL-1019', [4], false, true],
        ];

        $banks = ['BDO Unibank', 'BPI', 'Metrobank', 'UnionBank', 'Landbank'];

        foreach ($rows as $i => [$code, $first, $middle, $last, $sex, $civil, $position, $department, $type, $status, $monthsAgo, $payType, $rate, $shiftCode, $restDays, $hasBio, $completeIds]) {
            $n = $i + 1;
            $hire = $today->copy()->subMonths($monthsAgo)->subDays(($n * 3) % 20);
            $isProbationary = $type === 'probationary';
            $separated = $status === 'separated';

            Employee::query()->withoutGlobalScopes()->updateOrCreate(
                ['entity_id' => $entity->id, 'employee_code' => $code],
                [
                    'firstname' => $first,
                    'middlename' => $middle,
                    'lastname' => $last,
                    'gender' => $sex,
                    'civil_status' => $civil,
                    'position' => $position,
                    'department' => $department,
                    'email' => strtolower(str_replace(' ', '', explode(' ', $first)[0]).'.'.str_replace(' ', '', $last)).'@jamoraoptics.com',
                    'phone' => sprintf('+63 9%02d %03d %04d', 15 + $n, 100 + $n * 37 % 900, 1000 + $n * 263 % 9000),
                    'biometric_id' => $hasBio ? (string) (100 + $n) : null,
                    'default_shift_template_id' => $shifts[$shiftCode] ?? null,
                    'rest_days' => $restDays,
                    'hire_date' => $hire->toDateString(),
                    'regularization_date' => $type === 'regular' ? $hire->copy()->addMonths(6)->toDateString() : null,
                    'separation_date' => $separated ? $today->copy()->subMonths(2)->endOfMonth()->toDateString() : null,
                    'employment_status' => $status,
                    'employment_type' => $type,
                    'pay_type' => $payType,
                    'basic_pay' => $rate,
                    'vacation_leave_credits' => $isProbationary ? 0 : 10,
                    'sick_leave_credits' => $isProbationary ? 0 : 10,
                    'sss_number' => sprintf('34-%07d-%d', 1200000 + $n * 7919, $n % 10),
                    'philhealth_number' => $completeIds || $n % 2 === 0 ? sprintf('12-%09d-%d', 250000000 + $n * 104729, ($n * 3) % 10) : null,
                    'pagibig_number' => $completeIds ? sprintf('1211-%04d-%04d', 1000 + $n * 17, 2000 + $n * 31) : null,
                    'tin' => $completeIds || $n % 3 === 0 ? sprintf('%03d-%03d-%03d-000', 400 + $n, 100 + $n * 7 % 900, 200 + $n * 13 % 800) : null,
                    'bank_name' => $banks[$i % count($banks)],
                    'bank_account_no' => sprintf('%04d-%04d-%04d', 10 + $n, 3000 + $n * 91, 5000 + $n * 57),
                    'is_active' => $status === 'active',
                ]
            );
        }

        $this->seedLeaveBalances($entity);

        $this->command?->info('Seeded 20 sample employees for '.$entity->name.'.');
    }

    private function seedLeaveBalances(Entity $entity): void
    {
        $types = LeaveType::query()->where('balance_tracked', true)->where('is_active', true)->get();

        if ($types->isEmpty()) {
            return;
        }

        $leaveService = app(LeaveService::class);
        $year = (int) date('Y');

        Employee::query()->withoutGlobalScopes()
            ->where('entity_id', $entity->id)
            ->where('employee_code', 'like', 'EMP-10%')
            ->where('is_active', true)
            ->get()
            ->each(fn (Employee $employee) => $types->each(fn (LeaveType $type) => $leaveService->getOrCreateBalance($employee, $type, $year)));
    }
}
