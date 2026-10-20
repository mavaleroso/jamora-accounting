<?php

use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\BenefitProgram;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\JournalEntry;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\User;
use App\Services\Payroll\PayrollCalculator;
use App\Support\ChartOfAccounts;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Database\Seeders\AccountingSetupSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00');

    $this->entity = Entity::create(['code' => 'PAY-BR', 'name' => 'Payroll Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP']);
    $this->seed(AccountingSetupSeeder::class);

    $perms = ['payroll.view', 'payroll.manage', 'payroll.run', 'portal.view', 'attendance.view', 'leave.file'];
    foreach ($perms as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->user = User::factory()->create(['email' => 'payroll@test.ph']);
    $this->user->assignRole(Role::findOrCreate('Payroll Officer', 'web')->syncPermissions($perms));
    $this->user->entities()->attach($this->entity->id, ['is_default' => true]);

    $make = fn (array $attrs) => Employee::create([
        'entity_id' => $this->entity->id,
        'employment_status' => 'active',
        'is_active' => true,
        'rest_days' => ['sun'],
        'hire_date' => '2025-01-06',
        ...$attrs,
    ]);

    $this->monthly = $make(['employee_code' => 'E-001', 'firstname' => 'Maria', 'lastname' => 'Santos', 'pay_type' => 'monthly', 'basic_pay' => 30000,
        'sss_number' => '34-0000001-1', 'philhealth_number' => '01-000000001-1', 'pagibig_number' => '1210-0000-0001', 'tin' => '100-000-001-000',
        'bank_name' => 'BDO', 'bank_account_no' => '001100220033']);
    $this->daily = $make(['employee_code' => 'E-002', 'firstname' => 'Jun', 'lastname' => 'Reyes', 'pay_type' => 'daily', 'basic_pay' => 475]);

    $this->period = PayrollPeriod::create([
        'entity_id' => $this->entity->id, 'code' => 'PP-2026-10-1', 'frequency' => 'semi_monthly',
        'start_date' => '2026-10-01', 'end_date' => '2026-10-15', 'pay_date' => '2026-10-15', 'status' => 'open',
    ]);

    $this->as = fn () => $this->actingAs($this->user)->withSession(['current_entity_id' => $this->entity->id]);
});

afterEach(fn () => Carbon::setTestNow());

function dtr(Employee $e, string $date, array $attrs = []): DtrEntry
{
    return DtrEntry::create([
        'entity_id' => $e->entity_id, 'employee_id' => $e->id, 'work_date' => $date, 'status' => DtrEntry::STATUS_APPROVED,
        'time_in' => '09:00:00', 'time_out' => '18:00:00', 'regular_hours' => 8, 'attendance_status' => 'present',
        'is_absent' => false, 'day_type' => 'regular', ...$attrs,
    ]);
}

/** Approval needs every working day of the cut-off recorded and approved: fill the days not set up by a test. */
function fillCutoff(Employee ...$employees): void
{
    foreach ($employees as $e) {
        foreach (CarbonPeriod::create('2026-10-01', '2026-10-15') as $day) {
            if (! $day->isSunday() && ! DtrEntry::where('employee_id', $e->id)->whereDate('work_date', $day)->exists()) {
                dtr($e, $day->toDateString());
            }
        }
    }
}

