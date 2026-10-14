<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One audited change. event: created | updated | deleted | restored (a model) or request (a write request
 * that changed nothing through Eloquent). Rows from the same request share a batch_id.
 * Written by App\Support\Audit\AuditLogger — never edited.
 */
class AuditTrail extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'entity_id',
        'batch_id',
        'source',
        'action',
        'event',
        'subject_type',
        'subject_id',
        'subject_label',
        'route_name',
        'method',
        'status_code',
        'url',
        'ip_address',
        'user_agent',
        'request_payload',
        'old_values',
        'new_values',
        'description',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
            'old_values' => 'array',
            'new_values' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function entity(): BelongsTo
    {
        return $this->belongsTo(Entity::class);
    }
}
