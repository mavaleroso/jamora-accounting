<?php

use App\Models\CustomerDeposit;
use App\Models\Entity;
use App\Models\Invoice;
use App\Models\SyncRun;
use App\Models\User;
use App\Services\Optical\OpticalDatabase;
use App\Services\Optical\OpticalSource;
use App\Services\Optical\OpticalSyncService;
use App\Support\EntityContext;
use Database\Seeders\AccountingSetupSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\Support\OpticalPos;

uses(RefreshDatabase::class);

/*
 * Accounting reads the optical POS straight from its database. These tests run against a throwaway database with
 * the POS's tables (Tests\Support\OpticalPos); the booking rules themselves are covered by OpticalSyncTest.
 */
beforeEach(function () {
    OpticalPos::create();
    $this->pos = app(OpticalSource::class);
    $this->read = function (string $stream, array $filters = []) {
        $records = [];
        $this->pos->each($stream, $filters, function (array $record) use (&$records) {
            $records[] = $record;
        });

        return $records;
    };
    $this->today = now('Asia/Manila')->toDateString();
});

/** A retail order of a patient at A. Jamora: a frame, a lens and an eye check-up, 4,500 in all. */
function posOrder(array $order = []): int
{
    $patient = OpticalPos::insert('patients', ['firstname' => 'Juan', 'middlename' => null, 'lastname' => 'Dela Cruz']);
    $frame = OpticalPos::insert('frames', ['code' => 'RB-1', 'brand' => 'Rayban', 'description' => 'Aviator', 'item_cost_code' => 'UGCYQ', 'price' => 2500]);
    $lens = OpticalPos::insert('lens', ['code' => 'SV-1', 'brand' => 'Essilor', 'description' => 'Single vision', 'item_cost_code' => 'KCY', 'price' => 1500]);
    $exam = OpticalPos::insert('service_fees', ['name' => 'Comprehensive Eye check-up']);

    $id = OpticalPos::insert('orders', [
        'patient_id' => $patient, 'ts_no' => '26-11-00001', 'ordered_amount' => 4500, 'total_amount' => 4500, 'total_discounted_amount' => 4500,
        'amount_paid' => 4500, 'payment_status' => 'paid', 'si' => 'SI-0001', 'branch' => 'A.JAMORA', ...$order,
    ]);
    OpticalPos::insert('order_items', ['order_id' => $id, 'products_type' => 'App\\Models\\Frame', 'products_id' => $frame, 'amount' => 2500, 'discount_amount' => 0]);
    OpticalPos::insert('order_items', ['order_id' => $id, 'products_type' => 'App\\Models\\Lens', 'products_id' => $lens, 'amount' => 1500, 'discount_amount' => 0]);
    OpticalPos::insert('order_items', ['order_id' => $id, 'products_type' => 'App\\Models\\ServiceFee', 'products_id' => $exam, 'amount' => 500, 'discount_amount' => 0]);

    return $id;
}

test('the application reads the POS from its database, over a connection that cannot write', function () {
    $connection = require config_path('database.php');

    expect($this->pos)->toBeInstanceOf(OpticalDatabase::class)
        ->and($this->pos->isConfigured())->toBeTrue()
        ->and($this->pos->problem())->toBeNull()
        ->and($connection['connections']['optical']['options'][PDO::MYSQL_ATTR_INIT_COMMAND])->toBe('SET SESSION TRANSACTION READ ONLY');

    // No database named: nothing is read and nothing is booked.
    config(['database.connections.optical.database' => null]);
    expect($this->pos->isConfigured())->toBeFalse()
        ->and(app(OpticalSyncService::class)->catchUp(scheduled: true))->toBeNull()
        ->and(fn () => app(OpticalSyncService::class)->run())->toThrow(RuntimeException::class, 'OPTICAL_DB_DATABASE');
});

