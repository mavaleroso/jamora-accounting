<?php

use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\JournalEntry;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\User;
use App\Services\Payroll\PayrollCalculator;
use Carbon\Carbon;
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
    $this->daily = $make(['employee_code' => 'E-002', 'firstname' => 'Jun', 'lastname' => 'Reyes', 'pay_type' => 'daily', 'basic_pay' => 600]);

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
    expect((float) $d->basic_pay)->toBe(1200.0)
        ->and($d->is_mwe)->toBeTrue()
        ->and((float) $d->withholding_tax)->toBe(0.0)
        ->and(collect($d->meta['warnings'])->contains('No TIN number on file.'))->toBeTrue();
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

    // Employees only see payslips once posted.
    ($this->as)()->post("/payroll/runs/{$run->id}/pay", ['paid_on' => '2026-10-15'])->assertSessionHasNoErrors();
    expect($run->fresh()->status)->toBe('paid')
        ->and($run->fresh()->payment_journal_entry_id)->not->toBeNull()
        ->and($this->period->fresh()->status)->toBe('paid');

    ($this->as)()->get("/payroll/runs/{$run->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('payroll/runs/show')->where('run.status', 'paid')->has('payslips', 2)->has('remittances', 4));

    $csv = ($this->as)()->get("/payroll/runs/{$run->id}/export/bank");
    $csv->assertOk();
    expect($csv->streamedContent())->toContain('001100220033')->toContain('CASH / CHEQUE');
});

test('approval is blocked by negative net pay and returning to draft unlocks the cut-off', function () {
    dtr($this->monthly, '2026-10-02');
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute");
    $run = PayrollRun::firstOrFail();

    ($this->as)()->post("/payroll/runs/{$run->id}/adjustments", ['employee_id' => $this->monthly->id, 'category' => 'company_loan', 'amount' => 50000]);
    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasErrors('status');

    $adjustment = $run->adjustments()->firstOrFail();
    ($this->as)()->delete("/payroll/runs/{$run->id}/adjustments/{$adjustment->id}")->assertSessionHasNoErrors();
    ($this->as)()->post("/payroll/runs/{$run->id}/approve")->assertSessionHasNoErrors();
    expect(DtrEntry::firstOrFail()->status)->toBe(DtrEntry::STATUS_LOCKED);

    ($this->as)()->post("/payroll/runs/{$run->id}/reopen")->assertSessionHasNoErrors();
    expect($run->fresh()->status)->toBe('draft')
        ->and(DtrEntry::firstOrFail()->status)->toBe(DtrEntry::STATUS_APPROVED);

    // Recomputing keeps a single run for the period.
    ($this->as)()->post("/payroll/runs/{$run->id}/recompute")->assertSessionHasNoErrors();
    expect(PayrollRun::count())->toBe(1);

    // Voiding frees the period; the next computation gets a fresh run number.
    ($this->as)()->post("/payroll/runs/{$run->id}/void")->assertRedirect();
    ($this->as)()->post("/payroll/runs/periods/{$this->period->id}/compute");
    expect(PayrollRun::where('status', 'draft')->value('run_no'))->toBe('PR-PP-2026-10-1-2');
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
