<?php

namespace App\Models\Optical;

use App\Models\ReadOnlyModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class OrderPayment extends ReadOnlyModel
{
    use SoftDeletes;

    protected $connection = 'optical';

    protected $table = 'order_payments';

    protected $fillable = [
        'id',
        'order_id',
        'amount',
        'payment_type',
        'payment_method',
        'paid_date',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'paid_date' => 'date',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }
}