test('an order is read as it stands in the POS, with its lines, decoded costs and customer', function () {
    $id = posOrder(['completed' => '2026-11-10 02:30:00', 'category' => 'SS']);
    OpticalPos::insert('discounts', ['code' => 'ss', 'name' => 'Senior Citizen', 'is_vat_exempt' => true]);
    OpticalPos::insert('order_sales_invoices', ['order_id' => $id, 'entity_code' => 'JAM_OPTICUS', 'si_no' => 'JAM-0001']);
    // A line the cashier removed is not part of the order; a product deleted from stock still gives its cost.
    DB::connection('optical')->table('order_items')->insert(['order_id' => $id, 'products_type' => 'App\\Models\\Frame', 'products_id' => 1, 'amount' => 999, 'deleted_at' => now()]);
    DB::connection('optical')->table('frames')->update(['deleted_at' => now()]);

    $order = $this->pos->ordersById([$id])[0];

    expect($order)->toMatchArray([
        'id' => $id, 'ts_no' => '26-11-00001', 'branch' => 'A.JAMORA', 'accounting_entity_code' => 'A_JAMORA', 'is_wholesale_order' => false,
        'wholesale_client_id' => null, 'patient_id' => 1, 'customer_name' => 'Juan Dela Cruz', 'payable_total' => '4500.00', 'si' => 'SI-0001', 'or' => null,
        'category' => 'SS', 'category_vat_exempt' => true, 'completed_at' => '2026-11-10T02:30:00+00:00', 'deleted_at' => null,
        'sales_invoices' => [['entity_code' => 'JAM_OPTICUS', 'si_no' => 'JAM-0001']],
    ])
        ->and($order['items'])->toHaveCount(3)
        ->and($order['items'][0])->toMatchArray([
            'products_type' => 'App\\Models\\Frame', 'products_id' => 1, 'stock_type' => 'frame', 'is_service' => false, 'billed_by' => null,
            'product_label' => 'Rayban — Aviator — RB-1', 'product_code' => 'RB-1', 'quantity' => 1,
            'gross_amount' => '2500.00', 'amount' => '2500.00', 'unit_cost' => '450.00',
        ])
        ->and($order['items'][1]['unit_cost'])->toBe('150.00')
        ->and($order['items'][2])->toMatchArray(['stock_type' => 'service_fee', 'is_service' => true, 'billed_by' => 'branch', 'product_label' => 'Comprehensive Eye check-up', 'product_code' => null, 'unit_cost' => '0.00']);
});

test('what the customer owes follows the POS: older rows keep the doctor\'s discount apart', function () {
    $legacy = posOrder(['total_amount' => 3000, 'total_discounted_amount' => 3000, 'doctors_discount_amount' => 500]);
    $current = OpticalPos::insert('orders', ['ts_no' => '26-11-00002', 'walkin_name' => 'Walk In', 'total_amount' => 2500, 'total_discounted_amount' => 3000, 'doctors_discount_amount' => 500]);
    $client = OpticalPos::insert('clients', ['name' => 'Vision Plus Optical']);
    $wholesale = OpticalPos::insert('orders', ['ts_no' => '26-11-00003', 'is_wholesale_order' => true, 'wholesale_client_id' => $client, 'wholesale_client_name' => 'Old name', 'total_amount' => 2240]);

    $orders = collect($this->pos->ordersById([$legacy, $current, $wholesale]))->keyBy('id');

    expect($orders[$legacy]['payable_total'])->toBe('2500.00')
        ->and($orders[$current]['payable_total'])->toBe('2500.00')
        ->and($orders[$current]['customer_name'])->toBe('Walk In')
        ->and($orders[$wholesale])->toMatchArray(['customer_name' => 'Vision Plus Optical', 'accounting_entity_code' => 'JAM_OPTICUS', 'wholesale_client_id' => $client, 'is_wholesale_order' => true]);
});

