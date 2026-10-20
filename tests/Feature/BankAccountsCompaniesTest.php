<?php

use App\Models\Account;
use App\Models\BankAccount;
use App\Models\Entity;
use App\Models\User;
use App\Support\ChartOfAccounts;
use App\Support\EntityContext;
use Database\Seeders\AccountingSetupSeeder;
use Inertia\Testing\AssertableInertia as Assert;
use Spatie\Permission\Models\Permission;

/*
 * Bank Accounts lists the accounts of every company the user can open, each labelled with its company. An account is
 * added to the company picked in the form and posts to that company's books only.
 */
beforeEach(function () {
    $this->jam = Entity::create(['code' => 'JAM_OPTICUS', 'name' => 'JAM Opticus', 'is_active' => true]);
    $this->aj = Entity::create(['code' => 'A_JAMORA', 'name' => 'A. Jamora Optical', 'is_active' => true]);
    $this->other = Entity::create(['code' => 'OTHER', 'name' => 'Not Mine Optical', 'is_active' => true]);
    $this->seed(AccountingSetupSeeder::class);
    app(EntityContext::class)->clear();

    $permissions = ['banks.view', 'banks.manage', 'banks.reconcile'];
    foreach ($permissions as $p) {
        Permission::findOrCreate($p, 'web');
    }
    $this->user = User::factory()->create();
    $this->user->givePermissionTo($permissions);
    $this->user->entities()->attach($this->aj->id, ['is_default' => true]);
    $this->user->entities()->attach($this->jam->id, ['is_default' => false]);

    $bank = function (Entity $entity, string $code, string $name) {
        $account = BankAccount::query()->withoutGlobalScope('entity')->create(['entity_id' => $entity->id, 'code' => $code, 'name' => $name, 'bank_name' => 'BDO', 'is_active' => true]);
        ChartOfAccounts::ensureBankLedger($account);

        return $account->fresh();
    };
    $this->ajBank = $bank($this->aj, 'AJO-BDO', 'A. Jamora Operating');
    $this->jamBank = $bank($this->jam, 'JAM-BDO', 'JAM Operating');
    $this->strangerBank = $bank($this->other, 'OTH-BDO', 'Not mine');

    // The current company is A. Jamora Optical.
    $this->as = fn () => $this->actingAs($this->user)->withSession(['current_entity_id' => $this->aj->id]);
});

test('every company\'s bank accounts are listed, each with its company', function () {
    ($this->as)()->get('/banks/accounts')->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->has('bankAccounts', 2)
            ->where('bankAccounts.0.code', 'AJO-BDO')                 // sorted by company: A. Jamora Optical, JAM Opticus
            ->where('bankAccounts.0.company.name', 'A. Jamora Optical')
            ->where('bankAccounts.1.company.name', 'JAM Opticus')
            ->where('bankAccounts.1.gl_account.code', '1011')         // the ledger in JAM Opticus's own chart
            ->where('companies.0.name', 'A. Jamora Optical')
            ->has('companies', 2)
            ->where('currentCompanyId', $this->aj->id)
            ->where('glAccounts', fn ($ledgers) => collect($ledgers)->pluck('entity_id')->unique()->sort()->values()->all() === collect([$this->jam->id, $this->aj->id])->sort()->values()->all()));

    // Another company's account opens and saves in its own company; one the user can't open stays closed.
    ($this->as)()->get("/banks/accounts/{$this->jamBank->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('account.entity.name', 'JAM Opticus')->where('account.gl_account.code', '1011'));
    ($this->as)()->put("/banks/accounts/{$this->jamBank->id}", ['code' => 'JAM-BDO', 'name' => 'JAM Payroll', 'bank_name' => 'BDO', 'is_active' => true])
        ->assertSessionHasNoErrors();
    expect($this->jamBank->fresh()->only(['name', 'entity_id']))->toBe(['name' => 'JAM Payroll', 'entity_id' => $this->jam->id]);

    ($this->as)()->get("/banks/accounts/{$this->strangerBank->id}")->assertNotFound();
    ($this->as)()->put("/banks/accounts/{$this->strangerBank->id}", ['code' => 'OTH-BDO', 'name' => 'Mine now', 'bank_name' => 'BDO', 'is_active' => true])->assertNotFound();
});

test('a new account is added to the company picked, with its ledger in that company\'s chart', function () {
    ($this->as)()->post('/banks/accounts', ['entity_id' => $this->jam->id, 'code' => 'JAM-BPI', 'name' => 'JAM Collections', 'bank_name' => 'BPI', 'is_active' => true])
        ->assertSessionHasNoErrors();

    $account = BankAccount::query()->withoutGlobalScope('entity')->where('code', 'JAM-BPI')->sole();
    $ledger = Account::query()->withoutGlobalScope('entity')->findOrFail($account->gl_account_id);
    expect($account->entity_id)->toBe($this->jam->id)
        ->and($ledger->entity_id)->toBe($this->jam->id)
        ->and($ledger->code)->toBe('1012');

    // A ledger of another company's chart is refused; so is a company the user can't open. No company: the current one.
    $ajLedger = Account::query()->withoutGlobalScope('entity')->findOrFail($this->ajBank->gl_account_id);
    ($this->as)()->post('/banks/accounts', ['entity_id' => $this->jam->id, 'code' => 'JAM-X', 'name' => 'X', 'bank_name' => 'BPI', 'gl_account_id' => $ajLedger->id])
        ->assertSessionHasErrors('gl_account_id');
    ($this->as)()->post('/banks/accounts', ['entity_id' => $this->other->id, 'code' => 'OTH-X', 'name' => 'X', 'bank_name' => 'BPI'])
        ->assertSessionHasErrors('entity_id');
    ($this->as)()->post('/banks/accounts', ['code' => 'AJO-BPI', 'name' => 'A. Jamora Collections', 'bank_name' => 'BPI', 'is_active' => true])
        ->assertSessionHasNoErrors();
    expect(BankAccount::query()->withoutGlobalScope('entity')->where('code', 'AJO-BPI')->value('entity_id'))->toBe($this->aj->id);
});

test('reconciling another company\'s account opens that company', function () {
    ($this->as)()->get("/banks/reconciliations?bank_account_id={$this->jamBank->id}")
        ->assertRedirect("/banks/reconciliations?bank_account_id={$this->jamBank->id}")
        ->assertSessionHas('current_entity_id', $this->jam->id);

    $this->actingAs($this->user)->withSession(['current_entity_id' => $this->jam->id])
        ->get("/banks/reconciliations?bank_account_id={$this->jamBank->id}")->assertOk()
        ->assertInertia(fn (Assert $page) => $page->where('filters.bank_account_id', $this->jamBank->id)->where('accounts.0.code', 'JAM-BDO'));

    // A company the user can't open is not switched to.
    ($this->as)()->get("/banks/reconciliations?bank_account_id={$this->strangerBank->id}")->assertOk();
});
