<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ComplianceItem extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id',
        'title',
        'category',
        'period',
        'due_date',
        'owner_role',
        'status',
        'reference_no',
        'amount',
        'notes',
        'evidence_file',
        'verified_by',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date',
            'amount' => 'decimal:2',
            'verified_at' => 'datetime',
        ];
    }

    public function verifiedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}

