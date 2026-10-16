<?php

use App\Models\AttendanceRequest;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    // Wednesday 14 Oct; no payroll periods exist, so the current pay period is 1–15 Oct.
    Carbon::setTestNow('2026-10-14 15:00:00');

    foreach (['attendance.view', 'attendance.punch', 'leave.view', 'leave.file', 'roster.view', 'portal.view'] as $p) {
        Permission::findOrCreate($p, 'web');
    }

    $this->entity = Entity::create(['code' => 'ACC-BRANCH', 'name' => 'Accomplishment Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP']);

    $this->user = User::factory()->create(['email' => 'staff@acc.test']);
    $this->user->assignRole(Role::findOrCreate('Employee', 'web')->syncPermissions(['attendance.view', 'attendance.punch', 'leave.view', 'leave.file', 'roster.view', 'portal.view']));
    $this->user->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->employee = Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $this->user->id,
        'employee_code' => 'STF-1',
        'firstname' => 'Sam',
        'lastname' => 'Test',
        'email' => $this->user->email,
        'position' => 'Staff',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 30000,
        'rest_days' => ['sun'],
        'gender' => 'female',
    ]);

    $day = fn (string $date, string $status, ?string $accomplishment = null) => DtrEntry::create([
        'entity_id' => $this->entity->id,
        'employee_id' => $this->employee->id,
        'work_date' => $date,
        'time_in' => '09:00:00',
        'time_out' => '18:00:00',
        'status' => $status,
        'accomplishment' => $accomplishment,
    ]);
    $this->open = $day('2026-10-13', DtrEntry::STATUS_OPEN, '<p>Fitted 6 patients</p>');
    $this->approved = $day('2026-10-12', DtrEntry::STATUS_APPROVED, '<p>Inventory count</p>');
    $this->lastPeriod = $day('2026-09-30', DtrEntry::STATUS_OPEN);

    // Official business today, approved before the day: no time record yet.
    AttendanceRequest::create([
        'entity_id' => $this->entity->id, 'employee_id' => $this->employee->id, 'request_type' => AttendanceRequest::TYPE_OFFICIAL_BUSINESS,
        'work_date' => '2026-10-14', 'destination' => 'BIR RDO 47', 'reason' => 'Quarterly filing', 'status' => 'approved', 'filed_by' => $this->user->id,
    ]);

    $this->as = fn () => $this->actingAs($this->user)->withSession(['current_entity_id' => $this->entity->id]);
    $this->save = fn (string $date, string $html = '<p>Done</p>') => ($this->as)()->post('/employee-management/attendance/accomplishments', ['work_date' => $date, 'accomplishment' => $html]);
});

afterEach(fn () => Carbon::setTestNow());

test('the report lists the period with what can still be written', function () {
    ($this->as)()->get('/employee-management/attendance?view=accomplishments')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('view', 'accomplishments')
            ->where('accomplishments.window', ['from' => '2026-10-01', 'to' => '2026-10-14'])
            ->has('accomplishments.rows', 3)
            // Newest first: today's official business, with no record yet.
            ->where('accomplishments.rows.0.date', '2026-10-14')
            ->where('accomplishments.rows.0.official_business', 'BIR RDO 47')
            ->where('accomplishments.rows.0.dtr_id', null)
            ->where('accomplishments.rows.0.editable', true)
            ->where('accomplishments.rows.1.date', '2026-10-13')
            ->where('accomplishments.rows.1.accomplishment', '<p>Fitted 6 patients</p>')
            ->where('accomplishments.rows.1.editable', true)
            ->where('accomplishments.rows.2.date', '2026-10-12')
            ->where('accomplishments.rows.2.editable', false)
            ->where('accomplishments.rows.2.locked_reason', 'Day approved')
            ->where('accomplishments.missing', 1));
});

test('an open day in the current pay period can be updated', function () {
    ($this->save)('2026-10-13', '<p>Fitted 7 patients</p><script>x</script>')->assertSessionHasNoErrors();

    expect($this->open->fresh()->accomplishment)->toBe('<p>Fitted 7 patients</p>');
});

test('approved, past-period, future and unrecorded days cannot be written', function () {
    ($this->save)('2026-10-12')->assertSessionHasErrors('work_date');
    ($this->save)('2026-09-30')->assertSessionHasErrors('work_date');
    ($this->save)('2026-10-15')->assertSessionHasErrors('work_date');
    ($this->save)('2026-10-09')->assertSessionHasErrors('work_date');
    ($this->save)('2026-10-13', '<p> </p>')->assertSessionHasErrors('accomplishment');

    expect($this->approved->fresh()->accomplishment)->toBe('<p>Inventory count</p>')
        ->and($this->lastPeriod->fresh()->accomplishment)->toBeNull()
        ->and(DtrEntry::whereDate('work_date', '2026-10-09')->exists())->toBeFalse();
});

test('an official business day can be written directly, creating its credited record', function () {
    ($this->save)('2026-10-14', '<p>Filed the 2550Q at BIR</p>')->assertSessionHasNoErrors();

    $dtr = DtrEntry::where('employee_id', $this->employee->id)->whereDate('work_date', '2026-10-14')->firstOrFail();
    expect($dtr->accomplishment)->toBe('<p>Filed the 2550Q at BIR</p>')
        ->and($dtr->source)->toBe('official_business')
        ->and($dtr->time_in)->toBe('09:00:00')
        ->and($dtr->time_out)->toBe('18:00:00')
        ->and($dtr->status)->toBe(DtrEntry::STATUS_OPEN)
        ->and(AttendanceRequest::firstOrFail()->dtr_entry_id)->toBe($dtr->id);

    // Still editable afterwards, like any open day.
    ($this->save)('2026-10-14', '<p>Filed the 2550Q and 1601C</p>')->assertSessionHasNoErrors();
    expect($dtr->fresh()->accomplishment)->toBe('<p>Filed the 2550Q and 1601C</p>');
});
