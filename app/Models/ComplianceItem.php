<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Statutory / regulatory filing. Workflow: pending -> prepared -> submitted -> verified (no skipping).
 */
class ComplianceItem extends Model
{
    use BelongsToEntity;

    public const STATUSES = ['pending', 'prepared', 'submitted', 'verified'];

    protected $fillable = [
        'entity_id',
        'title',
        'form_code',
        'agency',
        'category',
        'frequency',
        'period',
        'due_date',
        'owner_role',
        'status',
        'reference_no',
        'amount',
        'notes',
        'evidence_file',
        'prepared_by',
        'prepared_at',
        'submitted_by',
        'submitted_at',
        'verified_by',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date',
            'amount' => 'decimal:2',
            'prepared_at' => 'datetime',
            'submitted_at' => 'datetime',
            'verified_at' => 'datetime',
        ];
    }

    public function isOverdue(): bool
    {
        return in_array($this->status, ['pending', 'prepared'], true)
            && $this->due_date !== null
            && $this->due_date->lt(today());
    }

    public function nextStatus(): ?string
    {
        $idx = array_search($this->status, self::STATUSES, true);

        return $idx === false ? null : (self::STATUSES[$idx + 1] ?? null);
    }

    public function preparedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'prepared_by');
    }

    public function submittedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function verifiedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }
}