test('a POS without the later settings is read all the same, and the books fall back to their own rules', function () {
    OpticalPos::create(withSettings: false);
    $this->pos = app()->make(OpticalDatabase::class);
    $id = posOrder(['category' => 'SS']);

    $order = $this->pos->ordersById([$id])[0];

    expect($order['category_vat_exempt'])->toBeNull()
        ->and($order['sales_invoices'])->toBe([])
        ->and($order['items'][2]['billed_by'])->toBeNull()
        ->and($this->pos->services())->toBe([['id' => 1, 'name' => 'Comprehensive Eye check-up', 'billed_by' => null, 'is_active' => true]]);
});

test('payments come with their order, oldest change first, and only what changed since', function () {
    $order = posOrder();
    $this->travelTo(now()->subHours(3));
    $first = OpticalPos::insert('order_payments', ['order_id' => $order, 'amount' => 4000, 'payment_type' => 'cash', 'payment_method' => 'cash', 'paid_date' => '2026-11-10']);
    $this->travelBack();
    $second = OpticalPos::insert('order_payments', ['order_id' => $order, 'amount' => 500, 'payment_type' => 'e_wallet', 'payment_method' => 'GCash', 'reference_number' => 'GC-9', 'paid_date' => '2026-11-11']);

    $all = ($this->read)('payments');
    expect(array_column($all, 'id'))->toBe([$first, $second])
        ->and($all[1])->toMatchArray(['order_id' => $order, 'amount' => '500.00', 'payment_type' => 'e_wallet', 'payment_method' => 'GCash', 'reference_number' => 'GC-9', 'paid_date' => '2026-11-11', 'status' => 'paid', 'deleted_at' => null])
        ->and($all[1]['order'])->toMatchArray(['id' => $order, 'ts_no' => '26-11-00001', 'branch' => 'A.JAMORA', 'customer_name' => 'Juan Dela Cruz', 'payable_total' => '4500.00', 'completed_at' => null]);

    expect(array_column(($this->read)('payments', ['since' => now()->subHour()]), 'id'))->toBe([$second]);

    // A payment the cashier removes shows up again, as removed.
    OpticalPos::update('order_payments', $first, ['deleted_at' => now()->toDateTimeString()]);
    $changed = ($this->read)('payments', ['since' => now()->subMinute()]);
    expect(array_column($changed, 'id'))->toBe([$first, $second])
        ->and($changed[0]['deleted_at'])->not->toBeNull();
});

test('deliveries are grouped by supplier and delivery receipt and valued at decoded cost', function () {
    $supplier = OpticalPos::insert('suppliers', ['name' => 'Lens Supplier']);
    $row = ['supplier' => 'Lens Supplier', 'delivery_receipt' => 'DR-100', 'delivery_date' => '2026-11-10 00:00:00'];
    OpticalPos::insert('lens', [...$row, 'code' => 'L-1', 'item_cost_code' => 'KCY', 'price' => 1500]);
    OpticalPos::insert('lens', [...$row, 'code' => 'L-2', 'item_cost_code' => 'KCY', 'price' => 1500]);
    OpticalPos::insert('frames', [...$row, 'code' => 'F-1', 'item_cost_code' => null, 'price' => 900]);
    // Keyed without its ".": 6,637.50 reads as 663,750 against a 17,850 price.
    $overcost = OpticalPos::insert('lens', [...$row, 'code' => 'L-3', 'item_cost_code' => 'HHNACY', 'price' => 17850]);
    OpticalPos::insert('accessories', ['code' => 'A-1', 'supplier' => null, 'delivery_receipt' => 'DR-OLD', 'delivery_date' => '2026-01-05 00:00:00', 'item_cost_code' => 'KY.CY']);
    OpticalPos::insert('frames', ['code' => 'F-2']); // no delivery receipt: not a delivery

    $receipts = collect(($this->read)('receipts'))->keyBy('delivery_receipt');

    expect($receipts)->toHaveCount(2)
        ->and($receipts['DR-100'])->toMatchArray([
            'key' => sha1("Lens Supplier\u{0}DR-100"), 'supplier' => 'Lens Supplier', 'supplier_id' => $supplier, 'received_at' => '2026-11-10 00:00:00',
            'item_count' => 4, 'uncosted_count' => 1, 'total_cost' => '664050.00', 'overcost_count' => 1, 'overcost_cost' => '663750.00',
            'by_type' => ['frame' => ['count' => 1, 'cost' => '0.00'], 'lens' => ['count' => 3, 'cost' => '664050.00']],
        ])
        ->and($receipts['DR-OLD'])->toMatchArray(['supplier' => null, 'supplier_id' => null, 'item_count' => 1, 'total_cost' => '10.50'])
        // Deliveries before go-live are left to the opening balances.
        ->and(array_column(($this->read)('receipts', ['from' => '2026-11-01']), 'delivery_receipt'))->toBe(['DR-100']);

    // Nothing changed since: nothing to read. Removing an item brings its delivery back, re-valued.
    $this->travel(1)->hours();
    expect(($this->read)('receipts', ['since' => now()->subMinutes(10)]))->toBe([]);

    OpticalPos::update('lens', $overcost, ['deleted_at' => now()->toDateTimeString()]);
    $changed = ($this->read)('receipts', ['since' => now()->subMinutes(10)]);
    expect($changed)->toHaveCount(1)
        ->and($changed[0])->toMatchArray(['delivery_receipt' => 'DR-100', 'item_count' => 3, 'total_cost' => '300.00', 'overcost_count' => 0]);
});

