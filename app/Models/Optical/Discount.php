<?php

namespace App\Models\Optical;

use App\Models\ReadOnlyModel;
use Illuminate\Database\Eloquent\SoftDeletes;

class Discount extends ReadOnlyModel
{
    use SoftDeletes;

    protected $connection = 'optical';

    protected $table = 'discounts';

    protected $fillable = [
        'id',
        'code',
        'name',
        'percentage',
    ];

    protected function casts(): array
    {
        return [
            'percentage' => 'float',
        ];
    }
}