test('semi-monthly pay follows PH statutory tables', function () {
    dtr($this->monthly, '2026-10-06', ['time_in' => null, 'time_out' => null, 'regular_hours' => 0, 'attendance_status' => 'absent', 'is_absent' => true]);
    dtr($this->daily, '2026-10-05');
    dtr($this->daily, '2026-10-07');

    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute")->assertSessionHasNoErrors()->assertRedirect();

    $run = PayrollRun::firstOrFail();
    expect($run->status)->toBe('draft')->and($run->headcount)->toBe(2);

    $m = Payslip::where('employee_id', $this->monthly->id)->firstOrFail();
    expect((float) $m->basic_pay)->toBe(15000.0)                    // half of the monthly rate
        ->and((float) $m->absences)->toBe(1150.16)                  // 30,000 x 12 / 313
        ->and((float) $m->gross_pay)->toBe(13849.84)
        ->and((float) $m->sss)->toBe(750.0)                         // MSC 30,000 x 5% / 2 cut-offs
        ->and((float) $m->sss_er)->toBe(1500.0)
        ->and((float) $m->sss_ec)->toBe(15.0)
        ->and((float) $m->philhealth)->toBe(375.0)                  // 30,000 x 5% / 2 shares / 2 cut-offs
        ->and((float) $m->philhealth_er)->toBe(375.0)
        ->and((float) $m->pagibig)->toBe(100.0)                     // capped at 10,000 x 2% / 2 cut-offs
        ->and((float) $m->pagibig_er)->toBe(100.0)
        ->and((float) $m->taxable_income)->toBe(12624.84)
        ->and((float) $m->withholding_tax)->toBe(331.18)            // (12,624.84 - 10,417) x 15%
        ->and((float) $m->net_pay)->toBe(12293.66)
        ->and($m->is_mwe)->toBeFalse();

    // Daily-paid at or below the minimum wage: "no work, no pay" and no withholding tax.
    $d = Payslip::where('employee_id', $this->daily->id)->firstOrFail();
    expect((float) $d->basic_pay)->toBe(950.0)
        ->and($d->is_mwe)->toBeTrue()
        ->and((float) $d->withholding_tax)->toBe(0.0)
        ->and(collect($d->meta['warnings'])->contains('No TIN number on file.'))->toBeTrue();
});

test('a daily rate above the regional minimum wage is not a minimum wage earner', function () {
    $this->daily->update(['basic_pay' => 540]); // Caraga minimum wage: 475
    dtr($this->daily, '2026-10-05');

    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute")->assertSessionHasNoErrors();

    $d = Payslip::where('employee_id', $this->daily->id)->firstOrFail();
    expect($d->is_mwe)->toBeFalse()
        ->and((float) $d->taxable_income)->toBeGreaterThan(0)
        ->and((float) $d->withholding_tax)->toBe(0.0); // still under the first BIR bracket
});

test('BIR withholding table brackets', function () {
    $calc = app(PayrollCalculator::class);
    expect($calc->withholdingTax(10417, 'semi_monthly'))->toBe(0.0)
        ->and($calc->withholdingTax(20000, 'semi_monthly'))->toBe(1604.10)   // 937.50 + 3,333 x 20%
        ->and($calc->withholdingTax(100000, 'semi_monthly'))->toBe(21770.80) // 16,770.70 + 16,667 x 30%
        ->and($calc->withholdingTax(50000, 'monthly'))->toBe(5208.40);       // 1,875 + 16,667 x 20%
});