test('stock tagged sold, defective, expired or returned is read one event at a time, with the order that sold it', function () {
    $order = posOrder(['completed' => '2026-11-10 02:30:00']);
    DB::connection('optical')->table('frames')->where('code', 'RB-1')->update(['is_sold' => '2026-11-10 02:30:00', 'supplier' => 'Frame House']);
    $supplier = OpticalPos::insert('suppliers', ['name' => 'Frame House']);
    $cracked = OpticalPos::insert('frames', ['code' => 'FR-71', 'brand' => 'Rayban', 'description' => 'Cracked', 'item_cost_code' => 'UGCYQ', 'price' => 2500, 'supplier' => 'Frame House', 'is_defective' => '2026-11-11 09:00:00']);
    $loose = OpticalPos::insert('accessories', ['code' => 'AC-9', 'item_cost_code' => 'KY.CY', 'is_sold' => '2026-10-01 08:00:00', 'is_return' => '2026-11-12 08:00:00']);
    OpticalPos::insert('solutions', ['code' => 'SO-1', 'is_out' => '2026-11-11 09:00:00']); // released to a branch: nothing to book

    $events = collect(($this->read)('movements'))->keyBy(fn (array $m) => "{$m['stock_type']}:{$m['id']}:{$m['event_type']}");

    expect($events->keys()->sort()->values()->all())->toBe(["accessory:{$loose}:returned", "accessory:{$loose}:sold", 'frame:1:sold', "frame:{$cracked}:defective"])
        ->and($events['frame:1:sold'])->toMatchArray(['order_id' => $order, 'unit_cost' => '450.00', 'occurred_at' => '2026-11-10 02:30:00'])
        ->and($events["frame:{$cracked}:defective"])->toMatchArray(['code' => 'FR-71', 'brand' => 'Rayban', 'unit_cost' => '450.00', 'price' => '2500.00', 'supplier' => 'Frame House', 'supplier_id' => $supplier, 'order_id' => null, 'quantity' => 1])
        ->and($events["accessory:{$loose}:sold"]['order_id'])->toBeNull()
        // Only events dated on or after go-live.
        ->and(collect(($this->read)('movements', ['from' => '2026-11-01']))->pluck('event_type')->sort()->values()->all())->toBe(['defective', 'returned', 'sold']);
});

