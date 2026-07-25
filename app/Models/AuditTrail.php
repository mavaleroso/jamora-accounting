<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditTrail extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'action',
        'subject_type',
        'subject_id',
        'route_name',
        'method',
        'url',
        'ip_address',
        'user_agent',
        'request_payload',
        'description',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
