<?php

use App\Models\Account;
use App\Models\BankAccount;
use App\Models\BankReconciliation;
use App\Models\BankTransaction;
use App\Models\Entity;
use App\Models\JournalEntryLine;
use App\Models\User;
use App\Services\Accounting\CashMovementService;
use App\Support\EntityContext;
use Database\Seeders\AccountingSetupSeeder;
use Database\Seeders\BankAccountSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;

/*
 * The proposal's banking (§3.5): four accounts shared between JAM Opticus and A. Jamora Optical, one dedicated to AL
 * Jamora Optical. A company records its own receipts and disbursements through a shared account, in its own ledger
 * account for it; each register line is tagged with its company, and the account is reconciled as a whole.
 */
beforeEach(function () {
    $this->jam = Entity::create(['code' => 'JAM_OPTICUS', 'name' => 'JAM Opticus', 'is_active' => true]);
    $this->aj = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    $this->al = Entity::create(['code' => 'AL_JAMORA', 'name' => 'AL Jamora Optical', 'is_active' => true]);
    $this->seed([AccountingSetupSeeder::class, BankAccountSeeder::class]);
    app(EntityContext::class)->clear();

    $permissions = ['banks.view', 'banks.manage', 'banks.reconcile'];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->user = User::factory()->create();
    $this->user->givePermissionTo($permissions);
    foreach ([$this->jam, $this->aj, $this->al] as $i => $entity) {
        $this->user->entities()->attach($entity->id, ['is_default' => $i === 0]);
    }

    $this->bank = fn (string $code) => BankAccount::query()->withoutGlobalScope('entity')->where('code', $code)->firstOrFail();
    // A company's own ledger account for a bank account.
    $this->ledger = fn (string $code, Entity $entity) => Account::query()->withoutGlobalScope('entity')->findOrFail(
        DB::table('bank_account_entity')->where('bank_account_id', ($this->bank)($code)->id)->where('entity_id', $entity->id)->value('gl_account_id'),
    );
    // Money moved between a company's cash on hand and a bank account, recorded in that company's books.
    $this->move = fn (Entity $entity, string $from, string $to, float $amount) => app(EntityContext::class)->runAs(
        $entity,
        fn () => app(CashMovementService::class)->transfer(['txn_date' => '2026-10-05', 'amount' => $amount, 'from' => $from, 'to' => $to]),
    );
    $this->as = fn (Entity $entity) => $this->actingAs($this->user)->withSession(['current_entity_id' => $entity->id]);
});

test('four accounts are shared between JAM Opticus and A. Jamora Optical, one is dedicated to AL Jamora Optical', function () {
    $layout = BankAccount::query()->withoutGlobalScope('entity')->with('companies')->orderBy('code')->get()
        ->mapWithKeys(fn (BankAccount $b) => [$b->code => $b->companies->pluck('code')->sort()->values()->all()])
        ->all();
    $shared = ['A_JAMORA', 'JAM_OPTICUS'];
    expect($layout)->toBe(['BANK1' => $shared, 'BANK2' => $shared, 'BANK3' => $shared, 'BANK4' => $shared, 'BANK5' => ['AL_JAMORA']]);

    // Each company has its own ledger account for each account it uses, in its own chart.
    expect(($this->ledger)('BANK1', $this->jam)->only(['entity_id', 'code']))->toBe(['entity_id' => $this->jam->id, 'code' => '1011'])
        ->and(($this->ledger)('BANK1', $this->aj)->only(['entity_id', 'code']))->toBe(['entity_id' => $this->aj->id, 'code' => '1011'])
        ->and(($this->ledger)('BANK2', $this->jam)->code)->toBe('1012')
        ->and(($this->ledger)('BANK5', $this->al)->code)->toBe('1011');

    // Each company's screens offer the accounts it uses.
    $usable = fn (Entity $entity) => app(EntityContext::class)->runAs($entity, fn () => BankAccount::query()->orderBy('code')->pluck('code')->all());
    expect($usable($this->aj))->toBe(['BANK1', 'BANK2', 'BANK3', 'BANK4'])
        ->and($usable($this->jam))->toBe(['BANK1', 'BANK2', 'BANK3', 'BANK4'])
        ->and($usable($this->al))->toBe(['BANK5']);

    ($this->as)($this->aj)->get('/banks/accounts')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('bankAccounts', 5)
            ->where('bankAccounts', fn ($accounts) => collect($accounts)->where('is_shared', true)->pluck('code')->sort()->values()->all() === ['BANK1', 'BANK2', 'BANK3', 'BANK4']));
});