test('stock on hand is counted and valued as it is in the POS right now', function () {
    foreach (range(1, 5) as $n) {
        OpticalPos::insert('frames', ['code' => 'RB-1', 'brand' => 'Rayban', 'category' => 'Metal', 'item_cost_code' => 'UGCYQ']);
    }
    OpticalPos::insert('frames', ['code' => 'OK-1', 'brand' => 'Oakley', 'category' => 'Sport', 'item_cost_code' => 'KCY', 'quantity' => 4]);
    OpticalPos::insert('frames', ['code' => 'OK-1', 'brand' => 'Oakley', 'category' => 'Sport', 'item_cost_code' => 'KCY', 'quantity' => 4, 'is_sold' => now()]);
    OpticalPos::insert('lens', ['code' => 'L-1', 'brand' => 'Essilor', 'category' => 'SV', 'item_cost_code' => 'KCY', 'is_defective' => now()]);

    $before = $this->pos->stockSummary();
    expect($before)->toMatchArray(['on_hand_total' => 6, 'on_hand_value_total' => 2400.0, 'low_stock_threshold' => 3])
        ->and($before['on_hand_by_type'])->toMatchArray(['frame' => 6, 'lens' => 0])
        ->and(collect($before['groups'])->keyBy('code')->map(fn (array $g) => ['on_hand_count' => $g['on_hand_count'], 'on_hand_value' => $g['on_hand_value'], 'is_low_stock' => $g['is_low_stock']])->all())->toBe([
            'OK-1' => ['on_hand_count' => 1, 'on_hand_value' => 150.0, 'is_low_stock' => true],
            'RB-1' => ['on_hand_count' => 5, 'on_hand_value' => 2250.0, 'is_low_stock' => true], // single units count as low
        ]);

    // A sale in the POS shows on the very next read: nothing is copied.
    DB::connection('optical')->table('frames')->where('code', 'RB-1')->limit(2)->update(['is_sold' => now()]);
    expect($this->pos->stockSummary()['on_hand_total'])->toBe(4);
});

test('staff are read without their passwords, and a password is checked against the POS as it is', function () {
    Storage::fake('public');
    $folder = storage_path('framework/testing/optical-photos');
    @mkdir($folder.'/avatars', 0777, true);
    file_put_contents($folder.'/avatars/ethel.png', 'photo-bytes');
    config(['optical.storage_path' => $folder, 'optical.public_url' => 'http://optical.test']);

    $ethel = OpticalPos::insert('users', ['username' => 'eandong', 'firstname' => 'Ethel', 'lastname' => 'Andong', 'sex' => 'Female', 'birthdate' => '1990-05-01', 'avatar' => 'avatars/ethel.png', 'password' => password_hash('Optical-pass-1', PASSWORD_BCRYPT)]);
    $gone = OpticalPos::insert('users', ['username' => 'old', 'firstname' => 'Old', 'status' => false, 'password' => password_hash('Optical-pass-2', PASSWORD_BCRYPT)]);
    OpticalPos::insert('roles', ['name' => 'Wholesale']);
    OpticalPos::insert('model_has_roles', ['role_id' => 1, 'model_type' => 'App\\Models\\User', 'model_id' => $ethel]);

    $users = collect(($this->read)('users'))->keyBy('id');
    expect($users[$ethel])->toMatchArray(['username' => 'eandong', 'firstname' => 'Ethel', 'birthdate' => '1990-05-01', 'status' => true, 'roles' => ['Wholesale'], 'avatar_url' => 'http://optical.test/storage/avatars/ethel.png', 'avatar_path' => $folder.DIRECTORY_SEPARATOR.'avatars'.DIRECTORY_SEPARATOR.'ethel.png'])
        ->and($users[$ethel])->not->toHaveKey('password')
        ->and($users[$gone])->toMatchArray(['status' => false, 'roles' => [], 'avatar_url' => null]);

    expect($this->pos->passwordMatches($ethel, 'Optical-pass-1'))->toBeTrue()
        ->and($this->pos->passwordMatches($ethel, 'wrong'))->toBeFalse()
        ->and($this->pos->passwordMatches($gone, 'Optical-pass-2'))->toBeFalse()
        ->and($this->pos->passwordMatches(999, 'anything'))->toBeFalse();

    // Copied as a login here (photo straight from the POS's storage folder), signing in with the POS password.
    foreach (['JAM_OPTICUS' => 'JAM Opticus', 'A_JAMORA' => 'A. Jamora Optical'] as $code => $name) {
        Entity::create(['code' => $code, 'name' => $name, 'is_active' => true]);
    }
    app(EntityContext::class)->clear();
    config(['optical.password_check' => true]);
    app(OpticalSyncService::class)->run(null, ['streams' => ['users']]);

    $login = User::where('optical_user_id', $ethel)->sole();
    Storage::disk('public')->assertExists('avatars/ethel.png');
    expect($login->avatar)->toBe('avatars/ethel.png')
        ->and(User::where('optical_user_id', $gone)->value('status'))->toBeFalse();

    $this->post('/login', ['username' => 'eandong', 'password' => 'wrong'])->assertSessionHasErrors('username');
    $this->post('/login', ['username' => 'eandong', 'password' => 'Optical-pass-1']);
    $this->assertAuthenticatedAs($login);

    // The POS's database can't be read: the check has no answer (and sign-in falls back to the password kept here).
    DB::connection('optical')->getSchemaBuilder()->drop('users');
    expect($this->pos->passwordMatches($ethel, 'Optical-pass-1'))->toBeNull();
});

