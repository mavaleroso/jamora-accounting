<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Bill extends Model
{
    use SoftDeletes, BelongsToEntity;

    protected $fillable = [
        'entity_id', 'vendor_id', 'bill_no', 'vendor_invoice_no', 'bill_date', 'due_date', 'vat_treatment',
        'ewt_tax_code_id', 'ewt_atc', 'ewt_rate',
        'status', 'subtotal', 'vat_amount', 'total_amount', 'ewt_amount', 'amount_paid', 'balance_due',
        'journal_entry_id', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'bill_date' => 'date',
            'due_date' => 'date',
            'subtotal' => 'decimal:2',
            'vat_amount' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'ewt_rate' => 'decimal:4',
            'ewt_amount' => 'decimal:2',
            'amount_paid' => 'decimal:2',
            'balance_due' => 'decimal:2',
        ];
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    /** The EWT code withheld on this bill (its ATC and rate are also kept on the bill). */
    public function ewtTaxCode(): BelongsTo
    {
        return $this->belongsTo(TaxCode::class, 'ewt_tax_code_id');
    }

    /** What the supplier is paid: the bill total less the tax withheld. */
    public function netPayable(): float
    {
        return round((float) $this->total_amount - (float) $this->ewt_amount, 2);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(BillLine::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(BillPayment::class);
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }
}
