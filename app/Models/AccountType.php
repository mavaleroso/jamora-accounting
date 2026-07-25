<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountType extends Model
{
    protected $fillable = [
        'name',
        'classification',
        'normal_balance',
        'statement',
    ];

    public function accounts(): HasMany
    {
        return $this->hasMany(Account::class);
    }
}
