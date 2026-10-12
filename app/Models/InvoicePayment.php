<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InvoicePayment extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id', 'invoice_id', 'paid_date', 'amount', 'payment_method', 'reference',
        'bank_account_id', 'customer_deposit_id', 'journal_entry_id', 'received_by',
    ];

    protected function casts(): array
    {
        return [
            'paid_date' => 'date',
            'amount' => 'decimal:2',
        ];
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class);
    }
}
