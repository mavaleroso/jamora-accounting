<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerDeposit extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id', 'partner_id', 'invoice_id', 'deposit_date', 'amount', 'applied_amount',
        'status', 'payment_method', 'bank_account_id', 'reference', 'notes', 'journal_entry_id',
    ];

    protected function casts(): array
    {
        return [
            'deposit_date' => 'date',
            'amount' => 'decimal:2',
            'applied_amount' => 'decimal:2',
        ];
    }

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class);
    }

    public function remainingAmount(): float
    {
        return round((float) $this->amount - (float) $this->applied_amount, 2);
    }
}