test('draft, adjust, approve, post, release — end to end', function () {
    dtr($this->daily, '2026-10-05');
    fillCutoff($this->monthly, $this->daily);
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute");
    $run = PayrollRun::firstOrFail();

    // Cash advance recovered on this payroll; recomputes the draft.
    ($this->as)()->post("/payroll/runs/{$run->id}/adjustments", ['employee_id' => $this->monthly->id, 'category' => 'cash_advance', 'amount' => 500])
        ->assertSessionHasNoErrors();
    $slip = Payslip::where('employee_id', $this->monthly->id)->firstOrFail();
    expect((float) $slip->other_deductions)->toBe(500.0);

    // Posting before approval is refused.
    ($this->as)()->post("/payroll/runs/{$run->id}/post")->assertSessionHasErrors('status');

    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasNoErrors();
    expect($run->fresh()->status)->toBe('approved');

    // Locked: no adjustments, no recompute.
    ($this->as)()->post("/payroll/runs/{$run->id}/adjustments", ['employee_id' => $this->monthly->id, 'category' => 'allowance', 'amount' => 100])
        ->assertSessionHasErrors('status');

    ($this->as)()->post("/payroll/runs/{$run->id}/post")->assertSessionHasNoErrors();
    $run->refresh();
    expect($run->status)->toBe('posted');

    $entry = JournalEntry::with('lines.account')->findOrFail($run->journal_entry_id);
    expect((float) $entry->total_debit)->toBe((float) $entry->total_credit);
    $byCode = $entry->lines->groupBy(fn ($l) => $l->account->code)->map(fn ($ls) => round($ls->sum('debit') - $ls->sum('credit'), 2));
    expect($byCode['6000'])->toBe(round((float) Payslip::sum('gross_pay'), 2))
        ->and($byCode['2500'])->toBe(-round((float) Payslip::sum('net_pay'), 2))
        ->and($byCode['2440'])->toBe(-500.0)
        ->and($byCode['6010'])->toBeGreaterThan(0);

    // Released from a registered bank account of the company; nobody has a payroll bank, so it is chosen here.
    ($this->as)()->post("/payroll/runs/{$run->id}/pay", ['paid_on' => '2026-10-15'])->assertSessionHasErrors('bank_account_id');
    $bank = BankAccount::create(['entity_id' => $this->entity->id, 'code' => 'BDO-PAY', 'name' => 'Payroll', 'bank_name' => 'BDO', 'is_active' => true]);
    ($this->as)()->post("/payroll/runs/{$run->id}/pay", ['paid_on' => '2026-10-15', 'bank_account_id' => $bank->id])->assertSessionHasNoErrors();
    expect($run->fresh()->status)->toBe('paid')
        ->and($run->fresh()->payment_journal_entry_id)->not->toBeNull()
        ->and($this->period->fresh()->status)->toBe('paid');

    ($this->as)()->get("/payroll/runs/{$run->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('payroll/runs/show')->where('run.status', 'paid')->has('payslips', 2)->has('remittances', 4));

    $csv = ($this->as)()->get("/payroll/runs/{$run->id}/export/bank");
    $csv->assertOk();
    expect($csv->streamedContent())->toContain('001100220033')->toContain('CASH / CHEQUE');
});

test('benefit enrollments flow into payslips and the payroll journal entry', function () {
    $program = fn (array $attrs) => ($this->as)()->post('/employee-management/benefits/programs', [
        'contribution_basis' => 'fixed', 'is_taxable' => false, ...$attrs,
    ])->assertSessionHasNoErrors();
    $program(['code' => 'RICE', 'name' => 'Rice subsidy', 'category' => 'allowance', 'payroll_mode' => 'earning', 'default_employer_share' => 2000]);
    $program(['code' => 'HMO', 'name' => 'HMO', 'category' => 'insurance', 'payroll_mode' => 'contribution', 'default_employee_share' => 400, 'default_employer_share' => 1200]);
    $program(['code' => 'GYM', 'name' => 'Gym pass', 'category' => 'company', 'payroll_mode' => 'none', 'default_employer_share' => 900]);
    ['RICE' => $rice, 'HMO' => $hmo, 'GYM' => $gym] = BenefitProgram::whereIn('code', ['RICE', 'HMO', 'GYM'])->get()->keyBy('code')->all();

    foreach ([$rice, $hmo, $gym] as $p) {
        ($this->as)()->post('/employee-management/benefits/enroll', ['employee_ids' => [$this->monthly->id], 'benefit_program_id' => $p->id, 'effective_date' => '2026-09-01'])
            ->assertSessionHasNoErrors();
    }
    // Ended before the cut-off: not applied.
    ($this->as)()->post('/employee-management/benefits/enroll', ['employee_ids' => [$this->daily->id], 'benefit_program_id' => $hmo->id, 'effective_date' => '2026-08-01', 'end_date' => '2026-09-30'])
        ->assertSessionHasNoErrors();

    // Statutory programs are computed by payroll, not enrolled.
    $sss = BenefitProgram::create(['code' => 'SSS', 'name' => 'SSS', 'category' => 'statutory', 'contribution_basis' => 'statutory_sss', 'payroll_mode' => 'statutory']);
    ($this->as)()->post('/employee-management/benefits/enroll', ['employee_ids' => [$this->monthly->id], 'benefit_program_id' => $sss->id])
        ->assertSessionHasErrors('benefit_program_id');

    ($this->as)()->get('/employee-management/benefits')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('employee-management/benefits/page')->has('enrollments', 4)->has('programs', 4));

    dtr($this->daily, '2026-10-05');
    fillCutoff($this->monthly, $this->daily);
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute")->assertSessionHasNoErrors();
    $run = PayrollRun::firstOrFail();

    $m = Payslip::where('employee_id', $this->monthly->id)->firstOrFail();
    expect((float) $m->non_taxable_allowances)->toBe(1000.0)  // half of 2,000 on a semi-monthly cut-off
        ->and((float) $m->benefit_deductions)->toBe(200.0)
        ->and((float) $m->other_deductions)->toBe(200.0)
        ->and((float) $m->employer_benefits)->toBe(600.0)
        ->and((float) $m->gross_pay)->toBe(16000.0)
        ->and(collect($m->meta['benefits'])->pluck('code')->all())->toBe(['RICE', 'HMO']);

    $d = Payslip::where('employee_id', $this->daily->id)->firstOrFail();
    expect((float) $d->benefit_deductions)->toBe(0.0)->and($d->meta['benefits'])->toBe([]);

    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasNoErrors();
    ($this->as)()->post("/payroll/runs/{$run->id}/post")->assertSessionHasNoErrors();

    $entry = JournalEntry::with('lines.account')->findOrFail($run->fresh()->journal_entry_id);
    $byCode = $entry->lines->groupBy(fn ($l) => $l->account->code)->map(fn ($ls) => round($ls->sum('debit') - $ls->sum('credit'), 2));
    expect((float) $entry->total_debit)->toBe((float) $entry->total_credit)
        ->and($byCode['6020'])->toBe(600.0)
        ->and($byCode['2450'])->toBe(-800.0)
        ->and($byCode->has('2440'))->toBeFalse();

    ($this->as)()->get("/payroll/runs/{$run->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('remittances', 5)->where('totals.employer_benefits', 600));
});

test('a per-day allowance is paid for the days worked in the cut-off', function () {
    ($this->as)()->post('/employee-management/benefits/programs', [
        'code' => 'TRANSPORT', 'name' => 'Transportation Allowance', 'category' => 'allowance', 'payroll_mode' => 'earning',
        'contribution_basis' => 'per_day', 'default_employer_share' => 50, 'is_taxable' => true,
    ])->assertSessionHasNoErrors();
    $transport = BenefitProgram::where('code', 'TRANSPORT')->sole();

    // Only an allowance can be paid per day.
    ($this->as)()->post('/employee-management/benefits/programs', [
        'code' => 'HMO', 'name' => 'HMO', 'category' => 'insurance', 'payroll_mode' => 'contribution', 'contribution_basis' => 'per_day', 'default_employee_share' => 10,
    ])->assertSessionHasErrors('contribution_basis');

    ($this->as)()->post('/employee-management/benefits/enroll', ['employee_ids' => [$this->daily->id], 'benefit_program_id' => $transport->id, 'effective_date' => '2026-09-01'])
        ->assertSessionHasNoErrors();

    dtr($this->daily, '2026-10-05');
    dtr($this->daily, '2026-10-06');
    dtr($this->daily, '2026-10-07', ['time_in' => null, 'time_out' => null, 'regular_hours' => 0, 'attendance_status' => 'absent', 'is_absent' => true]);
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute")->assertSessionHasNoErrors();

    $d = Payslip::where('employee_id', $this->daily->id)->firstOrFail();
    expect((float) $d->taxable_allowances)->toBe(100.0) // 2 days worked x ₱50; the absence earns none
        ->and($d->meta['benefits'][0])->toMatchArray(['code' => 'TRANSPORT', 'earning' => 100, 'days' => 2]);
});

test('approval is blocked by negative net pay and returning to draft unlocks the cut-off', function () {
    dtr($this->monthly, '2026-10-02');
    fillCutoff($this->monthly, $this->daily);
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute");
    $run = PayrollRun::firstOrFail();

    ($this->as)()->post("/payroll/runs/{$run->id}/adjustments", ['employee_id' => $this->monthly->id, 'category' => 'company_loan', 'amount' => 50000]);
    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasErrors('status');

    $adjustment = $run->adjustments()->firstOrFail();
    ($this->as)()->delete("/payroll/runs/{$run->id}/adjustments/{$adjustment->id}")->assertSessionHasNoErrors();
    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasNoErrors();
    expect(DtrEntry::where('status', '!=', DtrEntry::STATUS_LOCKED)->exists())->toBeFalse();

    ($this->as)()->post("/payroll/runs/{$run->id}/reopen")->assertSessionHasNoErrors();
    expect($run->fresh()->status)->toBe('draft')
        ->and(DtrEntry::where('status', '!=', DtrEntry::STATUS_APPROVED)->exists())->toBeFalse();

    // Recomputing keeps a single run for the period.
    ($this->as)()->post("/payroll/runs/{$run->id}/recompute")->assertSessionHasNoErrors();
    expect(PayrollRun::count())->toBe(1);

    // Voiding frees the period; the next computation gets a fresh run number.
    ($this->as)()->post("/payroll/runs/{$run->id}/void")->assertRedirect();
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute");
    expect(PayrollRun::where('status', 'draft')->value('run_no'))->toBe('PR-PP-2026-10-1-2');
});

test('approval is blocked until every working day is recorded, complete and approved, on fresh payslips', function () {
    dtr($this->monthly, '2026-10-02', ['status' => DtrEntry::STATUS_OPEN]);
    dtr($this->daily, '2026-10-02', ['time_out' => null, 'attendance_status' => 'incomplete']);
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute");
    $run = PayrollRun::firstOrFail();

    ($this->as)()->get("/payroll/runs/{$run->id}")->assertInertia(fn (Assert $page) => $page
        ->where('checks', fn ($checks) => collect($checks)->where('level', 'error')->pluck('key')->sort()->values()->all() === ['incomplete', 'no_record_days', 'open_records']));
    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasErrors('status');

    // Fixed in Time & Attendance, but the payslips were computed before the fix.
    $this->travel(1)->minutes();
    DtrEntry::where('employee_id', $this->monthly->id)->update(['status' => DtrEntry::STATUS_APPROVED]);
    DtrEntry::where('employee_id', $this->daily->id)->update(['time_out' => '18:00:00', 'attendance_status' => 'present']);
    fillCutoff($this->monthly, $this->daily);
    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasErrors('status');

    ($this->as)()->post("/payroll/runs/{$run->id}/recompute")->assertSessionHasNoErrors();
    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasNoErrors();
    expect($run->fresh()->status)->toBe('approved');
});

test('periods are generated per month and the overview lists them', function () {
    ($this->as)()->post('/payroll/periods/generate', ['month' => '2026-11', 'months' => 2, 'frequency' => 'semi_monthly'])
        ->assertSessionHasNoErrors();

    $nov = PayrollPeriod::where('code', 'PP-2026-11-2')->firstOrFail();
    expect($nov->start_date->toDateString())->toBe('2026-11-16')
        ->and($nov->end_date->toDateString())->toBe('2026-11-30')
        ->and($nov->pay_date->toDateString())->toBe('2026-11-30')
        ->and(PayrollPeriod::where('code', 'PP-2026-11-1')->value('pay_date')->toDateString())->toBe('2026-11-15')
        ->and(PayrollPeriod::count())->toBe(5);

    // Overlapping ranges are skipped, not duplicated.
    ($this->as)()->post('/payroll/periods/generate', ['month' => '2026-10', 'frequency' => 'semi_monthly']);
    expect(PayrollPeriod::count())->toBe(6);

    ($this->as)()->get('/payroll/runs')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('payroll/runs/page')->has('periods', 6)->where('next.code', 'PP-2026-10-1'));
    ($this->as)()->get('/payroll/periods')->assertRedirect('/payroll/runs');
});

