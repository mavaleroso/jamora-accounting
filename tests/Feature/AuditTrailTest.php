<?php

use App\Models\AuditTrail;
use App\Models\ComplianceItem;
use App\Models\Entity;
use App\Models\User;
use App\Support\Audit\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->entity = Entity::create(['code' => 'AUD', 'name' => 'Audit Clinic', 'is_active' => true]);
    foreach (['admin.audit-trails.view', 'admin.roles-permissions.manage', 'admin.users.manage', 'compliance.view', 'compliance.manage'] as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->admin = User::factory()->create(['firstname' => 'Ada', 'lastname' => 'Admin']);
    $this->admin->givePermissionTo(['admin.audit-trails.view', 'admin.roles-permissions.manage', 'admin.users.manage', 'compliance.view', 'compliance.manage']);
    $this->admin->entities()->attach($this->entity->id, ['is_default' => true]);
    $this->as = fn () => $this->actingAs($this->admin)->withSession(['current_entity_id' => $this->entity->id]);
    AuditTrail::query()->delete(); // setup noise
});

test('create, update and delete through the app are recorded with who, where and what changed', function () {
    ($this->as)()->post('/employee-management/compliance', [
        'title' => 'Fire safety certificate', 'category' => 'local_government', 'period' => 'October 2026', 'due_date' => '2026-10-30', 'owner_role' => 'Admin',
    ])->assertSessionHasNoErrors();
    $item = ComplianceItem::firstOrFail();

    $created = AuditTrail::where('event', 'created')->where('subject_type', ComplianceItem::class)->firstOrFail();
    expect($created->user_id)->toBe($this->admin->id)
        ->and($created->entity_id)->toBe($this->entity->id)
        ->and($created->route_name)->toBe('employee-management.compliance.store')
        ->and($created->new_values['title'])->toBe('Fire safety certificate')
        ->and($created->subject_label)->toBe('Compliance Item Fire safety certificate')
        ->and($created->batch_id)->not->toBeNull();

    ($this->as)()->post("/employee-management/compliance/{$item->id}/status", ['status' => 'prepared', 'amount' => 500])->assertSessionHasNoErrors();
    $updated = AuditTrail::where('event', 'updated')->where('subject_id', (string) $item->id)->latest('id')->firstOrFail();
    expect($updated->old_values['status'])->toBe('pending')
        ->and($updated->new_values['status'])->toBe('prepared')
        ->and(array_key_exists('updated_at', $updated->new_values))->toBeFalse()
        ->and(array_key_exists('title', $updated->new_values))->toBeFalse(); // only what changed

    $item->delete();
    $deleted = AuditTrail::where('event', 'deleted')->where('subject_id', (string) $item->id)->firstOrFail();
    expect($deleted->old_values['title'])->toBe('Fire safety certificate')->and($deleted->new_values)->toBeNull();
});

test('secrets are masked and role permission changes are recorded', function () {
    $this->admin->update(['password' => 'new-secret-123']);
    $pw = AuditTrail::where('subject_type', User::class)->where('event', 'updated')->latest('id')->firstOrFail();
    expect($pw->new_values['password'])->toBe('[hidden]')->and($pw->old_values['password'])->toBe('[hidden]');

    $role = Role::findOrCreate('Auditor', 'web');
    ($this->as)()->put("/admin/roles/{$role->id}", ['name' => 'Auditor', 'permissions' => ['compliance.view']])->assertSessionHasNoErrors();

    $grant = AuditTrail::where('subject_type', Role::class)->where('subject_id', (string) $role->id)->whereNotNull('new_values')->latest('id')->firstOrFail();
    expect($grant->new_values['permissions'])->toBe(['compliance.view'])->and($grant->description)->toContain('Attached permissions');
});

test('a write request that changes rows without Eloquent is still recorded; rejected requests are not', function () {
    Route::middleware('web')->post('/_audit/bulk', function () {
        DB::table('entities')->update(['name' => 'Renamed in bulk']);

        return back();
    })->name('testing.bulk-rename');
    Route::middleware('web')->post('/_audit/invalid', fn () => request()->validate(['x' => 'required']))->name('testing.invalid');

    ($this->as)()->post('/_audit/bulk', ['reason' => 'cleanup', 'password' => 'nope']);
    $row = AuditTrail::where('event', 'request')->firstOrFail();
    expect($row->route_name)->toBe('testing.bulk-rename')
        ->and($row->action)->toBe('bulk_rename')
        ->and($row->request_payload)->toBe(['reason' => 'cleanup']);

    ($this->as)()->post('/_audit/invalid', []);
    expect(AuditTrail::where('route_name', 'testing.invalid')->exists())->toBeFalse();
});