test('the books follow the POS\'s database: a payment, the completed sale, and its re-opening', function () {
    foreach (['JAM_OPTICUS' => 'JAM Opticus', 'A_JAMORA' => 'A. Jamora Optical', 'AL_JAMORA' => 'AL Jamora Optical'] as $code => $name) {
        Entity::create(['code' => $code, 'name' => $name, 'is_active' => true]);
    }
    $this->seed(AccountingSetupSeeder::class);
    app(EntityContext::class)->clear();
    config(['optical.start_date' => null]);
    $check = fn () => app(OpticalSyncService::class)->catchUp(scheduled: true);
    $clinic = Entity::where('code', 'A_JAMORA')->value('id');

    // The customer pays in the POS.
    $order = posOrder();
    OpticalPos::insert('order_payments', ['order_id' => $order, 'amount' => 4500, 'payment_type' => 'cash', 'payment_method' => 'cash', 'paid_date' => $this->today]);
    $run = $check();

    $deposit = CustomerDeposit::withoutGlobalScope('entity')->sole();
    expect($run->status)->toBe('completed')
        ->and($deposit->entity_id)->toBe($clinic)
        ->and((float) $deposit->amount)->toBe(4500.0)
        ->and($deposit->status)->toBe('open')
        ->and(Invoice::withoutGlobalScope('entity')->count())->toBe(0);

    // Nothing changed in the POS: nothing is read twice, and no run is recorded.
    $this->travel(1)->hours();
    expect($check())->toBeNull()->and(SyncRun::query()->count())->toBe(1);

    // The order is completed in the POS: JAM Opticus invoices the products, the clinic its service.
    OpticalPos::update('orders', $order, ['completed' => now()->toDateTimeString()]);
    $check();

    $invoices = Invoice::withoutGlobalScope('entity')->get()->keyBy('entity_id');
    expect($invoices)->toHaveCount(2)
        ->and((float) $invoices[Entity::where('code', 'JAM_OPTICUS')->value('id')]->total_amount)->toBe(4000.0)
        ->and((float) $invoices[$clinic]->total_amount)->toBe(500.0)
        ->and($invoices->pluck('status')->unique()->all())->toBe(['paid'])
        ->and($deposit->fresh()->status)->toBe('applied');

    // It is re-opened in the POS: the sale is taken back and the deposit is free again.
    $this->travel(1)->hours();
    OpticalPos::update('orders', $order, ['completed' => null]);
    $check();

    expect(Invoice::withoutGlobalScope('entity')->pluck('status')->unique()->all())->toBe(['void'])
        ->and($deposit->fresh()->status)->toBe('open')
        // The POS itself was only ever read.
        ->and(DB::connection('optical')->table('orders')->where('id', $order)->value('ts_no'))->toBe('26-11-00001');
});
