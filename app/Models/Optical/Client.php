<?php

namespace App\Models\Optical;

use App\Models\ReadOnlyModel;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Client extends ReadOnlyModel
{
    protected $connection = 'optical';

    protected $table = 'clients';

    protected $fillable = [
        'id',
        'name',
        'contact_person',
        'phone',
        'email',
        'status',
    ];

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'wholesale_client_id');
    }
}
