<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PostingRule extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id',
        'event',
        'name',
        'debit_account_id',
        'credit_account_id',
        'condition',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'condition' => 'array',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function debitAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'debit_account_id');
    }

    public function creditAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'credit_account_id');
    }
}
