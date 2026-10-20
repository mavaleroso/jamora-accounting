<?php

use App\Models\AttendanceRequest;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\User;
use App\Support\PrivateFiles;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

/*
 * An official business request can carry a supporting document (travel order, invitation, memo, receipt). It is kept
 * on the private disk and only the employee who filed it and attendance approvers can open it.
 */
beforeEach(function () {
    Carbon::setTestNow('2026-10-14 09:00:00'); // a Wednesday
    Storage::fake(PrivateFiles::DISK);

    foreach (['attendance.view', 'attendance.punch', 'attendance.manage', 'leave.view', 'leave.file', 'portal.view', 'requests.approve', 'requests.manage'] as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->entity = Entity::create(['code' => 'OB-BR', 'name' => 'OB Clinic', 'is_active' => true]);

    $person = function (string $code, string $first, string $role, array $permissions) {
        $user = User::factory()->create();
        $user->assignRole(Role::findOrCreate($role, 'web')->syncPermissions($permissions));
        $user->entities()->attach($this->entity->id, ['is_default' => true]);
        Employee::create(['entity_id' => $this->entity->id, 'user_id' => $user->id, 'employee_code' => $code, 'firstname' => $first, 'lastname' => 'Test',
            'employment_status' => 'active', 'pay_type' => 'monthly', 'basic_pay' => 30000, 'rest_days' => [0]]);

        return $user;
    };
    $this->staff = $person('STF-1', 'Sam', 'Employee', ['attendance.view', 'attendance.punch', 'leave.view', 'leave.file', 'portal.view']);
    $this->colleague = $person('STF-2', 'Cora', 'Employee', ['attendance.view', 'attendance.punch', 'leave.view', 'leave.file', 'portal.view']);
    $this->hr = $person('HR-1', 'Helen', 'HR Manager', ['attendance.view', 'attendance.manage', 'leave.view', 'requests.approve', 'requests.manage']);

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
    $this->file = fn (array $extra = []) => ($this->as)($this->staff)->post('/employee-management/requests', [
        'kind' => 'official_business', 'work_date' => '2026-10-15', 'destination' => 'BIR RDO 47, East Makati',
        'reason' => 'Filing the quarterly returns in person', ...$extra,
    ]);
});

afterEach(fn () => Carbon::setTestNow());

test('an official business request is filed with its supporting document, kept private', function () {
    ($this->file)(['attachment' => UploadedFile::fake()->create('travel-order.pdf', 300, 'application/pdf')])->assertSessionHasNoErrors();

    $request = AttendanceRequest::query()->where('request_type', AttendanceRequest::TYPE_OFFICIAL_BUSINESS)->sole();
    expect($request->attachment_path)->toStartWith('official-business/');
    Storage::disk(PrivateFiles::DISK)->assertExists($request->attachment_path);

    // The request lists it, for the employee and for the approver.
    $url = route('employee-management.requests.attendance.attachment', $request->id, absolute: true);
    ($this->as)($this->staff)->get('/employee-management/requests?view=mine')->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('feed.data.0.details.attachment_url', $url));

    // Only the employee and attendance approvers can open it.
    ($this->as)($this->staff)->get($url)->assertOk();
    ($this->as)($this->hr)->get($url)->assertOk();
    ($this->as)($this->colleague)->get($url)->assertForbidden();
});

test('the document is optional, must be a PDF or photo up to 5 MB, and only official business keeps one', function () {
    ($this->file)()->assertSessionHasNoErrors();
    $request = AttendanceRequest::query()->sole();
    expect($request->attachment_path)->toBeNull();
    ($this->as)($this->staff)->get(route('employee-management.requests.attendance.attachment', $request->id))->assertNotFound();

    ($this->file)(['work_date' => '2026-10-16', 'attachment' => UploadedFile::fake()->create('notes.docx', 100)])
        ->assertSessionHasErrors(['attachment' => 'Attach a PDF or a photo (JPG, PNG, WebP or HEIC).']);
    ($this->file)(['work_date' => '2026-10-16', 'attachment' => UploadedFile::fake()->create('scan.pdf', 6000, 'application/pdf')])
        ->assertSessionHasErrors(['attachment' => 'The document must not be larger than 5 MB.']);

    // A refused filing (rest day) leaves no file behind; other request types ignore the field.
    ($this->file)(['work_date' => '2026-10-18', 'attachment' => UploadedFile::fake()->image('memo.jpg')])->assertSessionHasErrors('work_date');
    ($this->as)($this->staff)->post('/employee-management/requests', [
        'kind' => 'overtime', 'work_date' => '2026-10-15', 'reason' => 'Rush lens orders',
        'attachment' => UploadedFile::fake()->image('memo.jpg'),
    ])->assertSessionHasNoErrors();
    expect(AttendanceRequest::query()->where('request_type', AttendanceRequest::TYPE_OVERTIME)->value('attachment_path'))->toBeNull()
        ->and(Storage::disk(PrivateFiles::DISK)->allFiles())->toBe([]);
});