test('each company records its own movements through a shared account, in its own books, tagged on the register', function () {
    $bank1 = ($this->bank)('BANK1');
    ($this->move)($this->aj, 'cash_on_hand', "bank:{$bank1->id}", 10000);
    ($this->move)($this->jam, 'cash_on_hand', "bank:{$bank1->id}", 5000);
    ($this->move)($this->aj, "bank:{$bank1->id}", 'cash_on_hand', 2000);

    // A. Jamora's movements hit its own ledger account for the bank, JAM Opticus's its own.
    $posted = fn (Entity $entity) => round((float) JournalEntryLine::query()->withoutGlobalScopes()
        ->where('account_id', ($this->ledger)('BANK1', $entity)->id)->sum(DB::raw('debit - credit')), 2);
    expect($posted($this->aj))->toBe(8000.0)
        ->and($posted($this->jam))->toBe(5000.0);

    // Every register line is tagged with its company.
    expect(BankTransaction::query()->withoutGlobalScope('entity')->where('bank_account_id', $bank1->id)->orderBy('id')->get()
        ->map(fn (BankTransaction $t) => [$t->entity_id, $t->direction, (float) $t->amount])->all())
        ->toBe([[$this->aj->id, 'in', 10000.0], [$this->jam->id, 'in', 5000.0], [$this->aj->id, 'out', 2000.0]]);

    // AL Jamora does not use it.
    expect(fn () => ($this->move)($this->al, 'cash_on_hand', "bank:{$bank1->id}", 100))
        ->toThrow(ValidationException::class, 'This bank account is not shared with this company.');

    // The register: the whole account, each company's share, or one company's lines on their own.
    $register = "/banks/accounts/{$bank1->id}?date_from=2026-10-01&date_to=2026-10-31";
    ($this->as)($this->jam)->get($register)->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('lines', 3)
            ->where('closing', 13000)
            ->where('lines.0.company.name', 'A. Jamora Optical')
            ->where('companies.0.name', 'JAM Opticus') // the holder first
            ->where('companies.0.balance', 5000)
            ->where('companies.1.balance', 8000));
    ($this->as)($this->jam)->get("{$register}&company={$this->aj->id}")
        ->assertInertia(fn (Assert $page) => $page->has('lines', 2)->where('closing', 8000)->where('filters.company', $this->aj->id));
});

test('a shared account is reconciled once, across both companies, from either one', function () {
    $bank1 = ($this->bank)('BANK1');
    ($this->move)($this->aj, 'cash_on_hand', "bank:{$bank1->id}", 10000);
    ($this->move)($this->jam, 'cash_on_hand', "bank:{$bank1->id}", 5000);
    $statement = ['bank_account_id' => $bank1->id, 'statement_date' => '2026-10-31', 'statement_ending_balance' => 15000];

    // Started from JAM Opticus, the statement covers A. Jamora's lines too, and A. Jamora works on the same one.
    ($this->as)($this->jam)->post('/banks/reconciliations', $statement)->assertSessionHasNoErrors();
    $rec = BankReconciliation::query()->sole();
    ($this->as)($this->aj)->get("/banks/reconciliations/{$rec->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('isShared', true)->has('items', 2)->where('items.0.company.name', 'A. Jamora Optical'));
    ($this->as)($this->aj)->post('/banks/reconciliations', $statement)->assertSessionHasErrors('bank_account_id');

    ($this->as)($this->aj)->post("/banks/reconciliations/{$rec->id}/items", [
        'ids' => BankTransaction::query()->withoutGlobalScope('entity')->pluck('id')->all(), 'cleared' => true,
    ])->assertSessionHasNoErrors();
    ($this->as)($this->aj)->post("/banks/reconciliations/{$rec->id}/complete")->assertSessionHasNoErrors();
    expect($rec->fresh()->status)->toBe('reconciled');

    // A. Jamora uses the account, so it stays in A. Jamora; AL Jamora doesn't, so the holder is opened.
    ($this->as)($this->aj)->get("/banks/reconciliations?bank_account_id={$bank1->id}")->assertOk();
    ($this->as)($this->al)->get("/banks/reconciliations?bank_account_id={$bank1->id}")
        ->assertRedirect()
        ->assertSessionHas('current_entity_id', $this->jam->id);
});

test('sharing is set on the account form, and a company that has used an account stays on it', function () {
    ($this->as)($this->al)->post('/banks/accounts', [
        'entity_id' => $this->al->id, 'shared_with' => [$this->aj->id],
        'code' => 'ALJ-BPI', 'name' => 'Clinic Collections', 'bank_name' => 'BPI', 'is_active' => true,
    ])->assertSessionHasNoErrors();
    $account = ($this->bank)('ALJ-BPI');
    expect($account->companies()->pluck('code')->sort()->values()->all())->toBe(['AL_JAMORA', 'A_JAMORA'])
        ->and(($this->ledger)('ALJ-BPI', $this->aj)->entity_id)->toBe($this->aj->id);
    $ajLedger = ($this->ledger)('ALJ-BPI', $this->aj);

    // Unshared while unused: the company's ledger account for it goes too, and sharing again starts clean.
    $update = fn (array $sharedWith) => ($this->as)($this->al)->put("/banks/accounts/{$account->id}", [
        'code' => 'ALJ-BPI', 'name' => 'Clinic Collections', 'bank_name' => 'BPI', 'is_active' => true, 'shared_with' => $sharedWith,
    ]);
    $update([])->assertSessionHasNoErrors();
    expect($account->companies()->pluck('code')->all())->toBe(['AL_JAMORA'])
        ->and(Account::withTrashed()->withoutGlobalScope('entity')->find($ajLedger->id))->toBeNull();
    $update([$this->aj->id])->assertSessionHasNoErrors();
    expect(($this->ledger)('ALJ-BPI', $this->aj)->code)->toBe($ajLedger->code);

    // Once A. Jamora has used it, it stays shared with A. Jamora.
    ($this->move)($this->aj, 'cash_on_hand', "bank:{$account->id}", 500);
    $update([])->assertSessionHasErrors(['shared_with' => 'A. Jamora Optical has already used this account, so it stays shared with it.']);
    expect($account->companies()->count())->toBe(2);

    // Only companies the user can open.
    $stranger = Entity::create(['code' => 'OTHER', 'name' => 'Not Mine', 'is_active' => true]);
    $update([$stranger->id])->assertSessionHasErrors(['shared_with' => 'Share only with companies you have access to.']);
});
