<?php

use App\Models\Account;
use App\Models\CustomerDeposit;
use App\Models\Entity;
use App\Models\InventoryMovement;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\JournalEntryLine;
use App\Models\PostingRule;
use App\Models\SyncDocument;
use App\Models\Vendor;
use App\Services\Optical\OpticalSyncService;
use App\Support\EntityContext;
use Database\Seeders\AccountingSetupSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

/*
 * The sync against a fake optical-new accounting API. The fake returns every record on each call (it ignores
 * updated_since), which also proves documents are idempotent.
 */
beforeEach(function () {
    foreach (['JAM_OPTICUS' => 'JAM Opticus', 'A_JAMORA' => 'A. Jamora Optical', 'AL_JAMORA' => 'AL Jamora Optical'] as $code => $name) {
        Entity::create(['code' => $code, 'name' => $name, 'is_active' => true]);
    }
    $this->seed(AccountingSetupSeeder::class);
    app(EntityContext::class)->clear();

    config([
        'optical.api.base_url' => 'http://optical.test',
        'optical.api.token' => 'secret-token',
        'optical.start_date' => null,
    ]);

    $this->api = ['orders' => [], 'payments' => [], 'inventory/receipts' => [], 'inventory/movements' => [], 'clients' => [], 'suppliers' => []];

    Http::fake(function (Request $request) {
        expect($request->header('Authorization')[0] ?? null)->toBe('Bearer secret-token');

        $path = trim(str_replace('http://optical.test/api/v1/accounting/', '', strtok($request->url(), '?')), '/');
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
        $records = array_values($this->api[$path] ?? []);

        if (! empty($query['ids'])) {
            $ids = array_map('intval', explode(',', $query['ids']));
            $records = array_values(array_filter($records, fn ($r) => in_array((int) $r['id'], $ids, true)));
        }

        return Http::response(['data' => $records, 'meta' => ['last_page' => 1]]);
    });

    $this->sync = fn () => app(OpticalSyncService::class)->run();
    $this->today = now('Asia/Manila')->toDateString();
});

function opticalOrder(array $overrides = []): array
{
    return array_merge([
        'id' => 501,
        'ts_no' => '26-10-00501',
        'accounting_entity_code' => 'A_JAMORA',
        'branch' => 'A.JAMORA',
        'is_wholesale_order' => false,
        'wholesale_client_id' => null,
        'patient_id' => 77,
        'walkin_name' => null,
        'customer_name' => 'Juan Dela Cruz',
        'payable_total' => '4500.00',
        'total_amount' => '4500.00',
        'category' => null,
        'si' => 'SI-0501',
        'or' => null,
        'completed_at' => null,
        'deleted_at' => null,
        'updated_at' => now()->toIso8601String(),
        'items' => [
            ['id' => 1, 'products_type' => 'App\\Models\\Frame', 'products_id' => 11, 'stock_type' => 'frame', 'is_service' => false, 'product_label' => 'Rayban frame', 'product_code' => 'RB-1', 'quantity' => 1, 'gross_amount' => '2500.00', 'discount_amount' => '0.00', 'amount' => '2500.00', 'unit_cost' => '450.00'],
            ['id' => 2, 'products_type' => 'App\\Models\\Lens', 'products_id' => 12, 'stock_type' => 'lens', 'is_service' => false, 'product_label' => 'Single vision lens', 'product_code' => 'SV-1', 'quantity' => 1, 'gross_amount' => '1500.00', 'discount_amount' => '0.00', 'amount' => '1500.00', 'unit_cost' => '150.00'],
            ['id' => 3, 'products_type' => 'App\\Models\\ServiceFee', 'products_id' => 5, 'stock_type' => 'service_fee', 'is_service' => true, 'product_label' => 'Comprehensive Eye check-up', 'product_code' => null, 'quantity' => 1, 'gross_amount' => '500.00', 'discount_amount' => '0.00', 'amount' => '500.00', 'unit_cost' => '0.00'],
        ],
    ], $overrides);
}