test('the overview renders for a branch with no pay periods yet', function () {
    PayrollPeriod::query()->delete();

    ($this->as)()->get('/payroll/runs')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->has('periods', 0)->where('years', [2026])->where('next', null));
});

test('contributions are always computed from the table, unless set to not deducted', function () {
    $this->monthly->update(['sss_number' => null, 'contribution_settings' => [
        'sss' => ['mode' => 'none'],
        'pagibig' => ['mode' => 'fixed', 'employee' => 500, 'employer' => 300],   // an older stored amount is ignored
    ]]);

    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute")->assertSessionHasNoErrors();

    $m = Payslip::where('employee_id', $this->monthly->id)->firstOrFail();
    expect((float) $m->sss)->toBe(0.0)
        ->and((float) $m->sss_er)->toBe(0.0)
        ->and((float) $m->sss_ec)->toBe(0.0)
        ->and((float) $m->philhealth)->toBe(375.0)          // table: 30,000 x 5% / 2 / 2
        ->and((float) $m->philhealth_er)->toBe(375.0)
        ->and((float) $m->pagibig)->toBe(100.0)             // table, not the stored 500
        ->and((float) $m->pagibig_er)->toBe(100.0)
        ->and($m->meta['contribution_modes'])->toBe(['sss' => 'none'])
        // No SSS number is needed when SSS is not deducted.
        ->and(collect($m->meta['warnings'])->contains('No SSS number on file.'))->toBeFalse();

    $d = Payslip::where('employee_id', $this->daily->id)->firstOrFail();
    expect($d->meta['contribution_modes'])->toBe([]);
});

