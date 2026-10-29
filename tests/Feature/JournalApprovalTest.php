<?php

use App\Exceptions\AccountingException;
use App\Models\Account;
use App\Models\Entity;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Models\User;
use App\Services\Accounting\CashMovementService;
use App\Services\Accounting\JournalPostingService;
use App\Services\Accounting\PeriodCloseService;
use App\Support\EntityContext;
use App\Support\SystemSettings;
use Database\Seeders\AccountingSetupSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->seed(RolesAndPermissionsSeeder::class);
    $this->entity = Entity::create(['code' => 'JAM', 'name' => 'JAM Opticus', 'is_active' => true]);
    $this->seed(AccountingSetupSeeder::class);
    app(EntityContext::class)->set($this->entity);

    $makeUser = function (string $role) {
        $user = User::factory()->create();
        $user->assignRole($role);
        $user->entities()->attach($this->entity->id, ['is_default' => true]);

        return $user;
    };
    $this->owner = $makeUser('Admin');
    $this->accountant = $makeUser('Accountant');
    $this->retainer = $makeUser('Accounting Retainer');

    $this->as = fn (User $user) => $this->actingAs($user)->withSession(['current_entity_id' => $this->entity->id]);

    $this->lines = [
        ['account_id' => Account::where('code', '6100')->value('id'), 'debit' => 500, 'credit' => 0],
        ['account_id' => Account::where('code', '6200')->value('id'), 'debit' => 0, 'credit' => 500],
    ];
    $this->entry = fn (User $by, string $source = 'manual') => tap(app(JournalPostingService::class)->create([
        'journal_id' => Journal::where('code', 'GJ')->value('id'),
        'entry_date' => now()->toDateString(),
        'memo' => 'Reclass',
        'source_system' => $source,
    ], $this->lines, $by))->update(['status' => 'pending']);
});

test('the accountant submits a manual entry but cannot post it without approval', function () {
    $entry = ($this->entry)($this->accountant);

    ($this->as)($this->accountant)->post("/accounting/journal-entries/{$entry->id}/post")->assertSessionHas('error');

    expect($entry->fresh()->status)->toBe('pending');
});

test('the owner approving a manual entry posts it and records the approver', function () {
    $entry = ($this->entry)($this->accountant);

    ($this->as)($this->owner)->post("/accounting/journal-entries/{$entry->id}/post")->assertSessionHas('status', 'Journal entry approved and posted.');

    $entry->refresh();
    expect($entry->status)->toBe('posted')
        ->and($entry->approved_by)->toBe($this->owner->id)
        ->and($entry->posted_by)->toBe($this->owner->id)
        ->and($entry->prepared_by)->toBe($this->accountant->id);
});

test('system drafts such as optical sync are still posted by the accountant', function () {
    // Source documents left as drafts (approval switched off, auto-post off).
    $entry = tap(($this->entry)($this->accountant, 'optical'))->update(['status' => 'draft']);

    ($this->as)($this->accountant)->post("/accounting/journal-entries/{$entry->id}/post")->assertSessionHas('status');

    expect($entry->fresh()->status)->toBe('posted')->and($entry->fresh()->approved_by)->toBeNull();
});

test('source-document entries waiting for approval are posted only by the owner, and never edited', function () {
    $entry = ($this->entry)($this->accountant, 'billing');

    ($this->as)($this->accountant)->post("/accounting/journal-entries/{$entry->id}/post")->assertSessionHas('error');
    ($this->as)($this->accountant)->get("/accounting/journal-entries/{$entry->id}/edit")->assertRedirect()->assertSessionHas('error');
    expect($entry->fresh()->status)->toBe('pending');

    ($this->as)($this->owner)->post("/accounting/journal-entries/{$entry->id}/post")->assertSessionHas('status', 'Journal entry approved and posted.');
    expect($entry->fresh()->status)->toBe('posted')->and($entry->fresh()->approved_by)->toBe($this->owner->id);
});