function opticalPayment(array $order, array $overrides = []): array
{
    return array_merge([
        'id' => 9001,
        'order_id' => $order['id'],
        'accounting_entity_code' => $order['accounting_entity_code'],
        'amount' => $order['payable_total'],
        'payment_type' => 'cash',
        'payment_method' => 'cash',
        'reference_number' => null,
        'paid_date' => now('Asia/Manila')->toDateString(),
        'status' => 'paid',
        'deleted_at' => null,
        'updated_at' => now()->toIso8601String(),
        'order' => collect($order)->only(['id', 'ts_no', 'branch', 'is_wholesale_order', 'wholesale_client_id', 'patient_id', 'customer_name', 'payable_total', 'or', 'si', 'completed_at', 'deleted_at'])->all(),
    ], $overrides);
}

/** Net debit balance (debit − credit) of an account in an entity, over everything that reached the ledger. */
function ledgerBalance(string $entityCode, string $accountCode): float
{
    $entity = Entity::where('code', $entityCode)->firstOrFail();
    $account = Account::withoutGlobalScope('entity')->where('entity_id', $entity->id)->where('code', $accountCode)->firstOrFail();

    return round((float) JournalEntryLine::query()
        ->join('journal_entries', 'journal_entries.id', '=', 'journal_entry_lines.journal_entry_id')
        ->where('journal_entry_lines.account_id', $account->id)
        ->whereIn('journal_entries.status', ['posted', 'void'])
        ->sum(DB::raw('journal_entry_lines.debit - journal_entry_lines.credit')), 2);
}

function entityId(string $code): int
{
    return Entity::where('code', $code)->value('id');
}

test('a payment on an open order is booked as the clinic\'s customer deposit', function () {
    $order = opticalOrder();
    $this->api['orders'] = [$order];
    $this->api['payments'] = [opticalPayment($order)];

    $run = ($this->sync)();

    expect($run->status)->toBe('completed');
    $deposit = CustomerDeposit::withoutGlobalScope('entity')->sole();
    expect($deposit->entity_id)->toBe(entityId('A_JAMORA'))
        ->and((float) $deposit->amount)->toBe(4500.0)
        ->and($deposit->status)->toBe('open')
        ->and(ledgerBalance('A_JAMORA', '1000'))->toBe(4500.0)
        ->and(ledgerBalance('A_JAMORA', '2300'))->toBe(-4500.0)
        ->and(Invoice::withoutGlobalScope('entity')->count())->toBe(0);
});

test('completing an order splits it between JAM Opticus and the clinic and settles it from the deposit', function () {
    $order = opticalOrder();
    $this->api['payments'] = [opticalPayment($order)];
    $this->api['orders'] = [$order];
    ($this->sync)();

    $this->api['orders'] = [opticalOrder(['completed_at' => now()->toIso8601String()])];
    $run = ($this->sync)();
    expect($run->failed)->toBe(0);

    $jamInvoice = Invoice::withoutGlobalScope('entity')->where('entity_id', entityId('JAM_OPTICUS'))->sole();
    $clinicInvoice = Invoice::withoutGlobalScope('entity')->where('entity_id', entityId('A_JAMORA'))->sole();

    // Products belong to JAM Opticus, the eye check-up to the clinic; both carry 12% VAT and are fully settled.
    expect((float) $jamInvoice->total_amount)->toBe(4000.0)
        ->and((float) $jamInvoice->vat_amount)->toBe(428.57)
        ->and($jamInvoice->status)->toBe('paid')
        ->and($jamInvoice->bir_si_or_no)->toBe('SI-0501')
        ->and((float) $clinicInvoice->total_amount)->toBe(500.0)
        ->and($clinicInvoice->status)->toBe('paid');

    // JAM Opticus: revenue, VAT, cost at decoded cost, and a receivable from the clinic that took the cash.
    expect(ledgerBalance('JAM_OPTICUS', '4000'))->toBe(-3571.43)
        ->and(ledgerBalance('JAM_OPTICUS', '2100'))->toBe(-428.57)
        ->and(ledgerBalance('JAM_OPTICUS', '5000'))->toBe(600.0)
        ->and(ledgerBalance('JAM_OPTICUS', '1200'))->toBe(-600.0)
        ->and(ledgerBalance('JAM_OPTICUS', '1400'))->toBe(4000.0)
        ->and(ledgerBalance('JAM_OPTICUS', '1100'))->toBe(0.0);

    // The clinic: its own service revenue, the deposit used up, and what it owes JAM Opticus.
    expect(ledgerBalance('A_JAMORA', '4010'))->toBe(-446.43)
        ->and(ledgerBalance('A_JAMORA', '2100'))->toBe(-53.57)
        ->and(ledgerBalance('A_JAMORA', '2300'))->toBe(0.0)
        ->and(ledgerBalance('A_JAMORA', '2600'))->toBe(-4000.0)
        ->and(ledgerBalance('A_JAMORA', '1100'))->toBe(0.0)
        ->and(ledgerBalance('A_JAMORA', '1000'))->toBe(4500.0)
        ->and(CustomerDeposit::withoutGlobalScope('entity')->sole()->status)->toBe('applied');

    expect(InventoryMovement::withoutGlobalScope('entity')->where('movement_type', 'sales_issue')->count())->toBe(2);

    // Running again books nothing new.
    $entries = JournalEntry::withoutGlobalScope('entity')->count();
    $again = ($this->sync)();
    expect($again->created_entries)->toBe(0)
        ->and(JournalEntry::withoutGlobalScope('entity')->count())->toBe($entries);
});

