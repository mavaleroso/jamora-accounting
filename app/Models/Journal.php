<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Journal extends Model
{
    protected $fillable = [
        'code',
        'name',
        'type',
        'default_account_id',
        'sequence_prefix',
        'next_sequence',
    ];

    protected function casts(): array
    {
        return [
            'next_sequence' => 'integer',
        ];
    }

    public function defaultAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'default_account_id');
    }

    public function journalEntries(): HasMany
    {
        return $this->hasMany(JournalEntry::class);
    }
}
