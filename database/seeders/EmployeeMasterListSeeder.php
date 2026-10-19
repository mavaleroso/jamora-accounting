<?php

namespace Database\Seeders;

use App\Enums\RoleEnum;
use App\Models\AttendanceRequest;
use App\Models\BenefitProgram;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\Entity;
use App\Models\LeaveBalance;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Payslip;
use App\Models\ShiftRoster;
use App\Models\ShiftTemplate;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * The owner's "Employee Master List" and "Benefits & Entitlements" sheets (JAM Opticus Group), applied to the
 * employee records the optical-new user sync created. Run it after that sync:
 *
 *   php artisan db:seed --class=EmployeeMasterListSeeder
 *
 * Birth dates, address, contact number, position and hire date on the sheets already come from optical-new. What the
 * sheets and the owner's follow-up (the complete ID numbers and the daily wages) add, per employee listed with an
 * employer:
 *   - Employer (AJOC = A. Jamora Optical, ALJO = AL Jamora Optical) and employee ID number (the employee code).
 *   - Daily wage, working 6 days a week of 8 hours: payroll's defaults (313 paid days a year, Sunday off, 8-hour day).
 *   - Leave: no VL / SL ("n.a." on the sheet); Service Incentive Leave of 5 days a year after one year of service
 *     (Art. 95), with maternity, paternity and leave without pay. Overtime, holiday pay and 13th month pay follow the
 *     law, as payroll already does.
 *   - Transportation allowance of ₱50 per day worked; communication provided by the company (in kind).
 *   - Perfect attendance bonus from 2027, amount not fixed yet (tracked only).
 *
 * Idempotent and never overrides HR: a program or enrollment that exists is left as it is, leave types are set only
 * while the employee still has "all", pay only while it is still zero, and an employee who already has time, leave or
 * pay records is not moved.
 */
class EmployeeMasterListSeeder extends Seeder
{
    /** Leave types for staff without company VL / SL / emergency / bereavement leave. */
    private const LEAVE_TYPES = ['SIL', 'ML', 'PL', 'LWOP'];

    private const PERFECT_ATTENDANCE_FROM = '2027-01-01';

    /**
     * [last name, first name, employer, employee ID no., daily wage ₱, transport ₱ per day, communication provided].
     * Doc Ann is Mary Ann Almonguera; Doc Lawrence is Joseph Lawrence Jamora.
     *
     * @var list<array{0: string, 1: string, 2: string, 3: string, 4: float, 5: ?float, 6: bool}>
     */
    private const EMPLOYEES = [
        ['Carillo', 'Roselyn', 'JAM_OPTICUS', '002', 475.00, null, true],
        ['Cabunagan', 'Sheila Mae', 'JAM_OPTICUS', '014', 475.00, 50.0, true],
        ['Banias', 'Leah', 'A_JAMORA', '122', 475.00, null, false],
        ['Calimas', 'Jerome', 'A_JAMORA', '101', 475.00, null, false],
        ['Estobo', 'Ed John', 'AL_JAMORA', '1108', 475.00, null, false],
        ['Garcia', 'Juniza', 'A_JAMORA', '088', 475.00, null, false],
        ['Llena', 'Sharmila', 'AL_JAMORA', '1107', 475.00, null, true],
        ['Jamora', 'Joseph Lawrence', 'AL_JAMORA', '103', 1533.54, null, false],
        ['Almonguera', 'Mary Ann', 'A_JAMORA', '012', 1533.54, null, false],
        ['Lozano', 'Jowie', 'A_JAMORA', '040', 540.00, null, false],
        ['Tanieo', 'Jeffrey', 'A_JAMORA', '1109', 475.00, null, false],
    ];

    /** @var array<string, BenefitProgram> */
    private array $programs = [];

    public function run(): void
    {
        $entities = Entity::query()->pluck('id', 'code');
        $leaveTypeIds = $this->leaveTypeIds();
        $this->programs = $this->programs();
        $today = now()->toDateString();

        foreach (self::EMPLOYEES as [$last, $first, $entityCode, $number, $dailyWage, $transportPerDay, $communication]) {
            $matches = Employee::query()->withoutGlobalScopes()->whereNull('deleted_at')
                ->where('lastname', $last)->where('firstname', $first)->get();

            if ($matches->count() !== 1) {
                $this->command?->warn("{$first} {$last}: ".($matches->isEmpty() ? 'no employee record (run the optical-new sync first)' : 'more than one employee record').' — skipped.');

                continue;
            }

            $employee = $matches->first();
            $entityId = $entities[$entityCode] ?? null;
            if ($entityId === null) {
                $this->command?->warn("{$first} {$last}: entity {$entityCode} does not exist — skipped.");

                continue;
            }

            DB::transaction(function () use ($employee, $entityId, $number, $dailyWage, $leaveTypeIds, $transportPerDay, $communication, $today) {
                $this->moveTo($employee, (int) $entityId);
                $this->setEmployeeNumber($employee, $number);

                // A rate HR has set is kept.
                if ((float) $employee->basic_pay <= 0) {
                    $employee->pay_type = 'daily';
                    $employee->basic_pay = $dailyWage;
                }

                // "All leave types" is the default; a list HR picked is kept.
                if ($employee->leave_type_ids === null) {
                    $employee->leave_type_ids = $leaveTypeIds;
                }
                $employee->save();

                if ($transportPerDay !== null) {
                    $this->enroll($employee, 'TRANSPORT_DAILY', $transportPerDay, $today);
                }
                if ($communication) {
                    $this->enroll($employee, 'COMMUNICATION', 0, $today);
                }
                $this->enroll($employee, 'PERFECT_ATTENDANCE', 0, self::PERFECT_ATTENDANCE_FROM, 'Amount not fixed yet.');
            });

            $this->command?->info("{$employee->name}: {$employee->employee_code}, {$entityCode}, ₱".number_format((float) $employee->basic_pay, 2)." {$employee->pay_type}.");
        }
    }

