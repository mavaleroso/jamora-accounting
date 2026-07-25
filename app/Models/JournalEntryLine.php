<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JournalEntryLine extends Model
{
    protected $fillable = [
        'journal_entry_id',
        'line_no',
        'account_id',
        'debit',
        'credit',
        'memo',
        'cost_center_id',
        'partner_type',
        'partner_id',
        'tax_code_id',
    ];

    protected function casts(): array
    {
        return [
            'line_no' => 'integer',
            'debit' => 'decimal:2',
            'credit' => 'decimal:2',
            'partner_id' => 'integer',
        ];
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function costCenter(): BelongsTo
    {
        return $this->belongsTo(CostCenter::class);
    }

    public function taxCode(): BelongsTo
    {
        return $this->belongsTo(TaxCode::class);
    }
}
