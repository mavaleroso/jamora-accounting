<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

abstract class ReadOnlyModel extends Model
{
    protected static function booted(): void
    {
        static::saving(function (): void {
            throw new \RuntimeException(static::class.' is read-only.');
        });

        static::deleting(function (): void {
            throw new \RuntimeException(static::class.' is read-only.');
        });
    }
}
