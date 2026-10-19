<?php

use App\Models\BenefitProgram;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\Entity;
use App\Models\LeaveType;
use App\Models\User;
use App\Support\EntityContext;
use Database\Seeders\EmployeeMasterListSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    foreach (['JAM_OPTICUS' => 'JAM Opticus', 'A_JAMORA' => 'A. Jamora Optical', 'AL_JAMORA' => 'AL Jamora Optical'] as $code => $name) {
        $this->{$code} = Entity::create(['code' => $code, 'name' => $name, 'is_active' => true]);
    }
    app(EntityContext::class)->clear();
    Role::findOrCreate('Employee', 'web');
});

/** An optical-new user's login and employee record, as the user sync leaves them. */
function syncedEmployee(Entity $entity, string $first, string $last, string $code): Employee
{
    $user = User::factory()->create(['firstname' => $first, 'lastname' => $last]);
    $user->assignRole('Employee');
    $user->entities()->attach($entity->id, ['is_default' => true]);

    return Employee::create([
        'entity_id' => $entity->id, 'user_id' => $user->id, 'employee_code' => $code, 'firstname' => $first, 'lastname' => $last,
        'employment_status' => 'active', 'is_active' => true, 'pay_type' => 'monthly', 'basic_pay' => 0,
    ]);
}

