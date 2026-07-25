<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncRun extends Model
{
    protected $fillable = [
        'started_at',
        'finished_at',
        'status',
        'from_date',
        'to_date',
        'processed',
        'created_entries',
        'skipped',
        'failed',
        'message',
        'triggered_by',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'from_date' => 'date',
            'to_date' => 'date',
            'processed' => 'integer',
            'created_entries' => 'integer',
            'skipped' => 'integer',
            'failed' => 'integer',
        ];
    }

    public function triggeredByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }
}
