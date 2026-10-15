<?php

use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\CustomerDeposit;
use App\Models\Entity;
use App\Models\Invoice;
use App\Models\JournalEntry;
use App\Models\Partner;
use App\Models\User;
use App\Services\Billing\InvoiceService;
use App\Support\EntityContext;
use Database\Seeders\AccountingSetupSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->entity = Entity::create(['code' => 'JAM', 'name' => 'JAM Opticus', 'is_active' => true]);
    $this->seed(AccountingSetupSeeder::class);
    app(EntityContext::class)->set($this->entity);

    $permissions = ['billing.view', 'billing.manage', 'billing.collect', 'ap.view', 'ap.manage', 'ap.pay', 'banks.view', 'banks.manage', 'banks.reconcile', 'journals.view', 'journals.create'];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->user = User::factory()->create();
    $this->user->givePermissionTo($permissions);
    $this->user->entities()->attach($this->entity->id, ['is_default' => true]);

    $this->bank = BankAccount::create(['code' => 'BDO-1', 'name' => 'BDO Operating', 'bank_name' => 'BDO', 'is_shared' => true, 'is_active' => true]);
    $this->bank->entities()->attach($this->entity->id);

    $this->partner = Partner::create(['entity_id' => $this->entity->id, 'code' => 'C-001', 'name' => 'Maria Santos', 'type' => 'patient', 'is_active' => true]);
});

function makeInvoice(array $overrides = [], ?array $lines = null): Invoice
{
    return app(InvoiceService::class)->create(array_merge([
        'partner_id' => test()->partner->id,
        'invoice_no' => 'INV-'.uniqid(),
        'invoice_date' => now()->toDateString(),
        'due_date' => now()->toDateString(),
        'pricing_type' => 'retail',
        'is_senior_pwd' => false,
        'is_vat_exempt' => false,
    ], $overrides), $lines ?? [
        ['line_type' => 'product', 'description' => 'Frame + lens package', 'quantity' => 1, 'unit_price' => 3360],
        ['line_type' => 'edging', 'description' => 'Edging service', 'quantity' => 1, 'unit_price' => 1120],
    ], test()->user->id);
}

function lineFor(JournalEntry $entry, string $code)
{
    return $entry->lines->first(fn ($l) => $l->account->code === $code);
}

test('regular sale extracts 12% VAT from VAT-inclusive prices', function () {
    $invoice = makeInvoice();

    expect((float) $invoice->total_amount)->toBe(4480.0)
        ->and((float) $invoice->vat_amount)->toBe(480.0)
        ->and((float) $invoice->subtotal)->toBe(4000.0);
});

test('senior/PWD sale removes VAT then applies the 20% discount', function () {
    $invoice = makeInvoice(['is_senior_pwd' => true, 'is_vat_exempt' => true]);

    // 4,480 / 1.12 = 4,000 VAT-exclusive; less 20% = 3,200.
    expect((float) $invoice->total_amount)->toBe(3200.0)
        ->and((float) $invoice->vat_amount)->toBe(0.0)
        ->and((float) $invoice->discount_amount)->toBe(800.0);
});

test('confirming books AR, discounts, product vs service revenue and output VAT in balance', function () {
    $invoice = makeInvoice(['is_senior_pwd' => true, 'is_vat_exempt' => true]);
    app(InvoiceService::class)->confirm($invoice, $this->user->id);

    $entry = JournalEntry::with('lines.account')->find($invoice->fresh()->journal_entry_id);

    expect((float) $entry->total_debit)->toBe((float) $entry->total_credit)
        ->and((float) lineFor($entry, '1100')->debit)->toBe(3200.0)
        ->and((float) lineFor($entry, '4100')->debit)->toBe(800.0)
        ->and((float) lineFor($entry, '4000')->credit)->toBe(3000.0)
        ->and((float) lineFor($entry, '4010')->credit)->toBe(1000.0)
        ->and(lineFor($entry, '2100'))->toBeNull();
});

