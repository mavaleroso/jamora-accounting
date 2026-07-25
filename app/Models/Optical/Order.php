<?php

namespace App\Models\Optical;

use App\Models\ReadOnlyModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Order extends ReadOnlyModel
{
    use SoftDeletes;

    protected $connection = 'optical';

    protected $table = 'orders';

    protected $fillable = [
        'id',
        'ts_no',
        'total_amount',
        'doctors_discount_amount',
        'ordered_amount',
        'vat',
        'completed',
        'payment_status',
        'amount_paid',
        'is_wholesale_order',
        'wholesale_client_id',
        'wholesale_client_name',
        'branch',
        'or',
        'si',
        'category',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'doctors_discount_amount' => 'decimal:2',
            'ordered_amount' => 'decimal:2',
            'vat' => 'decimal:2',
            'amount_paid' => 'decimal:2',
            'completed' => 'datetime',
            'is_wholesale_order' => 'boolean',
            'created_at' => 'datetime',
        ];
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(OrderItem::class, 'order_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(OrderPayment::class, 'order_id');
    }

    public function wholesaleClient(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'wholesale_client_id');
    }
}