test('re-opening a completed order reverses the sale and frees the deposit', function () {
    $completed = opticalOrder(['completed_at' => now()->toIso8601String()]);
    $this->api['payments'] = [opticalPayment($completed)];
    $this->api['orders'] = [$completed];
    ($this->sync)();

    $this->api['orders'] = [opticalOrder(['completed_at' => null])];
    $run = ($this->sync)();

    expect($run->failed)->toBe(0)
        ->and(Invoice::withoutGlobalScope('entity')->pluck('status')->unique()->all())->toBe(['void'])
        ->and(ledgerBalance('JAM_OPTICUS', '4000'))->toBe(0.0)
        ->and(ledgerBalance('JAM_OPTICUS', '5000'))->toBe(0.0)
        ->and(ledgerBalance('JAM_OPTICUS', '1400'))->toBe(0.0)
        ->and(ledgerBalance('A_JAMORA', '2600'))->toBe(0.0)
        ->and(ledgerBalance('A_JAMORA', '2300'))->toBe(-4500.0);

    $deposit = CustomerDeposit::withoutGlobalScope('entity')->sole();
    expect($deposit->status)->toBe('open')->and((float) $deposit->applied_amount)->toBe(0.0);

    // Completing it again books it once more.
    $this->api['orders'] = [$completed];
    ($this->sync)();
    expect(Invoice::withoutGlobalScope('entity')->where('status', 'paid')->count())->toBe(2)
        ->and(ledgerBalance('JAM_OPTICUS', '4000'))->toBe(-3571.43);
});

test('the doctor\'s discount is booked once, as a sales discount, on legacy order totals', function () {
    // Legacy row: lines add up to 3,000 before a 500 doctor's discount; the customer pays 2,500.
    $order = opticalOrder([
        'payable_total' => '2500.00',
        'completed_at' => now()->toIso8601String(),
        'branch' => 'A.L. Jamora',
        'accounting_entity_code' => 'AL_JAMORA',
        'items' => [
            ['id' => 1, 'products_type' => 'App\\Models\\Frame', 'products_id' => 11, 'stock_type' => 'frame', 'is_service' => false, 'product_label' => 'Kids frame', 'product_code' => 'K-1', 'quantity' => 1, 'gross_amount' => '3000.00', 'discount_amount' => '0.00', 'amount' => '3000.00', 'unit_cost' => '700.00'],
        ],
    ]);
    $this->api['payments'] = [opticalPayment($order)];
    $this->api['orders'] = [$order];
    ($this->sync)();

    $invoice = Invoice::withoutGlobalScope('entity')->sole();
    expect($invoice->entity_id)->toBe(entityId('JAM_OPTICUS'))
        ->and((float) $invoice->total_amount)->toBe(2500.0)
        ->and((float) $invoice->discount_amount)->toBe(500.0)
        ->and(ledgerBalance('JAM_OPTICUS', '4100'))->toBe(500.0)
        ->and(ledgerBalance('JAM_OPTICUS', '1100'))->toBe(0.0)
        // AL Jamora collected the 2,500 and owes it to JAM Opticus.
        ->and(ledgerBalance('AL_JAMORA', '1000'))->toBe(2500.0)
        ->and(ledgerBalance('AL_JAMORA', '2600'))->toBe(-2500.0);
});

