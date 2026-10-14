<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Leave application. Lifecycle: pending -> approved | declined; pending/approved -> cancelled.
 * Approval is single-level (HR). Credits are reserved on filing, consumed on approval and
 * released/restored on decline/cancellation via App\Services\People\LeaveService.
 */
class LeaveRequest extends Model
{
    use BelongsToEntity;

    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_DECLINED = 'declined';

    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'entity_id',
        'employee_id',
        'leave_type_id',
        'leave_type',
        'start_date',
        'end_date',
        'half_day',
        'days_count',
        'reason',
        'attachment_path',
        'status',
        'filed_by',
        'approved_by',
        'approved_at',
        'rejection_reason',
        'cancelled_by',
        'cancelled_at',
        'cancellation_reason',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'days_count' => 'decimal:1',
            'approved_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function type(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class, 'leave_type_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function filer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'filed_by');
    }

    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function ledgerEntries(): HasMany
    {
        return $this->hasMany(LeaveLedgerEntry::class);
    }
}
