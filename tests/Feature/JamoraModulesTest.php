<?php

use App\Models\Account;
use App\Models\AccountType;
use App\Models\BankAccount;
use App\Models\BenefitProgram;
use App\Models\ComplianceItem;
use App\Models\DtrEntry;
use App\Models\Employee;
use App\Models\Entity;
use App\Models\InventoryMovement;
use App\Models\ShiftRoster;
use App\Models\User;
use App\Support\EntityContext;
use Carbon\Carbon;
use Database\Seeders\AccountingSetupSeeder;
use Illuminate\Support\Facades\Http;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

beforeEach(function () {
    // Setup Entity
    $this->entity = Entity::create([
        'code' => 'JAM-OPT',
        'name' => 'JAM Opticus Group Corp.',
        'is_active' => true,
    ]);

    // Setup Permissions & Role & User
    $perms = [
        'banks.view', 'banks.manage',
        'journals.view', 'journals.create',
        'integration.optical.view', 'integration.optical.sync',
        'libraries.employees.manage',
        'roster.view', 'roster.manage',
        'attendance.view', 'attendance.punch', 'attendance.manage',
        'leave.view', 'leave.file', 'requests.approve', 'requests.manage',
        'portal.view',
        'payroll.view', 'payroll.manage',
        'periods.view', 'dashboard.view', 'ap.view',
        'admin.roles-permissions.manage', 'admin.users.manage',
        'compliance.view', 'compliance.manage',
    ];
    foreach ($perms as $p) {
        Permission::findOrCreate($p, 'web');
    }

    $this->role = Role::findOrCreate('Super Admin', 'web');
    $this->role->givePermissionTo($perms);

    $this->user = User::factory()->create();
    $this->user->assignRole($this->role);
    $this->user->entities()->attach($this->entity->id, ['is_default' => true]);

    // Setup AccountTypes
    $assetType = AccountType::create([
        'name' => 'Current Assets',
        'classification' => 'asset',
        'normal_balance' => 'debit',
        'statement' => 'balance_sheet',
    ]);

    $expenseType = AccountType::create([
        'name' => 'Cost of Sales',
        'classification' => 'expense',
        'normal_balance' => 'debit',
        'statement' => 'income_statement',
    ]);

    // Setup Cash/Bank and Inventory GL Accounts
    $this->cashAccount = Account::create([
        'entity_id' => $this->entity->id,
        'account_type_id' => $assetType->id,
        'code' => '1010',
        'name' => 'Cash in Bank - BDO Operating',
        'type' => 'asset',
        'is_active' => true,
        'is_postable' => true,
    ]);

    $this->bankAccount = BankAccount::create([
        'entity_id' => $this->entity->id,
        'code' => 'BDO-01',
        'name' => 'BDO Operating Account',
        'bank_name' => 'Banco de Oro',
        'account_number' => '1092-3847-9201',
        'gl_account_id' => $this->cashAccount->id,
        'is_active' => true,
    ]);

    $this->cogsAccount = Account::create([
        'entity_id' => $this->entity->id,
        'account_type_id' => $expenseType->id,
        'code' => '5000',
        'name' => 'Cost of Goods Sold - Optical',
        'type' => 'expense',
        'is_active' => true,
        'is_postable' => true,
    ]);

    $this->invAccount = Account::create([
        'entity_id' => $this->entity->id,
        'account_type_id' => $assetType->id,
        'code' => '1200',
        'name' => 'Merchandise Inventory - Frames & Lenses',
        'type' => 'asset',
        'is_active' => true,
        'is_postable' => true,
    ]);

    // Set entity context in container
    $entityContext = app(EntityContext::class);
    $entityContext->set($this->entity);
});

test('cash and bank records register can be accessed and transactions recorded', function () {
    $this->actingAs($this->user);

    // 1. Visit cash bank register
    $response = $this->withSession(['current_entity_id' => $this->entity->id])
        ->get('/accounting/cash-bank-records');
    $response->assertOk();

    // 2. Record a direct receipt into the bank: it posts a journal entry and lands on the bank register.
    $this->seed(AccountingSetupSeeder::class);
    $revenue = Account::where('code', '4010')->firstOrFail();

    $postResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/accounting/cash-bank-records', [
            'kind' => 'receipt',
            'payment_method' => 'bank_transfer',
            'bank_account_id' => $this->bankAccount->id,
            'counter_account_id' => $revenue->id,
            'txn_date' => now()->toDateString(),
            'amount' => 45000.00,
            'reference' => 'CR-2026-001',
            'description' => 'Prescription eyewear payment',
        ]);

    $postResponse->assertSessionHasNoErrors()->assertSessionHas('status');

    $this->assertDatabaseHas('bank_transactions', [
        'entity_id' => $this->entity->id,
        'bank_account_id' => $this->bankAccount->id,
        'reference' => 'CR-2026-001',
        'amount' => 45000.00,
        'direction' => 'in',
        'source_type' => 'cash_receipt',
    ]);
    $this->assertDatabaseHas('journal_entries', ['reference' => 'CR-2026-001', 'source_type' => 'cash_receipt']);
});