    /**
     * @return list<int>
     */
    private function leaveTypeIds(): array
    {
        // SIL may be missing from a leave catalogue set up before it was added.
        $sil = collect(config('people.leave_types', []))->firstWhere('code', 'SIL');
        if ($sil) {
            LeaveType::query()->firstOrCreate(['code' => 'SIL'], $sil);
        }

        return LeaveType::query()->whereIn('code', self::LEAVE_TYPES)->orderBy('sort_order')->pluck('id')->all();
    }

    /**
     * Shared by every branch, since the employees work for all three entities.
     *
     * @return array<string, BenefitProgram>
     */
    private function programs(): array
    {
        $programs = [
            'TRANSPORT_DAILY' => [
                'name' => 'Transportation Allowance', 'category' => 'allowance',
                'payroll_mode' => BenefitProgram::MODE_EARNING, 'contribution_basis' => BenefitProgram::BASIS_PER_DAY,
                'default_employer_share' => 50, 'is_taxable' => true,
                'description' => 'Paid for each day worked. A cash allowance is taxable compensation.',
            ],
            'COMMUNICATION' => [
                'name' => 'Communication (company-provided)', 'category' => 'company',
                'payroll_mode' => BenefitProgram::MODE_NONE, 'contribution_basis' => BenefitProgram::BASIS_FIXED,
                'default_employer_share' => 0, 'is_taxable' => false,
                'description' => 'The company provides the phone or load; nothing is paid through payroll.',
            ],
            'PERFECT_ATTENDANCE' => [
                'name' => 'Perfect Attendance Bonus', 'category' => 'company',
                'payroll_mode' => BenefitProgram::MODE_NONE, 'contribution_basis' => BenefitProgram::BASIS_FIXED,
                'default_employer_share' => 0, 'is_taxable' => false,
                'description' => 'From 2027. The amount is not fixed yet: pay it as a payroll adjustment once it is set.',
            ],
        ];

        return collect($programs)->map(fn (array $values, string $code) => BenefitProgram::query()->firstOrCreate(
            ['code' => $code],
            [...$values, 'entity_id' => null, 'default_employee_share' => 0, 'employee_rate' => 0, 'employer_rate' => 0, 'is_active' => true],
        ))->all();
    }

    private function enroll(Employee $employee, string $code, float $amount, string $from, ?string $notes = null): void
    {
        $program = $this->programs[$code];

        EmployeeBenefit::query()->firstOrCreate(
            ['employee_id' => $employee->id, 'benefit_program_id' => $program->id],
            [
                'participation_status' => 'active',
                'employee_share' => 0,
                'employer_share' => $amount,
                'payroll_treatment' => $program->payroll_mode,
                'effective_date' => $from,
                'notes' => $notes,
            ],
        );
    }

    /**
     * Move the employee to the employer on the sheet, with their login: it gets the new branch as default and loses
     * the old one when that was only there for this employee record.
     */
    private function moveTo(Employee $employee, int $entityId): void
    {
        $from = (int) $employee->entity_id;
        if ($from === $entityId) {
            return;
        }

        if ($this->hasHistory($employee)) {
            $this->command?->warn("{$employee->name}: has time, leave or pay records in its current branch — not moved.");

            return;
        }

        $employee->entity_id = $entityId;
        // Shift templates belong to a branch.
        if ($employee->default_shift_template_id
            && ShiftTemplate::query()->withoutGlobalScopes()->whereKey($employee->default_shift_template_id)->value('entity_id') !== $entityId) {
            $employee->default_shift_template_id = null;
        }

        $user = $employee->user;
        if (! $user) {
            return;
        }

        $onlyEmployee = $user->getRoleNames()->all() === [RoleEnum::Employee->value];
        $otherRecordThere = Employee::query()->withoutGlobalScopes()->where('user_id', $user->id)->where('entity_id', $from)->whereKeyNot($employee->id)->exists();

        if ($onlyEmployee && ! $otherRecordThere) {
            $user->entities()->detach($from);
        }
        if (! $user->entities()->where('entities.id', $entityId)->exists()) {
            $user->entities()->attach($entityId, ['is_default' => ! $user->entities()->wherePivot('is_default', true)->exists()]);
        }
    }

    private function hasHistory(Employee $employee): bool
    {
        foreach ([DtrEntry::class, LeaveBalance::class, LeaveRequest::class, AttendanceRequest::class, ShiftRoster::class] as $model) {
            if ($model::query()->withoutGlobalScopes()->where('employee_id', $employee->id)->exists()) {
                return true;
            }
        }

        return Payslip::query()->where('employee_id', $employee->id)->exists();
    }

    private function setEmployeeNumber(Employee $employee, string $number): void
    {
        if ($employee->employee_code === $number) {
            return;
        }

        $taken = Employee::query()->withoutGlobalScopes()->where('entity_id', $employee->entity_id)
            ->where('employee_code', $number)->whereKeyNot($employee->id)->exists();

        if ($taken) {
            $this->command?->warn("{$employee->name}: employee code {$number} is already used in the branch — kept {$employee->employee_code}.");

            return;
        }

        $employee->employee_code = $number;
    }
}
