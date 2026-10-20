<?php

use App\Models\Entity;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;

uses(RefreshDatabase::class);

const OVERVIEW_PERMISSIONS = [
    'dashboard.view', 'journals.view', 'periods.view',
    'billing.view', 'integration.optical.view', 'ap.view', 'banks.view',
    'libraries.employees.manage', 'requests.approve', 'requests.manage', 'attendance.manage', 'payroll.view', 'compliance.view',
    'reports.income-statement.view',
    'libraries.partners.manage', 'libraries.vendors.manage', 'libraries.cost-centers.manage', 'libraries.tax-codes.manage',
    'admin.users.manage', 'admin.roles-permissions.manage', 'admin.audit-trails.view',
];

function overviewUser(array $permissions): User
{
    foreach ($permissions as $permission) {
        Permission::findOrCreate($permission, 'web');
    }

    $entity = Entity::firstOrCreate(['code' => 'OVW'], ['name' => 'Overview Clinic', 'is_active' => true]);
    $user = User::factory()->create();
    $user->givePermissionTo($permissions);
    $user->entities()->attach($entity->id, ['is_default' => true]);

    return $user;
}

test('guests are redirected to login from the overview', function () {
    $this->get(route('overview'))->assertRedirect(route('login'));
});

test('home redirects non-employee users to the overview', function () {
    $this->actingAs(User::factory()->create())
        ->get(route('home'))
        ->assertRedirect(route('overview'));
});

test('overview loads metrics for every module the user can access', function () {
    $this->actingAs(overviewUser(OVERVIEW_PERMISSIONS))
        ->get(route('overview'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('overview')
            ->missing('modules')
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->has('modules', 9)
                ->has('modules.Accounting')
                ->has('modules.Admin', 3)
                ->where('modules.Billing.1.label', 'Overdue invoices')
            )
        );
});

test('overview only returns metrics the user is permitted to see', function () {
    $this->actingAs(overviewUser(['requests.approve', 'requests.manage']))
        ->get(route('overview'))
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps(fn (Assert $reload) => $reload
                // Whoever decides on employees' requests sees both queues.
                ->has('modules', 1)
                ->has('modules.Employee Management', 2)
                ->where('modules.Employee Management.0.label', 'Leave to approve')
                ->where('modules.Employee Management.0.value', 0)
                ->where('modules.Employee Management.1.label', 'Attendance requests')
            )
        );
});

test('overview omits metrics that link to pages the user cannot open', function () {
    // payroll.view opens Payroll but not the Employee Directory, so "Active employees" must not be sent.
    $this->actingAs(overviewUser(['payroll.view']))
        ->get(route('overview'))
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps(fn (Assert $reload) => $reload
                ->has('modules', 1)
                ->has('modules.Employee Management', 1)
                ->where('modules.Employee Management.0.label', 'Latest payroll')
            )
        );
});

test('overview returns no metrics for a user without module permissions', function () {
    $this->actingAs(overviewUser([]))
        ->get(route('overview'))
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps(fn (Assert $reload) => $reload->where('modules', []))
        );
});
