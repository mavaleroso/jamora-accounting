<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountPeriodBalance extends Model
{
    protected $fillable = [
        'account_id',
        'accounting_period_id',
        'opening_debit',
        'opening_credit',
        'period_debit',
        'period_credit',
        'closing_debit',
        'closing_credit',
    ];

    protected function casts(): array
    {
        return [
            'opening_debit' => 'decimal:2',
            'opening_credit' => 'decimal:2',
            'period_debit' => 'decimal:2',
            'period_credit' => 'decimal:2',
            'closing_debit' => 'decimal:2',
            'closing_credit' => 'decimal:2',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function accountingPeriod(): BelongsTo
    {
        return $this->belongsTo(AccountingPeriod::class);
    }
}
