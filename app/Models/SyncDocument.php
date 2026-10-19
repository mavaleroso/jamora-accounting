<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncDocument extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id',
        'source_system',
        'source_type',
        'source_id',
        'payload_hash',
        'payload',
        'meta',
        'journal_entry_id',
        'status',
        'error',
        'synced_at',
    ];

    /**
     * payload: the source record as last received (retries replay it).
     * meta: what the document created — journal_entry_ids, invoice_ids, deposit_id, movement_ids — so it can be
     * reversed when the source record changes or is cancelled.
     */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'meta' => 'array',
            'synced_at' => 'datetime',
        ];
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }
}
