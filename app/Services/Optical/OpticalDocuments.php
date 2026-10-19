<?php

namespace App\Services\Optical;

use App\Models\Entity;
use App\Models\SyncDocument;

/**
 * The sync's record of each optical document: its payload hash (to skip unchanged documents), the payload itself
 * (to replay on retry) and what it booked (meta), per entity.
 *
 * Statuses: posted, review (posted but needs an accountant's look), skipped, reversed, failed.
 */
class OpticalDocuments
{
    public const BOOKED = ['posted', 'review'];

    public function find(?Entity $entity, string $type, string|int $id): ?SyncDocument
    {
        return SyncDocument::query()
            ->withoutGlobalScope('entity')
            ->where('entity_id', $entity?->id)
            ->where('source_system', 'optical')
            ->where('source_type', $type)
            ->where('source_id', (string) $id)
            ->first();
    }

    public function isUnchanged(?SyncDocument $doc, string $hash): bool
    {
        return $doc !== null && in_array($doc->status, self::BOOKED, true) && $doc->payload_hash === $hash;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>|null  $meta
     */
    public function save(?Entity $entity, string $type, string|int $id, string $hash, array $payload, string $status, ?array $meta = null, ?string $note = null): SyncDocument
    {
        $journalIds = $meta['journal_entry_ids'] ?? [];

        return SyncDocument::query()->withoutGlobalScope('entity')->updateOrCreate(
            [
                'entity_id' => $entity?->id,
                'source_system' => 'optical',
                'source_type' => $type,
                'source_id' => (string) $id,
            ],
            [
                'payload_hash' => $hash,
                'payload' => $payload,
                'meta' => $meta,
                'journal_entry_id' => $journalIds[0] ?? null,
                'status' => $status,
                'error' => $note,
                'synced_at' => now(),
            ]
        );
    }

    /**
     * Record a failure. Whatever the document booked before stays in meta so the next attempt reverses it first.
     *
     * @param  array<string, mixed>  $payload
     */
    public function fail(?Entity $entity, string $type, string|int $id, array $payload, string $error): SyncDocument
    {
        $doc = $this->find($entity, $type, $id);

        return SyncDocument::query()->withoutGlobalScope('entity')->updateOrCreate(
            [
                'entity_id' => $entity?->id,
                'source_system' => 'optical',
                'source_type' => $type,
                'source_id' => (string) $id,
            ],
            [
                'payload_hash' => $doc->payload_hash ?? 'failed',
                'payload' => $payload,
                'meta' => $doc?->meta,
                'status' => 'failed',
                'error' => mb_substr($error, 0, 2000),
                'synced_at' => now(),
            ]
        );
    }

    /**
     * @param  array<string, mixed>  $value
     */
    public static function hash(array $value): string
    {
        return hash('sha256', json_encode($value, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
    }
}