test('senior citizen sales are VAT-exempt with the discount in its own account', function () {
    $order = opticalOrder([
        'category' => 'SS',
        'payable_total' => '800.00',
        'completed_at' => now()->toIso8601String(),
        'items' => [
            ['id' => 3, 'products_type' => 'App\\Models\\ServiceFee', 'products_id' => 5, 'stock_type' => 'service_fee', 'is_service' => true, 'product_label' => 'Consultation', 'product_code' => null, 'quantity' => 1, 'gross_amount' => '1000.00', 'discount_amount' => '200.00', 'amount' => '800.00', 'unit_cost' => '0.00'],
        ],
    ]);
    $this->api['payments'] = [opticalPayment($order, ['payment_type' => 'e_wallet', 'payment_method' => 'GCash', 'reference_number' => 'GC-123'])];
    $this->api['orders'] = [$order];
    ($this->sync)();

    $invoice = Invoice::withoutGlobalScope('entity')->sole();
    expect($invoice->entity_id)->toBe(entityId('A_JAMORA'))
        ->and($invoice->is_senior_pwd)->toBeTrue()
        ->and((float) $invoice->vat_amount)->toBe(0.0)
        ->and(ledgerBalance('A_JAMORA', '4110'))->toBe(200.0)
        ->and(ledgerBalance('A_JAMORA', '4010'))->toBe(-1000.0)
        ->and(ledgerBalance('A_JAMORA', '2100'))->toBe(0.0)
        // GCash lands in the e-wallet clearing account.
        ->and(ledgerBalance('A_JAMORA', '1030'))->toBe(800.0);
});

test('a non-VAT entity books no output VAT', function () {
    Entity::where('code', 'A_JAMORA')->update(['settings' => json_encode(['vat_registered' => false])]);
    $order = opticalOrder(['completed_at' => now()->toIso8601String()]);
    $this->api['payments'] = [opticalPayment($order)];
    $this->api['orders'] = [$order];
    ($this->sync)();

    expect(ledgerBalance('A_JAMORA', '4010'))->toBe(-500.0)
        ->and(ledgerBalance('A_JAMORA', '2100'))->toBe(0.0)
        ->and(ledgerBalance('JAM_OPTICUS', '2100'))->toBe(-428.57);
});

test('wholesale orders belong to JAM Opticus with wholesale revenue', function () {
    $order = opticalOrder([
        'id' => 600, 'ts_no' => '26-10-00600', 'is_wholesale_order' => true, 'wholesale_client_id' => 3, 'patient_id' => null,
        'customer_name' => 'Vision Plus Optical', 'payable_total' => '2240.00', 'completed_at' => now()->toIso8601String(),
        'items' => [
            ['id' => 9, 'products_type' => 'App\\Models\\Lens', 'products_id' => 40, 'stock_type' => 'lens', 'is_service' => false, 'product_label' => 'Lens pair', 'product_code' => 'L-40', 'quantity' => 1, 'gross_amount' => '2240.00', 'discount_amount' => '0.00', 'amount' => '2240.00', 'unit_cost' => '900.00'],
        ],
    ]);
    $this->api['payments'] = [opticalPayment($order, ['payment_type' => 'card', 'payment_method' => 'BDO · Credit'])];
    $this->api['orders'] = [$order];
    ($this->sync)();

    $invoice = Invoice::withoutGlobalScope('entity')->sole();
    expect($invoice->entity_id)->toBe(entityId('JAM_OPTICUS'))
        ->and($invoice->pricing_type)->toBe('wholesale')
        ->and($invoice->partner->code)->toBe('OPT-C3')
        ->and(ledgerBalance('JAM_OPTICUS', '4005'))->toBe(-2000.0)
        ->and(ledgerBalance('JAM_OPTICUS', '1020'))->toBe(2240.0)
        ->and(ledgerBalance('JAM_OPTICUS', '2300'))->toBe(0.0)
        ->and(ledgerBalance('JAM_OPTICUS', '1400'))->toBe(0.0);
});

