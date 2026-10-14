<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Statutory / regulatory filing. Workflow: pending -> prepared -> submitted -> verified, one step at a time;
 * a different person verifies (segregation of duties) and may return a submitted filing for correction.
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

    /** Filed after the due date (penalty exposure), whatever happened afterwards. */
    public function isLate(): bool
    {
        return $this->submitted_at !== null && $this->due_date !== null && $this->submitted_at->toDateString() > $this->due_date->toDateString();
    }

    public function daysLate(): int
    {
        return $this->isLate() ? (int) $this->due_date->diffInDays($this->submitted_at->copy()->startOfDay()) : 0;
    }

    /** First day of the month this item covers ("October 2026"). */
    public function periodStart(): ?Carbon
    {
        try {
            return Carbon::parse('first day of '.$this->period)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
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