test('check collections require a bank account and land on its register', function () {
    $invoice = makeInvoice();
    app(InvoiceService::class)->confirm($invoice, $this->user->id);

    $this->actingAs($this->user)
        ->post("/billing/invoices/{$invoice->id}/collect", ['paid_date' => now()->toDateString(), 'amount' => 1000, 'payment_method' => 'check', 'reference' => 'CHK-1'])
        ->assertSessionHasErrors('bank_account_id');

    $this->actingAs($this->user)
        ->post("/billing/invoices/{$invoice->id}/collect", [
            'paid_date' => now()->toDateString(), 'amount' => 1000, 'payment_method' => 'check', 'reference' => 'CHK-1', 'bank_account_id' => $this->bank->id,
        ])
        ->assertSessionHasNoErrors();

    expect((float) $invoice->fresh()->balance_due)->toBe(3480.0)
        ->and($invoice->fresh()->status)->toBe('partially_paid')
        ->and(BankTransaction::where('source_type', 'invoice_payment')->where('direction', 'in')->sum('amount'))->toEqual(1000);
});

test('payments cannot exceed the balance due', function () {
    $invoice = makeInvoice();
    app(InvoiceService::class)->confirm($invoice, $this->user->id);

    $this->actingAs($this->user)
        ->post("/billing/invoices/{$invoice->id}/collect", ['paid_date' => now()->toDateString(), 'amount' => 9999, 'payment_method' => 'cash'])
        ->assertSessionHasErrors('amount');
});

test('deposits are booked as a liability and applied to the invoice', function () {
    $this->actingAs($this->user)
        ->post('/billing/deposits', [
            'partner_id' => $this->partner->id, 'deposit_date' => now()->toDateString(), 'amount' => 1000, 'payment_method' => 'gcash', 'reference' => 'GC-123',
        ])
        ->assertSessionHasNoErrors();

    $deposit = CustomerDeposit::firstOrFail();
    $entry = JournalEntry::with('lines.account')->find($deposit->journal_entry_id);
    expect((float) lineFor($entry, '2300')->credit)->toBe(1000.0)
        ->and((float) lineFor($entry, '1030')->debit)->toBe(1000.0);

    $invoice = makeInvoice();
    app(InvoiceService::class)->confirm($invoice, $this->user->id);

    $this->actingAs($this->user)
        ->post("/billing/invoices/{$invoice->id}/apply-deposit", ['customer_deposit_id' => $deposit->id, 'amount' => 1000, 'applied_date' => now()->toDateString()])
        ->assertSessionHasNoErrors();

    expect($deposit->fresh()->status)->toBe('applied')
        ->and((float) $deposit->fresh()->applied_amount)->toBe(1000.0)
        ->and((float) $invoice->fresh()->balance_due)->toBe(3480.0);
});

test('a deposit cannot be applied beyond what remains on it', function () {
    $deposit = CustomerDeposit::create(['partner_id' => $this->partner->id, 'deposit_date' => now()->toDateString(), 'amount' => 500, 'applied_amount' => 0, 'status' => 'open']);
    $invoice = makeInvoice();
    app(InvoiceService::class)->confirm($invoice, $this->user->id);

    $this->actingAs($this->user)
        ->post("/billing/invoices/{$invoice->id}/apply-deposit", ['customer_deposit_id' => $deposit->id, 'amount' => 800, 'applied_date' => now()->toDateString()])
        ->assertSessionHasErrors('amount');
});

test('billing pages render', function () {
    $invoice = makeInvoice();

    $this->actingAs($this->user)->get('/billing/invoices')->assertOk()->assertInertia(fn ($p) => $p->component('billing/invoices/page')->has('summary'));
    $this->actingAs($this->user)->get('/billing/invoices/create')->assertOk();
    $this->actingAs($this->user)->get("/billing/invoices/{$invoice->id}")->assertOk()->assertInertia(fn ($p) => $p->component('billing/invoices/show/page'));
    $this->actingAs($this->user)->get('/billing/deposits')->assertOk();
});

