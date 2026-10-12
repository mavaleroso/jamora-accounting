<?php

namespace App\Models;

use App\Support\EntityContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountingPeriod extends Model
{
    protected $fillable = [
        'fiscal_year_id',
        'period_no',
        'start_date',
        'end_date',
        'status',
        'closed_by',
        'closed_at',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope('entity', function (Builder $builder): void {
            $entityId = app(EntityContext::class)->id();
            if ($entityId !== null) {
                $builder->whereHas('fiscalYear', fn (Builder $q) => $q->where('entity_id', $entityId));
            }
        });
    }

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'closed_at' => 'datetime',
        ];
    }

    public function fiscalYear(): BelongsTo
    {
        return $this->belongsTo(FiscalYear::class);
    }

    public function closedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function journalEntries(): HasMany
    {
        return $this->hasMany(JournalEntry::class);
    }

    public function accountPeriodBalances(): HasMany
    {
        return $this->hasMany(AccountPeriodBalance::class);
    }
}