test('auditing can be suspended for maintenance', function () {
    app(AuditLogger::class)->withoutAuditing(fn () => Entity::create(['code' => 'TMP', 'name' => 'Temp', 'is_active' => true]));
    expect(AuditTrail::where('subject_type', Entity::class)->exists())->toBeFalse();
});

test('the audit trail screen filters, shows record history and exports', function () {
    ($this->as)()->post('/employee-management/compliance', [
        'title' => 'Sanitary permit', 'category' => 'local_government', 'period' => 'October 2026', 'due_date' => '2026-10-30', 'owner_role' => 'Admin',
    ]);
    $item = ComplianceItem::firstOrFail();
    $item->update(['owner_role' => 'HR']);

    ($this->as)()->get('/admin/audit-trails?subject_type='.urlencode(ComplianceItem::class)."&subject_id={$item->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/audit-trails/page')
            ->has('items', 2)
            ->where('items.0.event', 'updated')
            ->where('items.0.changes.0.field', 'owner_role')
            ->where('items.0.changes.0.from', 'Admin')
            ->where('items.0.changes.0.to', 'HR')
            ->where('subject', 'Compliance Item Sanitary permit'));

    ($this->as)()->get('/admin/audit-trails?event=deleted')->assertOk()->assertInertia(fn (Assert $page) => $page->has('items', 0));

    $csv = ($this->as)()->get('/admin/audit-trails/export?event=updated');
    $csv->assertOk();
    expect($csv->streamedContent())->toContain('owner_role')->toContain('Sanitary permit');
});

test('the audit trail needs its permission', function () {
    $user = User::factory()->create();
    $user->entities()->attach($this->entity->id, ['is_default' => true]);
    $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id])->get('/admin/audit-trails')->assertForbidden();
});

test('signing in and out are recorded with the user, IP address and device', function () {
    $user = User::factory()->create(['username' => 'sally', 'password' => 'secret-pass', 'status' => true]);
    $user->assignRole(Role::findOrCreate('Accountant', 'web')); // users without a role cannot sign in
    AuditTrail::query()->delete();

    $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.7'])->withHeader('User-Agent', 'AuditTest/1.0')
        ->post('/login', ['username' => 'sally', 'password' => 'secret-pass'])->assertRedirect();
    $this->assertAuthenticatedAs($user);

    $login = AuditTrail::where('event', 'login')->firstOrFail();
    expect($login->user_id)->toBe($user->id)
        ->and($login->subject_type)->toBe(User::class)
        ->and($login->subject_id)->toBe((string) $user->id)
        ->and($login->description)->toBe('Signed in with password')
        ->and($login->ip_address)->toBe('10.0.0.7')
        ->and($login->user_agent)->toBe('AuditTest/1.0');

    $this->post('/logout')->assertRedirect();
    $this->assertGuest();

    $logout = AuditTrail::where('event', 'logout')->firstOrFail();
    expect($logout->user_id)->toBe($user->id)->and($logout->description)->toBe('Signed out');
});

test('a failed sign-in is not recorded as a login', function () {
    User::factory()->create(['username' => 'sally', 'password' => 'secret-pass', 'status' => true])->assignRole(Role::findOrCreate('Accountant', 'web'));

    $this->post('/login', ['username' => 'sally', 'password' => 'wrong']);
    $this->assertGuest();

    expect(AuditTrail::where('event', 'login')->exists())->toBeFalse();
});

test('sign-ins can be filtered and are counted apart from changes', function () {
    app(AuditLogger::class)->authEvent('login', $this->admin, 'Signed in with password');

    ($this->as)()->get('/admin/audit-trails?event=login')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('filters.event', 'login')
            ->has('items', 1)
            ->where('items.0.event', 'login')
            ->where('summary.week.logins', 1)
            ->where('summary.today', 0));
});
