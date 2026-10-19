<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * How far an incremental sync stream has read (the newest updated_at it has processed).
 */
class SyncCursor extends Model
{
    protected $fillable = ['source_system', 'stream', 'cursor_at', 'last_run_id'];

    protected function casts(): array
    {
        return [
            'cursor_at' => 'datetime',
        ];
    }
}