test('a changed payment reverses and rebooks the sale that used it', function () {
    $completed = opticalOrder(['completed_at' => now()->toIso8601String()]);
    $this->api['payments'] = [opticalPayment($completed)];
    $this->api['orders'] = [$completed];
    ($this->sync)();

    // The cashier corrects the payment type from cash to card.
    $this->api['payments'] = [opticalPayment($completed, ['payment_type' => 'card', 'payment_method' => 'BPI · Debit'])];
    $run = ($this->sync)();

    expect($run->failed)->toBe(0)
        ->and(ledgerBalance('A_JAMORA', '1000'))->toBe(0.0)
        ->and(ledgerBalance('A_JAMORA', '1020'))->toBe(4500.0)
        ->and(ledgerBalance('A_JAMORA', '2300'))->toBe(0.0)
        ->and(ledgerBalance('A_JAMORA', '2600'))->toBe(-4000.0)
        ->and(ledgerBalance('JAM_OPTICUS', '4000'))->toBe(-3571.43)
        ->and(Invoice::withoutGlobalScope('entity')->where('status', 'paid')->count())->toBe(2)
        ->and(CustomerDeposit::withoutGlobalScope('entity')->where('status', 'applied')->count())->toBe(1);
});

test('supplier deliveries are received into inventory against GRNI and rebooked when they grow', function () {
    $receipt = ['key' => sha1("Lens Supplier\0DR-100"), 'supplier' => 'Lens Supplier', 'supplier_id' => 4, 'delivery_receipt' => 'DR-100', 'received_at' => $this->today.' 00:00:00', 'item_count' => 2, 'uncosted_count' => 0, 'total_cost' => '300.00', 'by_type' => ['lens' => ['count' => 2, 'cost' => '300.00']], 'updated_at' => now()->toDateTimeString()];
    $this->api['inventory/receipts'] = [$receipt];
    ($this->sync)();

    expect(ledgerBalance('JAM_OPTICUS', '1200'))->toBe(300.0)
        ->and(ledgerBalance('JAM_OPTICUS', '2210'))->toBe(-300.0)
        ->and(Vendor::withoutGlobalScope('entity')->where('code', 'OPT-S4')->exists())->toBeTrue();

    $this->api['inventory/receipts'] = [[...$receipt, 'item_count' => 3, 'total_cost' => '450.00']];
    ($this->sync)();

    expect(ledgerBalance('JAM_OPTICUS', '1200'))->toBe(450.0)
        ->and(ledgerBalance('JAM_OPTICUS', '2210'))->toBe(-450.0);
});

test('defective stock is written off and flagged for review; order sales are left to the sale', function () {
    $this->api['inventory/movements'] = [
        ['id' => 71, 'stock_type' => 'frame', 'event_type' => 'defective', 'code' => 'FR-71', 'brand' => 'Rayban', 'description' => 'Cracked', 'unit_cost' => '450.00', 'supplier' => 'Lens Supplier', 'quantity' => 1, 'order_id' => null, 'occurred_at' => $this->today.' 09:00:00', 'updated_at' => now()->toDateTimeString()],
        ['id' => 72, 'stock_type' => 'frame', 'event_type' => 'sold', 'code' => 'FR-72', 'brand' => 'Rayban', 'description' => null, 'unit_cost' => '450.00', 'supplier' => null, 'quantity' => 1, 'order_id' => 501, 'occurred_at' => $this->today.' 09:00:00', 'updated_at' => now()->toDateTimeString()],
    ];
    ($this->sync)();

    expect(ledgerBalance('JAM_OPTICUS', '5010'))->toBe(450.0)
        ->and(ledgerBalance('JAM_OPTICUS', '5000'))->toBe(0.0)
        ->and(SyncDocument::withoutGlobalScope('entity')->where('source_type', 'stock_movement')->sole()->status)->toBe('review');
});