test('the inventory screen shows synced stock postings and optical stock, and flagged items can be reviewed', function () {
    $this->actingAs($this->user);
    config([
        'optical.product_entity' => $this->entity->code,
        'optical.api.base_url' => 'http://optical.test',
        'optical.api.token' => 'secret-token',
    ]);
    Http::fake([
        'optical.test/api/v1/accounting/inventory/stock-summary*' => Http::response(['data' => [
            'on_hand_by_type' => ['frame' => 12], 'on_hand_total' => 12,
            'on_hand_value_by_type' => ['frame' => 5400], 'on_hand_value_total' => 5400,
            'low_stock_threshold' => 3,
            'groups' => [
                ['stock_type' => 'frame', 'brand' => 'Rayban', 'code' => 'RB-1', 'category' => 'Metal', 'on_hand_count' => 2, 'on_hand_value' => 900, 'min_quantity' => 1, 'is_low_stock' => true],
                ['stock_type' => 'frame', 'brand' => 'Oakley', 'code' => 'OK-1', 'category' => 'Sport', 'on_hand_count' => 10, 'on_hand_value' => 4500, 'min_quantity' => 1, 'is_low_stock' => false],
            ],
        ]]),
    ]);

    $movement = InventoryMovement::create([
        'entity_id' => $this->entity->id,
        'movement_reference' => 'FR-71',
        'movement_type' => 'write_off',
        'quantity' => -1,
        'unit_cost' => 450,
        'total_cost' => 450,
        'accounting_link_type' => 'inventory_loss',
        'review_status' => 'needs_review',
        'notes' => 'Tagged defective in the optical POS.',
        'source_system' => 'optical',
        'source_ref' => 'frame:71:defective',
        'occurred_on' => now()->toDateString(),
    ]);

    $this->withSession(['current_entity_id' => $this->entity->id])
        ->get('/integration/inventory')
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('integration/inventory/page')
            ->where('isStockEntity', true)
            ->where('stock.value_total', 5400)
            ->where('stock.low_stock_count', 1)
            ->where('stock.low_stock.0.code', 'RB-1')
            ->where('kpis.needsReview', 1)
            ->where('movements.data.0.movement_reference', 'FR-71'));

    $this->withSession(['current_entity_id' => $this->entity->id])
        ->post("/integration/inventory/movements/{$movement->id}/review", ['resolution' => 'Returned to supplier for credit'])
        ->assertSessionHas('status');

    expect($movement->fresh()->review_status)->toBe('resolved')
        ->and($movement->fresh()->notes)->toContain('Returned to supplier for credit');
});

