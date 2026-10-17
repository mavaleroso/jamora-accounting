<?php

use App\Models\Account;
use App\Models\Entity;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Models\User;
use App\Services\Accounting\JournalPostingService;
use App\Support\EntityContext;
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
    $entry = ($this->entry)($this->accountant, 'optical');

    ($this->as)($this->accountant)->post("/accounting/journal-entries/{$entry->id}/post")->assertSessionHas('status');

    expect($entry->fresh()->status)->toBe('posted')->and($entry->fresh()->approved_by)->toBeNull();
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