test('VAT-inclusive bills debit net expense and input VAT, and payments hit the chosen bank', function () {
    $vendor = \App\Models\Vendor::create(['entity_id' => $this->entity->id, 'code' => 'V-001', 'name' => 'Essilor PH', 'is_active' => true]);
    $rent = Account::where('code', '6100')->firstOrFail();

    $this->actingAs($this->user)->post('/ap/bills', [
        'vendor_id' => $vendor->id, 'bill_no' => 'BILL-1', 'vendor_invoice_no' => 'ES-77', 'bill_date' => now()->toDateString(),
        'due_date' => now()->addDays(30)->toDateString(), 'vat_treatment' => 'inclusive',
        'lines' => [['description' => 'Rent', 'account_id' => $rent->id, 'amount' => 11200]],
    ])->assertSessionHasNoErrors();

    $bill = \App\Models\Bill::firstOrFail();
    expect((float) $bill->subtotal)->toBe(10000.0)->and((float) $bill->vat_amount)->toBe(1200.0);

    // Duplicate supplier invoice numbers are rejected.
    $this->actingAs($this->user)->post('/ap/bills', [
        'vendor_id' => $vendor->id, 'bill_no' => 'BILL-2', 'vendor_invoice_no' => 'ES-77', 'bill_date' => now()->toDateString(),
        'due_date' => now()->toDateString(), 'vat_treatment' => 'inclusive',
        'lines' => [['description' => 'Rent', 'account_id' => $rent->id, 'amount' => 100]],
    ])->assertSessionHasErrors('vendor_invoice_no');

    $this->actingAs($this->user)->post("/ap/bills/{$bill->id}/post")->assertSessionHasNoErrors();
    $entry = JournalEntry::with('lines.account')->find($bill->fresh()->journal_entry_id);
    expect((float) lineFor($entry, '6100')->debit)->toBe(10000.0)
        ->and((float) lineFor($entry, '1300')->debit)->toBe(1200.0)
        ->and((float) lineFor($entry, '2000')->credit)->toBe(11200.0);

    $this->actingAs($this->user)->post("/ap/bills/{$bill->id}/pay", [
        'paid_date' => now()->toDateString(), 'amount' => 11200, 'payment_method' => 'check', 'reference' => '000123', 'bank_account_id' => $this->bank->id,
    ])->assertSessionHasNoErrors();

    $txn = BankTransaction::where('source_type', 'bill_payment')->firstOrFail();
    expect($bill->fresh()->status)->toBe('paid')
        ->and($txn->direction)->toBe('out')
        ->and($txn->entity_id)->toBe($this->entity->id)
        ->and((float) $txn->amount)->toBe(11200.0);

    $this->actingAs($this->user)->get('/ap/bills')->assertOk();
    $this->actingAs($this->user)->get("/ap/bills/{$bill->id}")->assertOk()->assertInertia(fn ($p) => $p->component('ap/bills/show/page'));
});