test('go-live: earlier sales are skipped and deposits on still-open orders are carried in', function () {
    config(['optical.start_date' => now('Asia/Manila')->toDateString()]);
    $yesterday = now('Asia/Manila')->subDay()->toDateString();

    $old = opticalOrder(['id' => 700, 'ts_no' => '26-10-00700', 'completed_at' => now()->subDays(3)->toIso8601String()]);
    $open = opticalOrder(['id' => 701, 'ts_no' => '26-10-00701']);
    $this->api['orders'] = [$old, $open];
    $this->api['payments'] = [
        opticalPayment($old, ['id' => 1, 'paid_date' => $yesterday]),
        opticalPayment($open, ['id' => 2, 'paid_date' => $yesterday, 'amount' => '1000.00']),
    ];
    ($this->sync)();

    $deposit = CustomerDeposit::withoutGlobalScope('entity')->sole();
    expect($deposit->external_order_id)->toBe('701')
        ->and($deposit->deposit_date->toDateString())->toBe($this->today)
        ->and(ledgerBalance('A_JAMORA', '3900'))->toBe(1000.0)
        ->and(ledgerBalance('A_JAMORA', '1000'))->toBe(0.0)
        ->and(Invoice::withoutGlobalScope('entity')->count())->toBe(0);
});

test('a document that cannot post is recorded as failed and retried on the next run', function () {
    PostingRule::withoutGlobalScope('entity')->where('event', 'deposit_cash')->update(['is_active' => false]);
    $order = opticalOrder();
    $this->api['payments'] = [opticalPayment($order)];
    $run = ($this->sync)();

    $doc = SyncDocument::withoutGlobalScope('entity')->where('source_type', 'payment')->sole();
    expect($run->status)->toBe('completed_with_errors')
        ->and($doc->status)->toBe('failed')
        ->and($doc->error)->toContain('deposit_cash');

    PostingRule::withoutGlobalScope('entity')->where('event', 'deposit_cash')->update(['is_active' => true]);
    ($this->sync)();

    expect($doc->fresh()->status)->toBe('posted')
        ->and(CustomerDeposit::withoutGlobalScope('entity')->count())->toBe(1);
});

test('the sync screens show runs and exceptions, and a failed document can be retried', function () {
    foreach (['integration.optical.view', 'integration.optical.sync'] as $p) {
        \Spatie\Permission\Models\Permission::findOrCreate($p, 'web');
    }
    $user = \App\Models\User::factory()->create();
    $user->givePermissionTo(['integration.optical.view', 'integration.optical.sync']);
    $clinic = Entity::where('code', 'A_JAMORA')->firstOrFail();
    $user->entities()->attach($clinic->id, ['is_default' => true]);
    $as = fn () => $this->actingAs($user)->withSession(['current_entity_id' => $clinic->id]);

    PostingRule::withoutGlobalScope('entity')->where('event', 'deposit_cash')->update(['is_active' => false]);
    $order = opticalOrder();
    $this->api['payments'] = [opticalPayment($order)];

    $as()->post('/integration/optical/run')->assertSessionHas('status');

    $as()->get('/integration/optical')->assertOk()
        ->assertInertia(fn ($p) => $p->component('integration/optical/page')
            ->where('failedCount', 1)
            ->where('settings.configured', true)
            ->has('runs', 1));

    $as()->get('/integration/optical/exceptions?status=failed')->assertOk()
        ->assertInertia(fn ($p) => $p->component('integration/optical/exceptions/page')
            ->where('documents.0.reference', 'Payment #9001 · order 26-10-00501')
            ->where('documents.0.status', 'failed'));

    PostingRule::withoutGlobalScope('entity')->where('event', 'deposit_cash')->update(['is_active' => true]);
    $doc = SyncDocument::withoutGlobalScope('entity')->sole();
    $as()->post("/integration/optical/exceptions/{$doc->id}/retry")->assertSessionHas('status');

    expect($doc->fresh()->status)->toBe('posted');
});