test('employee management roster, attendance, and compliance operate seamlessly', function () {
    $this->actingAs($this->user);

    $employee = Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $this->user->id,
        'employee_code' => 'EMP-TEST-01',
        'firstname' => 'Dr. Maria',
        'lastname' => 'Santos',
        'position' => 'Lead Optometrist',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 45000.00,
        'vacation_leave_credits' => 15,
        'sick_leave_credits' => 15,
        'is_active' => true,
    ]);

    // 1. Test Shift Roster
    $rosterResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/roster', [
            'employee_id' => $employee->id,
            'roster_date' => '2026-09-15',
            'shift_name' => 'Clinic Optometrist Shift (10am-7pm)',
            'shift_start' => '10:00',
            'shift_end' => '19:00',
            'is_rest_day' => false,
            'notes' => 'SM Mall of Asia Clinic',
        ]);
    $rosterResponse->assertSessionHas('status');

    $roster = ShiftRoster::where('employee_id', $employee->id)
        ->where('shift_name', 'Clinic Optometrist Shift (10am-7pm)')
        ->first();
    expect($roster)->not->toBeNull();
    expect($roster->notes)->toBe('SM Mall of Asia Clinic');

    // 2. Test Attendance Punch (a manual entry by a timekeeper always gives a reason)
    $punchResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/attendance/punch', [
            'employee_id' => $employee->id,
            'work_date' => '2026-09-15',
            'time_in' => '10:05',
            'time_out' => '19:00',
            'notes' => 'Biometric reader was down; times from the logbook.',
        ]);
    $punchResponse->assertSessionHas('status');

    $dtr = DtrEntry::where('employee_id', $employee->id)->first();
    expect($dtr)->not->toBeNull();
    expect(Carbon::parse($dtr->work_date)->toDateString())->toBe('2026-09-15');
    expect($dtr->time_in)->toContain('10:05');

    // 3. Statutory compliance: added as pending, prepared, filed with its reference, then verified by a second person.
    $as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);
    $as($this->user)->post('/employee-management/compliance', [
        'title' => 'BIR Form 1601-C (Withholding Tax)',
        'category' => 'statutory_tax',
        'period' => 'September 2026',
        'due_date' => '2026-10-10',
        'owner_role' => 'Finance & Accounting',
        'amount' => 15000.00,
    ])->assertSessionHas('status');

    $item = ComplianceItem::where('title', 'BIR Form 1601-C (Withholding Tax)')->first();
    expect($item)->not->toBeNull();
    expect($item->status)->toBe('pending');

    $as($this->user)->post("/employee-management/compliance/{$item->id}/status", ['status' => 'prepared'])->assertSessionHasNoErrors();
    $as($this->user)->post("/employee-management/compliance/{$item->id}/status", [
        'status' => 'submitted',
        'reference_no' => 'EFPS-1601C-001',
        'filed_on' => now()->toDateString(),
        'amount' => 15000.00,
    ])->assertSessionHasNoErrors();
    expect($item->fresh()->only(['status', 'reference_no']))->toBe(['status' => 'submitted', 'reference_no' => 'EFPS-1601C-001']);

    // Whoever prepared or filed it cannot also verify it.
    $this->user->givePermissionTo(Permission::findOrCreate('compliance.verify', 'web'));
    $as($this->user)->post("/employee-management/compliance/{$item->id}/verify", ['notes' => 'Settled via BDO auto-debit'])
        ->assertSessionHasErrors(['status' => 'You prepared or filed this item — another person must verify it.']);

    $verifier = User::factory()->create();
    $verifier->givePermissionTo(['compliance.view', 'compliance.verify']);
    $verifier->entities()->attach($this->entity->id, ['is_default' => true]);
    $as($verifier)->post("/employee-management/compliance/{$item->id}/verify", ['notes' => 'Settled via BDO auto-debit'])
        ->assertSessionHas('status');

    expect($item->fresh()->status)->toBe('verified');
    expect($item->fresh()->verified_by)->toBe($verifier->id);
});

test('benefits administration page renders and programs can be created and enrolled', function () {
    $this->actingAs($this->user);

    $employee = Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $this->user->id,
        'employee_code' => 'EMP-BEN-01',
        'firstname' => 'Pedro',
        'lastname' => 'Penduko',
        'position' => 'Optical Technician & Edger',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 28000.00,
        'vacation_leave_credits' => 10,
        'sick_leave_credits' => 10,
        'is_active' => true,
    ]);

    // 1. Visit benefits administration page
    $response = $this->withSession(['current_entity_id' => $this->entity->id])
        ->get('/employee-management/benefits');
    $response->assertOk();

    // 2. Create a Benefit Program
    $programResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/benefits/programs', [
            'code' => 'OPT-SUBSIDY',
            'name' => 'Prescription Eyewear Subsidy',
            'category' => 'allowance',
            'payroll_mode' => 'earning',
            'contribution_basis' => 'fixed',
            'default_employer_share' => 500.00,
            'is_taxable' => false,
            'description' => 'Semi-annual clinic allowance for prescription frames & lenses',
        ]);
    $programResponse->assertSessionHas('status');

    $program = BenefitProgram::where('code', 'OPT-SUBSIDY')->first();
    expect($program)->not->toBeNull();

    // 3. Enroll employee
    $enrollResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/benefits/enroll', [
            'employee_ids' => [$employee->id],
            'benefit_program_id' => $program->id,
            'participation_status' => 'active',
        ]);
    $enrollResponse->assertSessionHas('status');

    $this->assertDatabaseHas('employee_benefits', [
        'employee_id' => $employee->id,
        'benefit_program_id' => $program->id,
        'employer_share' => 500.00,
    ]);

    // 4. Re-visit page to verify totals calculation
    $responseAfterEnroll = $this->withSession(['current_entity_id' => $this->entity->id])
        ->get('/employee-management/benefits');
    $responseAfterEnroll->assertOk();
});

