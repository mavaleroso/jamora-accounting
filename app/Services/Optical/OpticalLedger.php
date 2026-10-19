<?php

namespace App\Services\Optical;

use App\Models\Entity;
use App\Models\Journal;
use App\Models\JournalEntry;
use App\Models\PostingRule;
use App\Services\Accounting\CashMovementService;
use App\Services\Accounting\JournalPostingService;
use App\Support\EntityContext;
use RuntimeException;

/**
 * Posting helpers for the optical sync: run work in an entity's books, read that entity's posting rules, record
 * system journal entries, and reverse what a sync document booked.
 */
class OpticalLedger
{
    /** @var array<int, array<string, PostingRule>> */
    protected array $rules = [];

    public function __construct(
        protected EntityContext $context,
        protected CashMovementService $cash,
        protected JournalPostingService $posting,
    ) {}

    /**
     * @template T
     *
     * @param  callable(Entity): T  $callback
     * @return T
     */
    public function in(Entity $entity, callable $callback): mixed
    {
        return $this->context->runAs($entity, $callback);
    }

    public function current(): Entity
    {
        return $this->context->current() ?? throw new RuntimeException('No entity selected for posting.');
    }

    /**
     * The current entity's active posting rule for an event (see the posting-rules screen).
     */
    public function rule(string $event): PostingRule
    {
        $entity = $this->current();

        $this->rules[$entity->id] ??= PostingRule::query()
            ->withoutGlobalScope('entity')
            ->where('entity_id', $entity->id)
            ->where('is_active', true)
            ->get()
            ->keyBy('event')
            ->all();

        return $this->rules[$entity->id][$event]
            ?? throw new RuntimeException("Posting rule [{$event}] is not set up or is inactive for {$entity->name}.");
    }

    /**
     * Record (and, unless source documents stay drafts, post) a system journal entry in the current entity.
     *
     * @param  array<string, mixed>  $header
     * @param  list<array<string, mixed>>  $lines
     */
    public function journal(string $journalCode, array $header, array $lines): JournalEntry
    {
        $journal = Journal::query()->where('code', $journalCode)->first()
            ?? throw new RuntimeException("Journal {$journalCode} is missing for {$this->current()->name}.");

        $lines = array_values(array_filter($lines, fn (array $l) => round((float) ($l['debit'] ?? 0), 2) > 0 || round((float) ($l['credit'] ?? 0), 2) > 0));

        return $this->cash->journal([
            'journal_id' => $journal->id,
            'source_system' => 'optical',
            ...$header,
        ], $lines, null);
    }

    /**
     * Reverse entries a document booked: posted entries get a mirror entry dated today (in their own entity),
     * drafts are deleted, entries already voided are left alone.
     *
     * @param  list<int>  $journalEntryIds
     */
    public function reverse(array $journalEntryIds, string $memo): void
    {
        foreach (array_reverse($journalEntryIds) as $id) {
            $entry = JournalEntry::query()->withoutGlobalScope('entity')->find($id);
            if (! $entry || $entry->status === 'void') {
                continue;
            }

            $entity = Entity::query()->findOrFail($entry->entity_id);

            $this->in($entity, function () use ($entry, $memo) {
                if ($entry->status === 'posted') {
                    $this->posting->void($entry, null, $memo.' — '.$entry->entry_no);
                } else {
                    $this->posting->delete($entry->forceFill(['status' => 'draft']));
                }
            });
        }
    }

    public function vatRate(): float
    {
        return (float) config('accounting.vat_rate', 0.12);
    }
}
