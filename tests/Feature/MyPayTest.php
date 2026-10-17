<?php

use App\Models\BenefitProgram;
use App\Models\ComplianceItem;
use App\Models\Employee;
use App\Models\EmployeeBenefit;
use App\Models\Entity;
use App\Models\PayrollAdjustment;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->entity = Entity::create(['code' => 'PAY', 'name' => 'Pay Clinic', 'is_active' => true]);
    Permission::findOrCreate('portal.view', 'web');
    $role = Role::findOrCreate('Employee', 'web')->syncPermissions(['portal.view']);

    $this->user = User::factory()->create(['email' => 'maria@pay.test']);
    $this->user->assignRole($role);
    $this->user->entities()->attach($this->entity->id, ['is_default' => true]);

    $make = fn (string $code, ?User $user) => Employee::create([
        'entity_id' => $this->entity->id, 'user_id' => $user?->id, 'employee_code' => $code, 'firstname' => $code, 'lastname' => 'Test',
        'email' => $user?->email, 'employment_status' => 'active', 'is_active' => true, 'pay_type' => 'monthly', 'basic_pay' => 30000,
        'rest_days' => ['sun'], 'sss_number' => '34-0000001-1', 'tin' => '100-000-001-000',
    ]);
    $this->employee = $make('E-1', $this->user);
    $this->other = $make('E-2', null);

    $this->program = BenefitProgram::create(['entity_id' => $this->entity->id, 'code' => 'HMO', 'name' => 'HMO Plan', 'payroll_mode' => BenefitProgram::MODE_CONTRIBUTION, 'category' => 'insurance', 'is_active' => true]);
    $this->enrollment = EmployeeBenefit::create(['employee_id' => $this->employee->id, 'benefit_program_id' => $this->program->id, 'participation_status' => 'active', 'employee_share' => 200, 'employer_share' => 400, 'effective_date' => '2026-01-01']);

    $this->run = function (string $code, string $start, string $end, string $status) {
        $period = PayrollPeriod::create(['entity_id' => $this->entity->id, 'code' => $code, 'frequency' => 'semi_monthly', 'start_date' => $start, 'end_date' => $end, 'pay_date' => $end, 'status' => 'open']);
        $run = PayrollRun::create(['entity_id' => $this->entity->id, 'payroll_period_id' => $period->id, 'run_no' => 'PR-'.$code, 'status' => $status]);
        foreach ([$this->employee, $this->other] as $e) {
            Payslip::create([
                'payroll_run_id' => $run->id, 'employee_id' => $e->id, 'basic_pay' => 15000, 'gross_pay' => 15000,
                'sss' => 750, 'sss_er' => 1500, 'sss_ec' => 10, 'philhealth' => 375, 'philhealth_er' => 375, 'pagibig' => 100, 'pagibig_er' => 100,
                'taxable_income' => 13675, 'withholding_tax' => 500, 'other_deductions' => 100, 'benefit_deductions' => 100, 'net_pay' => 13175,
                'thirteenth_month_accrual' => 1250,
                'meta' => ['benefits' => [['id' => $this->enrollment->id, 'name' => 'HMO Plan', 'mode' => 'contribution', 'employee' => 100, 'employer' => 200, 'earning' => 0]]],
            ]);
        }

        return $run;
    };

    $this->as = fn (User $u) => $this->actingAs($u)->withSession(['current_entity_id' => $this->entity->id]);
});

test('an employee sees only their own released payslips for the year, with totals', function () {
    ($this->run)('2026-09-2', '2026-09-16', '2026-09-30', PayrollRun::STATUS_POSTED);
    ($this->run)('2026-10-1', '2026-10-01', '2026-10-15', PayrollRun::STATUS_PAID);
    ($this->run)('2026-10-2', '2026-10-16', '2026-10-31', PayrollRun::STATUS_DRAFT); // can still change: hidden
    ($this->run)('2025-12-2', '2025-12-16', '2025-12-31', PayrollRun::STATUS_PAID);

    ($this->as)($this->user)->get('/employee-management/my-pay')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('employee-management/my-pay/page')
            ->where('year', 2026)
            ->where('years', [2026, 2025])
            ->has('payslips', 2)
            ->where('payslips.0.period.code', '2026-10-1')
            ->where('payslips.0.employee.id', $this->employee->id)
            ->where('payslips.0.run.status', 'paid')
            ->where('summary.payslips', 2)
            ->where('summary.net', 26350)
            ->where('summary.contributions', 2450)
            ->where('summary.employer_contributions', 3970)
            ->where('summary.withholding_tax', 1000)
            ->where('summary.thirteenth_month', 2500));

    ($this->as)($this->user)->get('/employee-management/my-pay?year=2025')
        ->assertInertia(fn (Assert $page) => $page->where('year', 2025)->has('payslips', 1));
});

