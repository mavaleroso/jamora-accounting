<?php

use App\Models\Entity;
use App\Models\User;
use App\Services\Optical\OpticalSyncService;
use App\Support\EntityContext;
use Database\Seeders\AccountingSetupSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Spatie\Permission\Models\Permission;

uses(RefreshDatabase::class);

beforeEach(function () {
    foreach (['JAM_OPTICUS' => 'JAM Opticus', 'A_JAMORA' => 'A. Jamora Optical', 'AL_JAMORA' => 'AL Jamora Optical'] as $code => $name) {
        Entity::create(['code' => $code, 'name' => $name, 'is_active' => true]);
    }
    $this->seed(AccountingSetupSeeder::class);
    app(EntityContext::class)->clear();
    config(['optical.api.base_url' => 'http://optical.test', 'optical.api.token' => 'secret-token', 'optical.start_date' => null]);

    $today = now('Asia/Manila')->toDateString();
    $order = [
        'id' => 501, 'ts_no' => '26-10-00501', 'branch' => 'A.JAMORA', 'is_wholesale_order' => false, 'wholesale_client_id' => null, 'patient_id' => 77,
        'customer_name' => 'Juan Dela Cruz', 'payable_total' => '4500.00', 'category' => null, 'si' => 'SI-0501', 'or' => null,
        'completed_at' => now()->toIso8601String(), 'deleted_at' => null, 'updated_at' => now()->toIso8601String(),
        'items' => [
            ['id' => 1, 'products_type' => 'App\\Models\\Frame', 'products_id' => 11, 'stock_type' => 'frame', 'is_service' => false, 'product_label' => 'Rayban frame', 'product_code' => 'RB-1', 'quantity' => 1, 'gross_amount' => '2500.00', 'amount' => '2500.00', 'unit_cost' => '450.00'],
            ['id' => 2, 'products_type' => 'App\\Models\\Lens', 'products_id' => 12, 'stock_type' => 'lens', 'is_service' => false, 'product_label' => 'Lens', 'product_code' => 'SV-1', 'quantity' => 1, 'gross_amount' => '1500.00', 'amount' => '1500.00', 'unit_cost' => '150.00'],
            ['id' => 3, 'products_type' => 'App\\Models\\ServiceFee', 'products_id' => 5, 'stock_type' => 'service_fee', 'is_service' => true, 'product_label' => 'Comprehensive Eye check-up', 'product_code' => null, 'quantity' => 1, 'gross_amount' => '500.00', 'amount' => '500.00', 'unit_cost' => '0.00'],
        ],
    ];
    $payments = [
        ['id' => 1, 'order_id' => 501, 'amount' => '4000.00', 'payment_type' => 'cash', 'payment_method' => 'cash', 'reference_number' => null, 'paid_date' => $today, 'status' => 'paid', 'deleted_at' => null, 'updated_at' => now()->toIso8601String(), 'order' => $order],
        ['id' => 2, 'order_id' => 501, 'amount' => '500.00', 'payment_type' => 'e_wallet', 'payment_method' => 'GCash', 'reference_number' => 'GC-9', 'paid_date' => $today, 'status' => 'paid', 'deleted_at' => null, 'updated_at' => now()->toIso8601String(), 'order' => $order],
    ];

    Http::fake(function (Request $request) use ($order, $payments) {
        $path = trim(str_replace('http://optical.test/api/v1/accounting/', '', strtok($request->url(), '?')), '/');

        return Http::response(['data' => match ($path) {
            'orders' => [$order],
            'payments' => $payments,
            default => [],
        }, 'meta' => ['last_page' => 1]]);
    });
    app(OpticalSyncService::class)->run();

    $permissions = ['reports.daily-sales.view', 'reports.vat-summary.view', 'reports.income-statement.view', 'reports.ar-aging.view', 'reports.export'];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->user = User::factory()->create();
    $this->user->givePermissionTo($permissions);
    foreach (Entity::all() as $entity) {
        $this->user->entities()->attach($entity->id, ['is_default' => $entity->code === 'JAM_OPTICUS']);
    }
    $this->as = fn (string $code) => $this->actingAs($this->user)->withSession(['current_entity_id' => Entity::where('code', $code)->value('id')]);
});

test('daily sales and VAT summary show each entity\'s share of the optical sale', function () {
    ($this->as)('JAM_OPTICUS')->get('/reports/operations/daily-sales')->assertOk()
        ->assertInertia(fn ($p) => $p->component('reports/operations/page')
            ->where('report.totals.net', 4000)
            ->where('report.totals.vat', 428.57)
            ->where('report.totals.products', 4000)
            ->where('report.totals.invoices', 1));

    ($this->as)('A_JAMORA')->get('/reports/operations/vat-summary')->assertOk()
        ->assertInertia(fn ($p) => $p->where('report.totals.output_vat', 53.57)->where('report.totals.vatable_sales', 446.43));
});

test('cost of goods sold, collections and deposits reports', function () {
    ($this->as)('JAM_OPTICUS')->get('/reports/operations/cogs')->assertOk()
        ->assertInertia(fn ($p) => $p->where('report.totals.cogs', 600)->where('report.totals.sold_qty', 2)->where('report.summary.0.value', 600));

    // The clinic took the customer's money: cash and GCash, both as optical POS payments.
    ($this->as)('A_JAMORA')->get('/reports/operations/collections')->assertOk()
        ->assertInertia(fn ($p) => $p->where('report.totals.amount', 4500)->has('report.rows', 2));

    // Fully applied to the completed sale, so nothing is held.
    ($this->as)('A_JAMORA')->get('/reports/operations/deposits')->assertOk()
        ->assertInertia(fn ($p) => $p->where('report.totals.outstanding', 0)->has('report.rows', 0)->where('report.summary.1.value', 0));

    ($this->as)('A_JAMORA')->get('/reports/operations/collections/export')->assertOk()->assertDownload();
});

test('reports need their permission', function () {
    $other = User::factory()->create();
    $other->entities()->attach(Entity::where('code', 'JAM_OPTICUS')->value('id'), ['is_default' => true]);

    $this->actingAs($other)->get('/reports/operations/vat-summary')->assertForbidden();
    ($this->as)('JAM_OPTICUS')->get('/reports/operations/unknown')->assertNotFound();
});