test('the owner approves every waiting entry that matches the filters in one go', function () {
    $optical = [($this->entry)($this->accountant, 'optical'), ($this->entry)($this->accountant, 'optical')];
    $other = tap(($this->entry)($this->accountant, 'billing'))->update(['journal_id' => Journal::where('code', 'SJ')->value('id')]);

    ($this->as)($this->accountant)->postJson('/accounting/journal-entries/approve-pending')->assertForbidden();

    ($this->as)($this->owner)
        ->postJson('/accounting/journal-entries/approve-pending', ['journal_id' => Journal::where('code', 'GJ')->value('id')])
        ->assertSuccessful()
        ->assertJsonPath('approved', 2)
        ->assertJsonPath('remaining', 0);

    expect(collect($optical)->map(fn ($e) => $e->fresh()->status)->all())->toBe(['posted', 'posted'])
        ->and($optical[0]->fresh()->approved_by)->toBe($this->owner->id)
        ->and($other->fresh()->status)->toBe('pending');
});

test('with approval on, a recorded document waits for approval instead of posting', function () {
    app(SystemSettings::class)->put(['accounting.approve_source_documents' => true]);

    $entry = app(CashMovementService::class)->journal([
        'journal_id' => Journal::where('code', 'GJ')->value('id'),
        'entry_date' => now()->toDateString(),
        'memo' => 'Document',
        'source_system' => 'billing',
    ], $this->lines, $this->accountant->id);

    expect($entry->fresh()->status)->toBe('pending');
});

test('a period with entries waiting for approval cannot be closed', function () {
    $entry = ($this->entry)($this->accountant, 'billing');

    expect(fn () => app(PeriodCloseService::class)->close($entry->accountingPeriod, $this->owner))
        ->toThrow(AccountingException::class, 'still waiting for approval');
});

test('the owner switches source-document approval in System Settings', function () {
    ($this->as)($this->owner)->put('/admin/system-settings/accounting', ['approve_source_documents' => true])->assertSessionHas('status');
    expect(app(SystemSettings::class)->approveSourceDocuments())->toBeTrue();

    ($this->as)($this->accountant)->put('/admin/system-settings/accounting', ['approve_source_documents' => false])->assertForbidden();
});

test('an accountant granted journals.approve posts manual entries directly', function () {
    $this->accountant->givePermissionTo('journals.approve');
    $entry = ($this->entry)($this->accountant);

    ($this->as)($this->accountant)->post("/accounting/journal-entries/{$entry->id}/post")->assertSessionHas('status');

    expect($entry->fresh()->status)->toBe('posted')->and($entry->fresh()->approved_by)->toBe($this->accountant->id);
});

test('the retainer drafts adjusting entries for approval but cannot post them', function () {
    ($this->as)($this->retainer)->post('/accounting/journal-entries', [
        'journal_id' => Journal::where('code', 'GJ')->value('id'),
        'entry_date' => now()->toDateString(),
        'memo' => 'AJE: accrue rent',
        'status' => 'pending',
        'lines' => $this->lines,
    ])->assertSessionHasNoErrors();

    $entry = JournalEntry::where('memo', 'AJE: accrue rent')->firstOrFail();
    expect($entry->status)->toBe('pending')->and($entry->prepared_by)->toBe($this->retainer->id);

    ($this->as)($this->retainer)->post("/accounting/journal-entries/{$entry->id}/post")->assertForbidden();
    ($this->as)($this->retainer)->post("/accounting/journal-entries/{$entry->id}/void")->assertForbidden();

    ($this->as)($this->owner)->post("/accounting/journal-entries/{$entry->id}/post")->assertSessionHas('status');
    expect($entry->fresh()->status)->toBe('posted');
});

test('the dashboard link opens the journal list filtered to entries for approval', function () {
    ($this->entry)($this->accountant);
    ($this->entry)($this->accountant, 'optical');

    ($this->as)($this->owner)->get('/accounting/journal-entries?status=pending')->assertOk()
        ->assertInertia(fn ($page) => $page->where('initialStatus', 'pending')->where('total', 2));
});
