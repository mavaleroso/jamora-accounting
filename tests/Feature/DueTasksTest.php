<?php

use App\Models\ComplianceItem;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\SystemSetting;
use App\Services\DueTasks;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

/*
 * The housekeeping a scheduler would do, done when it falls due, so the app runs where no scheduler can
 * (shared hosting): closing finished attendance days and keeping the compliance calendar current.
 */
beforeEach(function () {
    // Wednesday. Default shift 09:00–18:00; Sunday rest.
    Carbon::setTestNow('2026-10-14 09:00:00');
    $this->entity = Entity::create(['code' => 'DUE', 'name' => 'Due Clinic', 'is_active' => true]);

    foreach (['DUE-1' => 'Ana', 'DUE-2' => 'Ben'] as $code => $first) {
        Employee::create([
            'entity_id' => $this->entity->id, 'employee_code' => $code, 'firstname' => $first, 'lastname' => 'Test', 'position' => 'Staff',
            'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 20000, 'rest_days' => ['sun'],
        ]);
    }

    $this->absent = fn (string $date) => DtrEntry::withoutGlobalScopes()->whereDate('work_date', $date)->where('attendance_status', 'absent')->count();
    $this->run = fn (int $budget = 20) => app(DueTasks::class)->run(force: true, budgetSeconds: $budget);
});

afterEach(fn () => Carbon::setTestNow());

test('the first run closes only the latest finished day, never the history before it', function () {
    $done = ($this->run)();

    expect($done['days_closed'])->toBe(['2026-10-13'])
        ->and(($this->absent)('2026-10-13'))->toBe(2)
        ->and(($this->absent)('2026-10-12'))->toBe(0)
        ->and(app(DueTasks::class)->closedThrough())->toBe('2026-10-13');

    // Nothing left to close: nothing happens.
    expect(($this->run)()['days_closed'])->toBe([]);
});

test('a day is closed from 01:00 the next morning, as the nightly job did', function () {
    Carbon::setTestNow('2026-10-14 00:30:00');
    expect(($this->run)()['days_closed'])->toBe(['2026-10-12']);

    Carbon::setTestNow('2026-10-14 01:00:00');
    expect(($this->run)()['days_closed'])->toBe(['2026-10-13']);
});

test('days nobody visited are closed on the next visit, oldest first, and a cleared cache changes nothing', function () {
    ($this->run)();

    // Nobody opened the app from Wednesday to Saturday.
    Carbon::setTestNow('2026-10-18 09:00:00');
    Cache::flush();
    $done = ($this->run)();

    expect($done['days_closed'])->toBe(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
        ->and(($this->absent)('2026-10-16'))->toBe(2)
        ->and(SystemSetting::query()->find(DueTasks::ATTENDANCE_CLOSED_THROUGH)->value)->toBe('2026-10-17');
});

test('a visit stops at its time limit and the next one continues', function () {
    ($this->run)();
    Carbon::setTestNow('2026-10-17 09:00:00');

    // A spent budget still closes one day, so a backlog always moves.
    expect(($this->run)(budget: 0)['days_closed'])->toBe(['2026-10-14'])
        ->and(($this->run)()['days_closed'])->toBe(['2026-10-15', '2026-10-16']);
});

test('the compliance calendar is kept current once a day', function () {
    Carbon::setTestNow('2026-11-12 09:00:00');

    $created = ($this->run)()['compliance_created'];
    expect($created)->toBeGreaterThan(0)
        ->and(ComplianceItem::where('period', 'October 2026')->exists())->toBeTrue()
        ->and(ComplianceItem::where('period', 'November 2026')->exists())->toBeTrue()
        // Already checked today.
        ->and(($this->run)()['compliance_created'])->toBeNull();

    Carbon::setTestNow('2026-12-01 09:00:00');
    expect(($this->run)()['compliance_created'])->toBeGreaterThan(0)
        ->and(ComplianceItem::where('period', 'December 2026')->exists())->toBeTrue();
});

test('page visits do it after the page is sent, at most every few minutes, and the command does it on demand', function () {
    config(['people.due_tasks_on_visits' => true, 'people.due_tasks_check_seconds' => 600]);

    $this->get('/login')->assertOk();
    expect(($this->absent)('2026-10-13'))->toBe(2);

    // A day later, but checked a moment ago: not yet.
    Carbon::setTestNow('2026-10-15 09:00:00');
    Cache::put('automation.due-tasks-checked', true, 600);
    $this->get('/login')->assertOk();
    expect(($this->absent)('2026-10-14'))->toBe(0);

    $this->artisan('housekeeping:run')->expectsOutputToContain('Attendance closed for 2026-10-14')->assertSuccessful();
    expect(($this->absent)('2026-10-14'))->toBe(2);

    // Switched off (a scheduler does it instead): visits leave it alone.
    config(['people.due_tasks_on_visits' => false]);
    Carbon::setTestNow('2026-10-16 09:00:00');
    Cache::flush();
    $this->get('/login')->assertOk();
    expect(($this->absent)('2026-10-15'))->toBe(0);
});
