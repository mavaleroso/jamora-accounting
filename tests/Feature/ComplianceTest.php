<?php

use App\Models\ComplianceItem;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow('2026-11-12 09:00:00');
    $this->entity = Entity::create(['code' => 'CMP', 'name' => 'Compliance Clinic', 'is_active' => true]);

    foreach (['compliance.view', 'compliance.manage', 'compliance.verify', 'dashboard.view'] as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $make = function (array $permissions) {
        $u = User::factory()->create();
        $u->givePermissionTo($permissions);
        $u->entities()->attach($this->entity->id, ['is_default' => true]);

        return $u;
    };
    $this->preparer = $make(['compliance.view', 'compliance.manage']);
    $this->verifier = $make(['compliance.view', 'compliance.verify']);
    $this->viewer = $make(['dashboard.view']);

    $this->as = fn (User $u) => $this->actingAs($u)->withSession(['current_entity_id' => $this->entity->id]);

    // October payroll: one posted cut-off, one still a draft.
    $emp = Employee::create(['entity_id' => $this->entity->id, 'employee_code' => 'C-1', 'firstname' => 'Ana', 'lastname' => 'Cruz', 'is_active' => true, 'employment_status' => 'active']);
    foreach ([['PP-2026-10-1', '2026-10-01', '2026-10-15', 'paid'], ['PP-2026-10-2', '2026-10-16', '2026-10-31', 'draft']] as [$code, $start, $end, $status]) {
        $period = PayrollPeriod::create(['entity_id' => $this->entity->id, 'code' => $code, 'frequency' => 'semi_monthly', 'start_date' => $start, 'end_date' => $end, 'status' => 'open']);
        $run = PayrollRun::create(['entity_id' => $this->entity->id, 'payroll_period_id' => $period->id, 'run_no' => 'PR-'.$code, 'status' => $status]);
        Payslip::create(['payroll_run_id' => $run->id, 'employee_id' => $emp->id, 'sss' => 875, 'sss_er' => 1725, 'sss_ec' => 15, 'philhealth' => 750, 'philhealth_er' => 750,
            'pagibig' => 100, 'pagibig_er' => 100, 'withholding_tax' => 1200]);
    }
});

afterEach(fn () => Carbon::setTestNow());

test('opening the page creates this and last month’s calendar and shows payroll amounts', function () {
    ($this->as)($this->preparer)->get('/employee-management/compliance')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('employee-management/compliance/page')
            ->where('can.manage', true)
            ->where('can.verify', false)
            ->where('items', function ($items) {
                $sss = collect($items)->first(fn ($i) => $i['form_code'] === 'SSS-R5' && $i['period'] === 'October 2026');

                return (float) $sss['payroll']['amount'] === 2615.0 && $sss['payroll']['runs'] === 1 && $sss['payroll']['unreleased'] === 1;
            }));

    expect(ComplianceItem::where('period', 'October 2026')->exists())->toBeTrue()
        ->and(ComplianceItem::where('period', 'November 2026')->exists())->toBeTrue();
});

test('steps go in order, filing needs a reference, late filings stay flagged, and a second person verifies', function () {
    $this->artisan('compliance:generate')->assertSuccessful();
    $item = ComplianceItem::where('form_code', '1601-C')->where('period', 'October 2026')->firstOrFail(); // due Nov 10

    // No skipping ahead.
    ($this->as)($this->preparer)->post("/employee-management/compliance/{$item->id}/status", ['status' => 'submitted', 'reference_no' => 'X', 'filed_on' => '2026-11-11'])
        ->assertSessionHasErrors('status');

    ($this->as)($this->preparer)->post("/employee-management/compliance/{$item->id}/status", ['status' => 'prepared', 'amount' => 1200])->assertSessionHasNoErrors();
    ($this->as)($this->preparer)->post("/employee-management/compliance/{$item->id}/status", ['status' => 'submitted', 'filed_on' => '2026-11-11'])
        ->assertSessionHasErrors('reference_no');
    ($this->as)($this->preparer)->post("/employee-management/compliance/{$item->id}/status", ['status' => 'submitted', 'reference_no' => 'EFPS-123', 'filed_on' => '2026-11-11'])
        ->assertSessionHasNoErrors();

    $item->refresh();
    expect($item->status)->toBe('submitted')->and($item->isLate())->toBeTrue()->and($item->daysLate())->toBe(1);

    // Preparers cannot verify (no permission); verifiers can return it, then sign off the corrected filing.
    ($this->as)($this->preparer)->post("/employee-management/compliance/{$item->id}/verify")->assertForbidden();
    ($this->as)($this->verifier)->post("/employee-management/compliance/{$item->id}/return", ['reason' => 'Attach the eFPS confirmation'])->assertSessionHasNoErrors();
    expect($item->fresh()->status)->toBe('prepared')->and($item->fresh()->notes)->toContain('Attach the eFPS confirmation');

    ($this->as)($this->preparer)->post("/employee-management/compliance/{$item->id}/status", ['status' => 'submitted', 'reference_no' => 'EFPS-123', 'filed_on' => '2026-11-11'])->assertSessionHasNoErrors();
    ($this->as)($this->verifier)->post("/employee-management/compliance/{$item->id}/verify")->assertSessionHasNoErrors();
    expect($item->fresh()->status)->toBe('verified')->and($item->fresh()->verified_by)->toBe($this->verifier->id);
});

test('whoever prepared or filed an item cannot verify it, even with the permission', function () {
    $both = User::factory()->create();
    $both->givePermissionTo(['compliance.view', 'compliance.manage', 'compliance.verify']);
    $both->entities()->attach($this->entity->id);

    $item = ComplianceItem::create(['entity_id' => $this->entity->id, 'title' => 'BIR 1601-C', 'form_code' => '1601-C', 'category' => 'statutory_tax', 'period' => 'October 2026',
        'due_date' => '2026-11-10', 'owner_role' => 'Accounting', 'status' => 'pending']);
    ($this->as)($both)->post("/employee-management/compliance/{$item->id}/status", ['status' => 'prepared']);
    ($this->as)($both)->post("/employee-management/compliance/{$item->id}/status", ['status' => 'submitted', 'reference_no' => 'R-1', 'filed_on' => '2026-11-09']);

    ($this->as)($both)->post("/employee-management/compliance/{$item->id}/verify")->assertSessionHasErrors('status');
    expect($item->fresh()->status)->toBe('submitted')->and($item->fresh()->isLate())->toBeFalse();
});

test('dashboard access alone no longer opens compliance', function () {
    ($this->as)($this->viewer)->get('/employee-management/compliance')->assertForbidden();
});
