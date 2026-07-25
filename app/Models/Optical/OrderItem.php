<?php

namespace App\Models\Optical;

use App\Models\ReadOnlyModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class OrderItem extends ReadOnlyModel
{
    use SoftDeletes;

    protected $connection = 'optical';

    protected $table = 'order_items';

    protected $fillable = [
        'id',
        'order_id',
        'quantity',
        'discount_amount',
        'amount',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'discount_amount' => 'decimal:2',
            'amount' => 'decimal:2',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'order_id');
    }
}