test('each employee is paid from their payroll bank, a registered bank account of the company, reviewed before release', function () {
    $bank = function (Entity $entity, string $code, string $name, string $bankName) {
        $account = BankAccount::query()->withoutEntityScope()->create(['entity_id' => $entity->id, 'code' => $code, 'name' => $name, 'bank_name' => $bankName, 'account_number' => '0099'.$code, 'is_active' => true]);
        ChartOfAccounts::ensureBankLedger($account);

        return $account->fresh();
    };
    $bdo = $bank($this->entity, '11', 'Payroll BDO', 'BDO');
    $bpi = $bank($this->entity, '12', 'Operating BPI', 'BPI');
    $elsewhere = Entity::create(['code' => 'OTHER-BR', 'name' => 'Other Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP']);
    $theirs = $bank($elsewhere, '21', 'Their account', 'BDO');

    // The payroll bank is picked in the Employee Directory from the company's registered accounts only; the employee's
    // bank follows it.
    Permission::findOrCreate('libraries.employees.manage', 'web');
    $this->user->givePermissionTo('libraries.employees.manage');
    $save = fn (?int $bankId) => ($this->as)()->put("/libraries/employees/{$this->monthly->id}", [
        'employee_code' => 'E-001', 'firstname' => 'Maria', 'lastname' => 'Santos', 'employment_status' => 'active', 'employment_type' => 'regular',
        'pay_type' => 'monthly', 'basic_pay' => 30000, 'charge_bank_account_id' => $bankId,
    ]);
    $save($theirs->id)->assertSessionHasErrors(['charge_bank_account_id' => "Choose one of the bank accounts registered for the employee's company."]);
    $save($bpi->id)->assertSessionHasNoErrors();
    expect($this->monthly->fresh()->only(['charge_bank_account_id', 'bank_name']))->toBe(['charge_bank_account_id' => $bpi->id, 'bank_name' => 'BPI']);
    $save(null)->assertSessionHasNoErrors(); // cash or cheque
    expect($this->monthly->fresh()->only(['charge_bank_account_id', 'bank_name']))->toBe(['charge_bank_account_id' => null, 'bank_name' => null]);
    $save($bdo->id)->assertSessionHasNoErrors();
    expect($this->monthly->fresh()->only(['charge_bank_account_id', 'bank_name']))->toBe(['charge_bank_account_id' => $bdo->id, 'bank_name' => 'BDO']);

    fillCutoff($this->monthly, $this->daily);
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute")->assertSessionHasNoErrors();
    $run = PayrollRun::firstOrFail();
    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasNoErrors();
    ($this->as)()->post("/payroll/runs/{$run->id}/post")->assertSessionHasNoErrors();
    $maria = Payslip::where('employee_id', $this->monthly->id)->firstOrFail();
    $jun = Payslip::where('employee_id', $this->daily->id)->firstOrFail();

    // The review lists each payslip with its preset account (Jun has none), and only this company's accounts.
    $review = fn () => ($this->as)()->get("/payroll/runs/{$run->id}")->assertOk();
    $charged = fn ($rows) => collect($rows)->pluck('charge_bank_account_id', 'id')->sortKeys()->all();
    $byPayslip = fn (array $banks) => collect($banks)->sortKeys()->all();
    $review()->assertInertia(fn (Assert $page) => $page
        ->has('bankAccounts', 2)
        ->where('bankAccounts.0.company', 'Payroll Clinic') // each option names the company it is registered to
        ->where('payslips', fn ($rows) => $charged($rows) === $byPayslip([$maria->id => $bdo->id, $jun->id => null])));

    // The account picked at release covers only employees without a payroll bank: it is required for them, and must
    // be registered for this company.
    ($this->as)()->post("/payroll/runs/{$run->id}/pay", ['paid_on' => '2026-10-15'])
        ->assertSessionHasErrors(['bank_account_id' => 'Choose the registered bank account to pay the 1 employee without a payroll bank from.']);
    ($this->as)()->post("/payroll/runs/{$run->id}/pay", ['paid_on' => '2026-10-15', 'bank_account_id' => $theirs->id])->assertSessionHasErrors('bank_account_id');
    ($this->as)()->post("/payroll/runs/{$run->id}/pay", ['paid_on' => '2026-10-15', 'bank_account_id' => $bpi->id])->assertSessionHasNoErrors();

    $run->refresh();
    $entry = JournalEntry::with('lines')->findOrFail($run->payment_journal_entry_id);
    $credits = $entry->lines->where('credit', '>', 0)->mapWithKeys(fn ($l) => [$l->account_id => round((float) $l->credit, 2)])->all();
    expect($credits)->toBe([$bdo->gl_account_id => (float) $maria->net_pay, $bpi->gl_account_id => (float) $jun->net_pay])
        ->and((float) $entry->total_debit)->toBe(round((float) $maria->net_pay + (float) $jun->net_pay, 2))
        ->and($entry->memo)->toContain('via Payroll BDO, Operating BPI')
        ->and($run->bank_account_id)->toBeNull()   // two accounts: each payslip keeps its own
        ->and($maria->fresh()->charge_bank_account_id)->toBe($bdo->id)
        ->and($jun->fresh()->charge_bank_account_id)->toBe($bpi->id);

    // Each bank's register shows its part of the release, tagged with the company, ready to reconcile.
    expect(BankTransaction::query()->withoutGlobalScope('entity')->where('source_type', 'payroll_payment')->orderBy('bank_account_id')->get()
        ->map(fn (BankTransaction $t) => [$t->bank_account_id, $t->entity_id, $t->direction, (float) $t->amount, $t->journal_entry_id])->all())
        ->toBe([
            [$bdo->id, $this->entity->id, 'out', (float) $maria->net_pay, $entry->id],
            [$bpi->id, $this->entity->id, 'out', (float) $jun->net_pay, $entry->id],
        ]);

    // Fixed at release: a later change to the preset doesn't rewrite history.
    $this->monthly->update(['charge_bank_account_id' => $bpi->id]);
    $review()->assertInertia(fn (Assert $page) => $page
        ->where('run.timeline.paid.bank', 'Payroll BDO, Operating BPI')
        ->where('payslips', fn ($rows) => $charged($rows) === $byPayslip([$maria->id => $bdo->id, $jun->id => $bpi->id])));

    // The disbursement list says which account pays whom, grouped by account.
    $csv = ($this->as)()->get("/payroll/runs/{$run->id}/export/bank")->streamedContent();
    expect($csv)->toContain('Paid from')->toContain('Payroll BDO')->toContain('Operating BPI');

    // Another company's account, once shared with this company, can be an employee's payroll bank.
    ChartOfAccounts::ensureBankLedger($theirs, $this->entity->id);
    $save($theirs->id)->assertSessionHasNoErrors();
    expect($this->monthly->fresh()->charge_bank_account_id)->toBe($theirs->id);
});
