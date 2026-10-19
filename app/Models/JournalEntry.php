<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class JournalEntry extends Model
{
    use BelongsToEntity, SoftDeletes;

    /**
     * Entries that reached the ledger. A voided entry was posted and stays in the ledger next to the posted entry
     * that reverses it, so balances read from journal lines must include both.
     */
    public const LEDGER_STATUSES = ['posted', 'void'];

    protected $fillable = [
        'entity_id',
        'entry_no',
        'journal_id',
        'accounting_period_id',
        'entry_date',
        'reference',
        'memo',
        'source_system',
        'source_type',
        'source_id',
        'status',
        'total_debit',
        'total_credit',
        'prepared_by',
        'approved_by',
        'posted_by',
        'posted_at',
        'voided_by',
        'voided_at',
        'void_of_entry_id',
    ];

    protected function casts(): array
    {
        return [
            'entry_date' => 'date',
            'total_debit' => 'decimal:2',
            'total_credit' => 'decimal:2',
            'posted_at' => 'datetime',
            'voided_at' => 'datetime',
        ];
    }

    public function journal(): BelongsTo
    {
        return $this->belongsTo(Journal::class);
    }

    public function accountingPeriod(): BelongsTo
    {
        return $this->belongsTo(AccountingPeriod::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(JournalEntryLine::class);
    }

    public function preparedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function approvedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function postedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    public function voidedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'voided_by');
    }

    public function voidOfEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class, 'void_of_entry_id');
    }

    public function reversingEntries(): HasMany
    {
        return $this->hasMany(JournalEntry::class, 'void_of_entry_id');
    }
}
