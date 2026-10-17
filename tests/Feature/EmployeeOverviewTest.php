<?php

use App\Models\AttendanceRequest;
use App\Models\AuditTrail;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\PayrollPeriod;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    Carbon::setTestNow('2026-10-20 09:00:00');
    $this->entity = Entity::create(['code' => 'OVR', 'name' => 'Overview Clinic', 'is_active' => true]);
    foreach (['libraries.employees.manage', 'payroll.view', 'leave.view', 'attendance.view', 'admin.audit-trails.view'] as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $make = function (string $role, array $permissions) {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate($role, 'web')->syncPermissions($permissions));
        $user->entities()->attach($this->entity->id, ['is_default' => true]);

        return $user;
    };
    $this->accountant = $make('Accountant', ['libraries.employees.manage', 'payroll.view', 'leave.view', 'attendance.view']);
    $this->owner = $make('Admin', ['libraries.employees.manage', 'payroll.view', 'leave.view', 'attendance.view', 'admin.audit-trails.view']);
    $this->clerk = $make('Clerk', ['libraries.employees.manage']);

    $this->login = User::factory()->create(['username' => 'maria.santos']);
    $this->login->assignRole(Role::findOrCreate('Employee', 'web'));
    $this->employee = Employee::create([
        'entity_id' => $this->entity->id, 'user_id' => $this->login->id, 'employee_code' => 'E-1', 'firstname' => 'Maria', 'lastname' => 'Santos',
        'employment_status' => 'active', 'employment_type' => 'regular', 'pay_type' => 'monthly', 'basic_pay' => 30000, 'is_active' => true,
        'hire_date' => '2025-01-06', 'rest_days' => [0],
    ]);

    $run = function (string $code, string $start, string $end, string $status) {
        $period = PayrollPeriod::create(['entity_id' => $this->entity->id, 'code' => $code, 'frequency' => 'semi_monthly', 'start_date' => $start, 'end_date' => $end, 'pay_date' => $end, 'status' => 'open']);
        $run = PayrollRun::create(['entity_id' => $this->entity->id, 'payroll_period_id' => $period->id, 'run_no' => 'PR-'.$code, 'status' => $status]);
        Payslip::create(['payroll_run_id' => $run->id, 'employee_id' => $this->employee->id, 'basic_pay' => 15000, 'gross_pay' => 15000,
            'sss' => 750, 'philhealth' => 375, 'pagibig' => 100, 'withholding_tax' => 300, 'net_pay' => 13475, 'thirteenth_month_accrual' => 1250]);
    };
    $run('2026-09-2', '2026-09-16', '2026-09-30', PayrollRun::STATUS_PAID);
    $run('2026-10-1', '2026-10-01', '2026-10-15', PayrollRun::STATUS_DRAFT);
    $run('2026-10-X', '2026-10-01', '2026-10-15', PayrollRun::STATUS_VOID);

    AttendanceRequest::create(['entity_id' => $this->entity->id, 'employee_id' => $this->employee->id, 'request_type' => 'overtime', 'work_date' => '2026-10-16',
        'requested_ot_hours' => 2, 'reason' => 'Inventory count', 'status' => 'pending']);
    DtrEntry::create(['entity_id' => $this->entity->id, 'employee_id' => $this->employee->id, 'work_date' => '2026-10-19', 'status' => DtrEntry::STATUS_APPROVED,
        'time_in' => '09:12:00', 'time_out' => '18:00:00', 'regular_hours' => 8, 'tardiness_minutes' => 12, 'attendance_status' => 'late', 'is_absent' => false, 'day_type' => 'regular']);

    $this->url = "/libraries/employees/{$this->employee->id}/overview";
    $this->as = fn (User $u) => $this->actingAs($u)->withSession(['current_entity_id' => $this->entity->id]);
});

afterEach(fn () => Carbon::setTestNow());

test('the profile view loads payroll, requests and time records, without the audit trail for the accountant', function () {
    $json = ($this->as)($this->accountant)->getJson($this->url)->assertOk()->json();

    expect($json['can'])->toBe(['payroll' => true, 'requests' => true, 'attendance' => true, 'activity' => false])
        ->and($json['activity'])->toBeNull()
        ->and($json['account']['username'])->toBe('maria.santos')
        ->and($json['account']['last_login_at'])->toBeNull()
        ->and($json['contributions']['sss']['employee'])->toEqual(1500)
        // Draft and paid payslips, newest first; the voided draft is left out. Only released pay counts toward the year.
        ->and(collect($json['payroll']['payslips'])->pluck('run.status')->all())->toBe(['draft', 'paid'])
        ->and($json['payroll']['ytd']['net'])->toEqual(13475)
        ->and($json['requests']['items'])->toHaveCount(1)
        ->and($json['requests']['items'][0]['kind'])->toBe('overtime')
        ->and($json['requests']['counts']['pending'])->toBe(1)
        ->and($json['attendance']['days'])->toHaveCount(1)
        ->and($json['attendance']['summary']['late_minutes'])->toBe(12);
});

test('the owner also sees the activity log for the employee', function () {
    ($this->as)($this->owner)->put("/libraries/employees/{$this->employee->id}", [
        'employee_code' => 'E-1', 'firstname' => 'Maria', 'lastname' => 'Santos', 'employment_status' => 'active', 'employment_type' => 'regular',
        'pay_type' => 'monthly', 'basic_pay' => 32000,
    ])->assertSessionHasNoErrors();
    AuditTrail::query()->create(['user_id' => $this->login->id, 'event' => 'login', 'action' => 'login', 'subject_type' => User::class,
        'subject_id' => (string) $this->login->id, 'description' => 'Signed in with password', 'source' => 'web']);

    $json = ($this->as)($this->owner)->getJson($this->url)->assertOk()->json();

    $events = collect($json['activity']['items']);
    expect($json['can']['activity'])->toBeTrue()
        ->and($events->contains(fn ($e) => $e['event'] === 'updated' && $e['subject']['type'] === Employee::class
            && collect($e['changes'])->contains(fn ($c) => $c['field'] === 'basic_pay')))->toBeTrue()
        ->and($events->contains(fn ($e) => $e['event'] === 'login'))->toBeTrue()
        ->and($events->every(fn ($e) => $e['request']['payload'] === null))->toBeTrue()
        ->and($json['account']['last_login_at'])->not->toBeNull();
});

test('histories follow the viewer’s permissions, and the view needs directory access', function () {
    $json = ($this->as)($this->clerk)->getJson($this->url)->assertOk()->json();
    expect($json['payroll'])->toBeNull()->and($json['requests'])->toBeNull()->and($json['attendance'])->toBeNull()->and($json['activity'])->toBeNull();

    $outsider = User::factory()->create();
    $outsider->entities()->attach($this->entity->id, ['is_default' => true]);
    ($this->as)($outsider)->getJson($this->url)->assertForbidden();
});