test('reconciliation clears items across entities on a shared account and only completes at zero difference', function () {
    $other = Entity::create(['code' => 'AJO', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    $this->bank->entities()->attach($other->id);

    $mine = BankTransaction::create(['bank_account_id' => $this->bank->id, 'entity_id' => $this->entity->id, 'txn_date' => now()->subDays(3)->toDateString(), 'description' => 'Collection', 'amount' => 5000, 'direction' => 'in']);
    $theirs = BankTransaction::withoutGlobalScope('entity')->create(['bank_account_id' => $this->bank->id, 'entity_id' => $other->id, 'txn_date' => now()->subDays(2)->toDateString(), 'description' => 'Rent', 'amount' => 2000, 'direction' => 'out']);
    BankTransaction::create(['bank_account_id' => $this->bank->id, 'entity_id' => $this->entity->id, 'txn_date' => now()->subDay()->toDateString(), 'description' => 'Outstanding check', 'amount' => 700, 'direction' => 'out']);

    $this->actingAs($this->user)->post('/banks/reconciliations', [
        'bank_account_id' => $this->bank->id, 'statement_date' => now()->toDateString(), 'statement_ending_balance' => 3000,
    ])->assertRedirect();

    $rec = \App\Models\BankReconciliation::firstOrFail();
    $this->actingAs($this->user)->get("/banks/reconciliations/{$rec->id}")
        ->assertOk()->assertInertia(fn ($p) => $p->component('banks/reconciliations/show/page')->has('items', 3));

    // Only one item ticked → difference 3,000 − 5,000 = −2,000 → cannot complete.
    $this->actingAs($this->user)->post("/banks/reconciliations/{$rec->id}/items", ['ids' => [$mine->id], 'cleared' => true]);
    $this->actingAs($this->user)->post("/banks/reconciliations/{$rec->id}/complete")->assertSessionHasErrors('difference');
    expect($rec->fresh()->status)->toBe('open');

    // The other entity's payment on the shared account is part of the same statement.
    $this->actingAs($this->user)->post("/banks/reconciliations/{$rec->id}/items", ['ids' => [$theirs->id], 'cleared' => true]);
    expect((float) $rec->fresh()->difference)->toBe(0.0);

    $this->actingAs($this->user)->post("/banks/reconciliations/{$rec->id}/complete")->assertSessionHasNoErrors();
    expect($rec->fresh()->status)->toBe('reconciled');

    // The next statement starts from this one's ending balance and must be dated later.
    $this->actingAs($this->user)->post('/banks/reconciliations', [
        'bank_account_id' => $this->bank->id, 'statement_date' => now()->toDateString(), 'statement_ending_balance' => 2300,
    ])->assertSessionHasErrors('statement_date');

    $this->actingAs($this->user)->post('/banks/reconciliations', [
        'bank_account_id' => $this->bank->id, 'statement_date' => now()->addMonth()->toDateString(), 'statement_ending_balance' => 2300,
    ]);
    expect((float) \App\Models\BankReconciliation::where('status', 'open')->firstOrFail()->beginning_balance)->toBe(3000.0);
});

test('bank account pages show balances and the register', function () {
    BankTransaction::create(['bank_account_id' => $this->bank->id, 'entity_id' => $this->entity->id, 'txn_date' => now()->toDateString(), 'description' => 'Collection', 'amount' => 1500, 'direction' => 'in']);

    $this->actingAs($this->user)->get('/banks/accounts')->assertOk()
        ->assertInertia(fn ($p) => $p->component('banks/accounts/page')->where('bankAccounts.0.book_balance', 1500));
    $this->actingAs($this->user)->get("/banks/accounts/{$this->bank->id}")->assertOk()
        ->assertInertia(fn ($p) => $p->component('banks/accounts/show/page')->where('closing', 1500));
    $this->actingAs($this->user)->get('/banks/reconciliations')->assertOk();
});

test('general ledger carries the balance forward from before the period', function () {
    $this->user->givePermissionTo(Permission::findOrCreate('reports.general-ledger.view', 'web'));
    $poster = app(\App\Services\Accounting\JournalPostingService::class);
    $gj = \App\Models\Journal::where('code', 'GJ')->firstOrFail();
    $rent = Account::where('code', '6100')->firstOrFail();
    $accrued = Account::where('code', '2200')->firstOrFail();

    foreach ([[now()->startOfMonth()->subDays(5), 1000], [now()->startOfMonth()->addDay(), 250]] as [$date, $amount]) {
        $entry = $poster->create(['journal_id' => $gj->id, 'entry_date' => $date->toDateString(), 'memo' => 'Rent accrual'], [
            ['account_id' => $rent->id, 'debit' => $amount, 'credit' => 0],
            ['account_id' => $accrued->id, 'debit' => 0, 'credit' => $amount],
        ], $this->user);
        $poster->post($entry, $this->user);
    }

    $ledger = app(\App\Services\Accounting\LedgerService::class)->getLedger($rent->id, now()->startOfMonth()->toDateString(), now()->toDateString());

    expect($ledger['opening_balance'])->toBe(1000.0)
        ->and($ledger['lines'])->toHaveCount(1)
        ->and($ledger['closing_balance'])->toBe(1250.0);

    $this->actingAs($this->user)->get("/accounting/general-ledger?account_id={$rent->id}")->assertOk()
        ->assertInertia(fn ($p) => $p->where('ledger.opening_balance', 1000));
})->skip(fn () => now()->day === 1, 'Needs a day after the 1st for an in-period entry.');

test('manual journals reject cash and bank accounts', function () {
    $this->user->givePermissionTo(Permission::findOrCreate('journals.create', 'web'));
    $cash = Account::where('code', '1000')->firstOrFail();
    $rent = Account::where('code', '6100')->firstOrFail();

    $this->actingAs($this->user)->post('/accounting/journal-entries', [
        'journal_id' => \App\Models\Journal::where('code', 'GJ')->value('id'),
        'entry_date' => now()->toDateString(),
        'lines' => [
            ['account_id' => $rent->id, 'debit' => 100, 'credit' => 0],
            ['account_id' => $cash->id, 'debit' => 0, 'credit' => 100],
        ],
    ])->assertSessionHasErrors('lines.1.account_id');
});

test('direct cash payments post a balanced entry and appear in the cash book', function () {
    $utilities = Account::where('code', '6200')->firstOrFail();

    $this->actingAs($this->user)->post('/accounting/cash-bank-records', [
        'kind' => 'payment', 'payment_method' => 'cash', 'counter_account_id' => $utilities->id,
        'txn_date' => now()->toDateString(), 'amount' => 850, 'description' => 'Water bill', 'party' => 'Maynilad',
    ])->assertSessionHasNoErrors();

    $entry = JournalEntry::with('lines.account')->where('source_type', 'cash_payment')->firstOrFail();
    expect((float) lineFor($entry, '6200')->debit)->toBe(850.0)
        ->and((float) lineFor($entry, '1000')->credit)->toBe(850.0);

    // Customer receivables cannot be settled from the cash book.
    $this->actingAs($this->user)->post('/accounting/cash-bank-records', [
        'kind' => 'receipt', 'payment_method' => 'cash', 'counter_account_id' => Account::where('code', '1100')->value('id'),
        'txn_date' => now()->toDateString(), 'amount' => 100, 'description' => 'Collection',
    ])->assertSessionHasErrors('counter_account_id');

    $this->actingAs($this->user)->get('/accounting/cash-bank-records')->assertOk()
        ->assertInertia(fn ($p) => $p->where('summary.outflows', 850)->has('transactions.data', 1));
});

test('AR aging uses five buckets and ignores payments after the as-of date', function () {
    $this->user->givePermissionTo(Permission::findOrCreate('reports.ar-aging.view', 'web'));
    $svc = app(InvoiceService::class);
    $old = makeInvoice(['invoice_date' => now()->subDays(80)->toDateString(), 'due_date' => now()->subDays(75)->toDateString()]);
    $svc->confirm($old, $this->user->id);
    $current = makeInvoice(['invoice_date' => now()->subDays(2)->toDateString(), 'due_date' => now()->addDays(10)->toDateString()]);
    $svc->confirm($current, $this->user->id);
    // Paid today — but aging as of yesterday must still show it outstanding.
    $svc->collect($current, ['paid_date' => now()->toDateString(), 'amount' => 4480, 'payment_method' => 'cash'], $this->user->id);

    $report = app(\App\Services\Reports\AgingReportService::class)->build('ar', now()->subDay()->toDateString());
    expect($report['totals']['days_61_90'])->toBe(4480.0)
        ->and($report['totals']['days_over_90'])->toBe(0.0)
        ->and($report['totals']['current'])->toBe(4480.0)
        ->and($report['document_count'])->toBe(2);

    $today = app(\App\Services\Reports\AgingReportService::class)->build('ar', now()->toDateString());
    expect($today['totals']['total'])->toBe(4480.0);

    $this->actingAs($this->user)->get('/reports/ar-aging')->assertOk()->assertInertia(fn ($p) => $p->component('reports/aging/page')->where('type', 'ar'));
    $this->actingAs($this->user)->get('/reports/ar-aging/export?view=detail')->assertOk()->assertDownload();
});

test('stock issues post COGS against inventory and cannot exceed stock on hand', function () {
    $this->user->givePermissionTo(['journals.create', Permission::findOrCreate('integration.optical.view', 'web')]);
    $item = \App\Models\InventoryItem::create(['entity_id' => $this->entity->id, 'sku' => 'FR-1', 'name' => 'Titanium frame', 'category' => 'frame', 'unit_cost' => 1200, 'selling_price' => 3800, 'qty_on_hand' => 5, 'reorder_level' => 2, 'is_active' => true]);

    $this->actingAs($this->user)->post('/integration/inventory/movements', ['inventory_item_id' => $item->id, 'movement_type' => 'sales_issue', 'quantity' => 2, 'unit_cost' => 1200])
        ->assertSessionHasNoErrors();

    $movement = \App\Models\InventoryMovement::firstOrFail();
    $entry = JournalEntry::with('lines.account')->find($movement->journal_entry_id);
    expect($item->fresh()->qty_on_hand)->toBe(3)
        ->and($movement->quantity)->toBe(-2)
        ->and((float) lineFor($entry, '5000')->debit)->toBe(2400.0)
        ->and((float) lineFor($entry, '1200')->credit)->toBe(2400.0);

    $this->actingAs($this->user)->post('/integration/inventory/movements', ['inventory_item_id' => $item->id, 'movement_type' => 'edging_loss', 'quantity' => 9, 'unit_cost' => 1200])
        ->assertSessionHasErrors('quantity');
});

test('customer and supplier directories show open balances', function () {
    $this->user->givePermissionTo([Permission::findOrCreate('libraries.partners.manage', 'web'), Permission::findOrCreate('libraries.vendors.manage', 'web')]);
    $invoice = makeInvoice();
    app(InvoiceService::class)->confirm($invoice, $this->user->id);

    $this->actingAs($this->user)->get('/libraries/partners?type=patient')->assertOk()
        ->assertInertia(fn ($p) => $p->where('parties.data.0.open_balance', fn ($v) => (float) $v === 4480.0)->where('summary.outstanding', 4480));
    $this->actingAs($this->user)->get('/libraries/vendors')->assertOk();
});
