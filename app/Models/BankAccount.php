<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use App\Support\EntityContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

/**
 * A bank account, held by one company (entity_id) and possibly shared with others: per the proposal, four accounts
 * are shared between JAM Opticus and A. Jamora Optical and one is dedicated to AL Jamora Optical.
 *
 * Every company using an account has its own Cash in Bank sub-account for it in its own chart (bank_account_entity,
 * see ChartOfAccounts::ensureBankLedger), so each records only its own receipts and disbursements; register lines
 * are tagged with the company whose books they are in. The register as a whole is the bank's, and is reconciled once
 * per account. gl_account_id is the holder's ledger.
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

    protected static function booted(): void
    {
        // Visible to every company it is shared with, not only its holder (replaces BelongsToEntity's scope).
        static::addGlobalScope('entity', function (Builder $builder): void {
            $entityId = app(EntityContext::class)->id();

            if ($entityId !== null) {
                $builder->usableBy($entityId);
            }
        });

        // The holder always uses its own account.
        static::created(function (BankAccount $bank): void {
            if ($bank->entity_id) {
                $bank->companies()->syncWithoutDetaching([$bank->entity_id => ['gl_account_id' => $bank->gl_account_id]]);
            }
        });
    }

    /**
     * Accounts the company holds or shares.
     *
     * @param  Builder<BankAccount>  $query
     * @return Builder<BankAccount>
     */
    public function scopeUsableBy(Builder $query, int $entityId): Builder
    {
        return $query->whereExists(fn ($q) => $q->select(DB::raw(1))
            ->from('bank_account_entity')
            ->whereColumn('bank_account_entity.bank_account_id', 'bank_accounts.id')
            ->where('bank_account_entity.entity_id', $entityId));
    }

    /** Every company using the account, the holder included, each with its own ledger account (pivot gl_account_id). */
    public function companies(): BelongsToMany
    {
        return $this->belongsToMany(Entity::class, 'bank_account_entity')->withPivot('gl_account_id')->withTimestamps();
    }

    public function allowsEntity(int $entityId): bool
    {
        return $this->companies()->where('entities.id', $entityId)->exists();
    }

    /** The holder's ledger account. */
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
