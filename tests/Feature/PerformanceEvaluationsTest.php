<?php

use App\Enums\RoleEnum;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\PerformanceEvaluation;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

uses(RefreshDatabase::class);

/*
 * Performance reviews (Employee Handbook, Performance Evaluations): a reviewer drafts, rates every criterion and shares;
 * the employee reads and acknowledges. Nobody reviews themselves; a shared review no longer changes.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00');

    $this->entity = Entity::create(['code' => 'PE-BRANCH', 'name' => 'Review Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP', 'geofence_enforced' => false]);
    $makeUser = function (RoleEnum $role, ?Entity $entity = null) {
        $user = User::factory()->create();
        $user->assignRole($role->value);
        $user->entities()->attach(($entity ?? $this->entity)->id, ['is_default' => true]);

        return $user;
    };
    $makeEmployee = fn (User $user, string $code, ?Entity $entity = null) => Employee::create([
        'entity_id' => ($entity ?? $this->entity)->id, 'user_id' => $user->id, 'employee_code' => $code, 'firstname' => $code, 'lastname' => 'Test',
        'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 20000, 'rest_days' => ['sun'],
    ]);

    $this->accountant = $makeUser(RoleEnum::Accountant);
    $this->accountantEmployee = $makeEmployee($this->accountant, 'ACC-1');
    $this->staffUser = $makeUser(RoleEnum::Employee);
    $this->staff = $makeEmployee($this->staffUser, 'STF-1');
    $this->retainer = $makeUser(RoleEnum::AccountingRetainer);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
    $this->draft = fn (array $overrides = []) => ($this->as)($this->accountant)->post('/employee-management/performance', [
        'employee_id' => $this->staff->id, 'review_type' => 'periodic', 'period_start' => '2026-01-01', 'period_end' => '2026-09-30',
        'review_date' => '2026-10-14', 'ratings' => ['quality' => 4, 'customer_service' => 5, 'attendance' => 3],
        'strengths' => 'Patients ask for her by name.', 'improvements' => 'Late three times in September.', ...$overrides,
    ]);
});

afterEach(fn () => Carbon::setTestNow());

test('a reviewer drafts, rates every criterion and shares; the employee reads and acknowledges', function () {
    ($this->draft)()->assertSessionHasNoErrors();
    $review = PerformanceEvaluation::sole();
    expect($review->status)->toBe('draft')
        ->and((float) $review->overall_rating)->toBe(4.0)
        ->and($review->evaluator_id)->toBe($this->accountant->id);

    // The employee does not see a draft.
    ($this->as)($this->staffUser)->get('/employee-management/performance')
        ->assertInertia(fn (Assert $page) => $page->component('employee-management/performance/page')->where('canManage', false)->has('evaluations', 0));

    // Every criterion must be rated before it is shared.
    ($this->as)($this->accountant)->post("/employee-management/performance/{$review->id}/share")->assertSessionHasErrors('ratings');
    $ratings = ['quality' => 4, 'customer_service' => 5, 'attendance' => 3, 'teamwork' => 4, 'compliance' => 4, 'initiative' => 4];
    ($this->as)($this->accountant)->put("/employee-management/performance/{$review->id}", [
        ...$review->only(['employee_id', 'review_type', 'strengths', 'improvements']),
        'period_start' => '2026-01-01', 'period_end' => '2026-09-30', 'review_date' => '2026-10-14', 'ratings' => $ratings,
    ])->assertSessionHasNoErrors();
    expect((float) $review->fresh()->overall_rating)->toBe(4.0);
    ($this->as)($this->accountant)->post("/employee-management/performance/{$review->id}/share")->assertSessionHasNoErrors();
    expect($review->fresh()->status)->toBe('shared');

    // Shared: no more edits or deletion.
    ($this->as)($this->accountant)->delete("/employee-management/performance/{$review->id}")->assertSessionHasErrors('status');

    ($this->as)($this->staffUser)->get('/employee-management/performance')
        ->assertInertia(fn (Assert $page) => $page->has('evaluations', 1)->where('evaluations.0.can.acknowledge', true)->where('evaluations.0.can.edit', false));
    ($this->as)($this->staffUser)->post("/employee-management/performance/{$review->id}/acknowledge", ['employee_comments' => 'I will fix my mornings.'])
        ->assertSessionHasNoErrors();
    expect($review->fresh())
        ->status->toBe('acknowledged')
        ->employee_comments->toBe('I will fix my mornings.')
        ->acknowledged_at->not->toBeNull();
    ($this->as)($this->staffUser)->post("/employee-management/performance/{$review->id}/acknowledge")->assertSessionHasErrors('status');
});

test('nobody reviews themselves, and only the employee acknowledges their review', function () {
    ($this->draft)(['employee_id' => $this->accountantEmployee->id])->assertSessionHasErrors(['employee_id' => 'You cannot review yourself.']);
    ($this->as)($this->accountant)->get('/employee-management/performance')
        ->assertInertia(fn (Assert $page) => $page->where('canManage', true)->where('employees', fn ($list) => collect($list)->pluck('id')->all() === [$this->staff->id]));

    ($this->draft)()->assertSessionHasNoErrors();
    $review = PerformanceEvaluation::sole();
    $review->update(['status' => 'shared', 'shared_at' => now()]);
    ($this->as)($this->accountant)->post("/employee-management/performance/{$review->id}/acknowledge")->assertForbidden();
});

test('employees cannot write reviews, the outside reviewer has no access, and another company\'s review is not found', function () {
    ($this->as)($this->staffUser)->post('/employee-management/performance', ['employee_id' => $this->staff->id])->assertForbidden();
    ($this->as)($this->retainer)->get('/employee-management/performance')->assertForbidden();

    $other = Entity::create(['code' => 'OTHER', 'name' => 'Other Clinic', 'type' => 'branch', 'status' => 'active', 'currency' => 'PHP', 'geofence_enforced' => false]);
    $outsider = Employee::create([
        'entity_id' => $other->id, 'employee_code' => 'OUT-1', 'firstname' => 'Out', 'lastname' => 'Sider',
        'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 20000,
    ]);
    $foreign = PerformanceEvaluation::create([
        'entity_id' => $other->id, 'employee_id' => $outsider->id, 'review_type' => 'periodic',
        'period_start' => '2026-01-01', 'period_end' => '2026-06-30', 'review_date' => '2026-07-01', 'status' => 'draft',
    ]);

    ($this->as)($this->accountant)->post("/employee-management/performance/{$foreign->id}/share")->assertNotFound();
    ($this->draft)(['employee_id' => $outsider->id])->assertSessionHasErrors('employee_id');
});
