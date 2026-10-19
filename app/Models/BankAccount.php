<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A bank account owned by exactly one entity. Its receipts and disbursements post to its own Cash in Bank
 * sub-account in that entity's chart (see ChartOfAccounts::ensureBankLedger).
 */
class BankAccount extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id', 'code', 'name', 'bank_name', 'account_number', 'gl_account_id', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function glAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'gl_account_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(BankTransaction::class);
    }

    /**
     * @param  Builder<BankAccount>  $query
     * @return Builder<BankAccount>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