test('all employee management module pages render successfully', function () {
    $this->actingAs($this->user);

    $pages = [
        '/employee-management/roster',
        '/employee-management/attendance',
        '/employee-management/requests',
        '/employee-management/portal',
        '/employee-management/reports',
        '/employee-management/compliance',
        '/admin/roles',
    ];

    foreach ($pages as $url) {
        $response = $this->withSession(['current_entity_id' => $this->entity->id])->get($url);
        $response->assertOk();
    }

    // People Access now lives in Admin › Roles & Permissions.
    $this->get('/employee-management/access')->assertRedirect('/admin/roles?tab=users');
});

test('coordinates-based attendance check-in, break-out, break-in, and check-out enforce geofencing and calculate hours', function () {
    $this->actingAs($this->user);

    // Branch location: SM Mall of Asia (14.5352, 120.9822), 250m radius
    $this->entity->update([
        'latitude' => 14.5352,
        'longitude' => 120.9822,
        'geofence_radius' => 250,
        'geofence_enforced' => true,
    ]);

    $employee = Employee::create([
        'entity_id' => $this->entity->id,
        'user_id' => $this->user->id,
        'employee_code' => 'EMP-OPT-02',
        'firstname' => 'Juan',
        'lastname' => 'Dela Cruz',
        'position' => 'Optician',
        'employment_status' => 'active',
        'pay_type' => 'monthly',
        'basic_pay' => 30000.00,
    ]);

    $today = Carbon::today()->toDateString();

    // 1. Out-of-bounds Check-In rejection (e.g. Quezon City: 14.6760, 121.0437 is ~20km away)
    $outOfBoundsResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/attendance/punch', [
            'employee_id' => $employee->id,
            'punch_type' => 'check_in',
            'latitude' => 14.6760,
            'longitude' => 121.0437,
            'punch_time' => $today.' 08:50:00',
        ]);
    $outOfBoundsResponse->assertSessionHasErrors('location');

    // 2. Valid In-bounds Check-In (e.g. 14.5353, 120.9823 is ~15m away)
    $checkInResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/attendance/punch', [
            'employee_id' => $employee->id,
            'punch_type' => 'check_in',
            'latitude' => 14.5353,
            'longitude' => 120.9823,
            'punch_time' => $today.' 08:55:00',
        ]);
    $checkInResponse->assertSessionHas('status');

    $dtr = DtrEntry::where('employee_id', $employee->id)->whereDate('work_date', $today)->first();
    expect($dtr)->not->toBeNull();
    expect($dtr->time_in)->toBe('08:55:00');
    expect($dtr->location_status)->toBe('verified');
    expect($dtr->distance_meters)->toBeLessThan(50);
    expect((float) $dtr->tardiness_minutes)->toBe(0.0);

    // 3. Break-Out at 12:00:00
    $breakOutResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/attendance/punch', [
            'employee_id' => $employee->id,
            'punch_type' => 'break_out',
            'latitude' => 14.5353,
            'longitude' => 120.9823,
            'punch_time' => $today.' 12:00:00',
        ]);
    $breakOutResponse->assertSessionHas('status');

    $dtr->refresh();
    expect($dtr->break_out)->toBe('12:00:00');

    // 4. Break-In at 13:00:00 (1 hour lunch break)
    $breakInResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/attendance/punch', [
            'employee_id' => $employee->id,
            'punch_type' => 'break_in',
            'latitude' => 14.5353,
            'longitude' => 120.9823,
            'punch_time' => $today.' 13:00:00',
        ]);
    $breakInResponse->assertSessionHas('status');

    $dtr->refresh();
    expect($dtr->break_in)->toBe('13:00:00');

    // 5. Check-Out at 18:45:00 (Scheduled shift ends at 18:00; 45m worked after schedule qualifies as OT)
    $checkOutResponse = $this->withSession(['current_entity_id' => $this->entity->id])
        ->post('/employee-management/attendance/punch', [
            'employee_id' => $employee->id,
            'punch_type' => 'check_out',
            'latitude' => 14.5353,
            'longitude' => 120.9823,
            'punch_time' => $today.' 18:45:00',
            'accomplishment' => 'Closed the month-end inventory count',
        ]);
    $checkOutResponse->assertSessionHas('status');

    $dtr->refresh();
    expect($dtr->time_out)->toBe('18:45:00');
    expect((float) $dtr->regular_hours)->toBe(8.0);
    expect((float) $dtr->ot_hours)->toBeGreaterThan(0.0);
});