test('the directory keeps birth date, address, emergency contact, dependents and the bank account name', function () {
    $entity = $this->A_JAMORA;
    Permission::findOrCreate('libraries.employees.manage', 'web');
    $hr = User::factory()->create();
    $hr->assignRole(Role::findOrCreate('Accountant', 'web')->syncPermissions(['libraries.employees.manage']));
    $hr->entities()->attach($entity->id, ['is_default' => true]);
    $as = fn () => $this->actingAs($hr)->withSession(['current_entity_id' => $entity->id]);

    $payload = [
        'employee_code' => '088', 'firstname' => 'Juniza', 'middlename' => 'Campos', 'lastname' => 'Garcia', 'gender' => 'female',
        'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'monthly', 'basic_pay' => 15000,
        'account' => 'new', 'username' => 'jgarcia', 'password' => 'Secret-pass-123',
        'birth_date' => '1989-02-11', 'address' => '123 Rizal St., Butuan City', 'dependents' => 2,
        'emergency_contact_name' => 'Maria Garcia', 'emergency_contact_relationship' => 'Mother', 'emergency_contact_phone' => '0917-765-4321',
        'bank_name' => 'BDO', 'bank_account_name' => 'Juniza C. Garcia', 'bank_account_no' => '0012-3456-7890',
    ];

    $as()->post('/libraries/employees', $payload)->assertSessionHasNoErrors();

    $employee = Employee::where('employee_code', '088')->sole();
    expect($employee->birth_date->toDateString())->toBe('1989-02-11')
        ->and($employee->dependents)->toBe(2)
        ->and($employee->only(['address', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone', 'bank_account_name']))->toBe([
            'address' => '123 Rizal St., Butuan City',
            'emergency_contact_name' => 'Maria Garcia',
            'emergency_contact_relationship' => 'Mother',
            'emergency_contact_phone' => '0917-765-4321',
            'bank_account_name' => 'Juniza C. Garcia',
        ]);

    // optical-new's placeholder birth date (a two-year-old) is refused.
    $as()->put("/libraries/employees/{$employee->id}", [...$payload, 'birth_date' => '2024-09-25'])
        ->assertSessionHasErrors(['birth_date' => 'The employee must be at least 15 years old (RA 9231).']);
});

test('the master list moves employees to their employer with their login, numbers them and sets their benefits', function () {
    foreach (config('people.leave_types') as $type) {
        LeaveType::create($type);
    }
    $sheila = syncedEmployee($this->JAM_OPTICUS, 'Sheila Mae', 'Cabunagan', 'OPT-0017');
    $jerome = syncedEmployee($this->JAM_OPTICUS, 'Jerome', 'Calimas', 'OPT-0019');
    $lawrence = syncedEmployee($this->JAM_OPTICUS, 'Joseph Lawrence', 'Jamora', 'OPT-0023');

    $this->seed(EmployeeMasterListSeeder::class);

    // Jerome works for A. Jamora Optical (AJOC): the record and the login's branch follow.
    $jerome->refresh();
    expect($jerome->entity_id)->toBe($this->A_JAMORA->id)
        ->and($jerome->employee_code)->toBe('101')
        ->and($jerome->user->entities()->pluck('entities.id')->all())->toBe([$this->A_JAMORA->id])
        ->and((bool) $jerome->user->entities()->first()->pivot->is_default)->toBeTrue();

    // Doc Lawrence: ID 103, ₱1,533.54 a day.
    $lawrence->refresh();
    expect($lawrence->only(['entity_id', 'employee_code', 'pay_type']))->toBe(['entity_id' => $this->AL_JAMORA->id, 'employee_code' => '103', 'pay_type' => 'daily'])
        ->and((float) $lawrence->basic_pay)->toBe(1533.54);

    // No VL / SL: SIL (5 days after a year of service), maternity, paternity and leave without pay.
    $sil = LeaveType::where('code', 'SIL')->sole();
    $codes = LeaveType::whereIn('id', $jerome->leave_type_ids)->pluck('code')->sort()->values()->all();
    expect($codes)->toBe(['LWOP', 'ML', 'PL', 'SIL'])
        ->and((float) $sil->annual_entitlement)->toBe(5.0)
        ->and($sil->min_service_months)->toBe(12);

    // Sheila: ₱50 per day worked, company-provided communication, and the 2027 attendance bonus.
    $sheila->refresh();
    $benefits = EmployeeBenefit::with('program')->where('employee_id', $sheila->id)->get()->keyBy('program.code');
    expect($sheila->entity_id)->toBe($this->JAM_OPTICUS->id)
        ->and($sheila->employee_code)->toBe('014')
        ->and($sheila->pay_type)->toBe('daily')
        ->and((float) $sheila->basic_pay)->toBe(475.0)
        ->and($benefits->keys()->sort()->values()->all())->toBe(['COMMUNICATION', 'PERFECT_ATTENDANCE', 'TRANSPORT_DAILY'])
        ->and((float) $benefits['TRANSPORT_DAILY']->employer_share)->toBe(50.0)
        ->and($benefits['TRANSPORT_DAILY']->program->isPerDay())->toBeTrue()
        ->and($benefits['PERFECT_ATTENDANCE']->effective_date->toDateString())->toBe('2027-01-01')
        ->and($benefits['PERFECT_ATTENDANCE']->program->affectsPayroll())->toBeFalse();

    // Running it again changes nothing.
    $this->seed(EmployeeMasterListSeeder::class);
    expect(EmployeeBenefit::count())->toBe(5)
        ->and(BenefitProgram::count())->toBe(3);
});

test('an employee with time records is not moved, and the leave types and pay HR set are kept', function () {
    foreach (config('people.leave_types') as $type) {
        LeaveType::create($type);
    }
    $jowie = syncedEmployee($this->JAM_OPTICUS, 'Jowie', 'Lozano', 'OPT-0028');
    $jowie->update(['leave_type_ids' => [LeaveType::where('code', 'VL')->value('id')], 'pay_type' => 'monthly', 'basic_pay' => 18000]);
    DtrEntry::create(['entity_id' => $this->JAM_OPTICUS->id, 'employee_id' => $jowie->id, 'work_date' => '2026-10-01', 'status' => DtrEntry::STATUS_APPROVED, 'attendance_status' => 'present']);

    $this->seed(EmployeeMasterListSeeder::class);

    $jowie->refresh();
    expect($jowie->entity_id)->toBe($this->JAM_OPTICUS->id)
        ->and($jowie->employee_code)->toBe('040')
        ->and($jowie->leave_type_ids)->toBe([LeaveType::where('code', 'VL')->value('id')])
        ->and($jowie->pay_type)->toBe('monthly')
        ->and((float) $jowie->basic_pay)->toBe(18000.0);
});