test('contributions are grouped by month with the remittance status of each filing', function () {
    ($this->run)('2026-09-2', '2026-09-16', '2026-09-30', PayrollRun::STATUS_PAID);
    ($this->run)('2026-10-1', '2026-10-01', '2026-10-15', PayrollRun::STATUS_PAID);
    ComplianceItem::create(['entity_id' => $this->entity->id, 'title' => 'SSS', 'form_code' => 'SSS-R5', 'category' => 'statutory_payroll', 'period' => 'September 2026',
        'due_date' => '2026-10-31', 'status' => 'submitted', 'submitted_at' => '2026-10-20 10:00:00']);
    ComplianceItem::create(['entity_id' => $this->entity->id, 'title' => 'BIR 1601-C', 'form_code' => '1601-C', 'category' => 'statutory_tax', 'period' => 'September 2026',
        'due_date' => '2026-10-10', 'status' => 'pending']);

    ($this->as)($this->user)->get('/employee-management/my-pay')
        ->assertInertia(fn (Assert $page) => $page
            ->has('contributions', 2)
            ->where('contributions.0.month', '2026-09')
            ->where('contributions.0.sss', 750)
            ->where('contributions.0.sss_er', 1500)
            ->where('contributions.0.remittances.sss.status', 'submitted')
            ->where('contributions.0.remittances.sss.filed_on', '2026-10-20')
            ->where('contributions.0.remittances.tax.status', 'pending')
            ->where('contributions.0.remittances.philhealth', null)
            ->where('contributions.1.month', '2026-10'));
});

test('benefits show this year’s amounts and loans come from the payslip adjustments', function () {
    $run = ($this->run)('2026-10-1', '2026-10-01', '2026-10-15', PayrollRun::STATUS_PAID);
    PayrollAdjustment::create(['entity_id' => $this->entity->id, 'payroll_run_id' => $run->id, 'employee_id' => $this->employee->id, 'kind' => 'deduction', 'category' => 'sss_loan', 'description' => 'SSS salary loan', 'amount' => 800]);
    PayrollAdjustment::create(['entity_id' => $this->entity->id, 'payroll_run_id' => $run->id, 'employee_id' => $this->other->id, 'kind' => 'deduction', 'category' => 'cash_advance', 'description' => 'Not mine', 'amount' => 999]);

    ($this->as)($this->user)->get('/employee-management/my-pay')
        ->assertInertia(fn (Assert $page) => $page
            ->has('benefits', 1)
            ->where('benefits.0.program.name', 'HMO Plan')
            ->where('benefits.0.employee_share', 200)
            ->where('benefits.0.year_to_date.employee', 100)
            ->where('benefits.0.year_to_date.employer', 200)
            ->has('adjustments', 1)
            ->where('adjustments.0.category_label', 'SSS loan amortization')
            ->where('adjustments.0.amount', 800));
});

test('a user without an employee record sees the empty state, and the page needs portal access', function () {
    $staff = User::factory()->create();
    $staff->assignRole(Role::findByName('Employee'));
    $staff->entities()->attach($this->entity->id, ['is_default' => true]);
    ($this->as)($staff)->get('/employee-management/my-pay')->assertOk()->assertInertia(fn (Assert $page) => $page->where('employee', null));

    $outsider = User::factory()->create();
    $outsider->entities()->attach($this->entity->id, ['is_default' => true]);
    ($this->as)($outsider)->get('/employee-management/my-pay')->assertForbidden();
});
