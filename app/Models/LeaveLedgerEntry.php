<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Immutable audit trail of every leave credit movement.
 * action: entitlement | carry_over | adjustment | reserve | release | use | restore
 */
class LeaveLedgerEntry extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id', 'employee_id', 'leave_type_id', 'leave_request_id', 'year',
        'action', 'days', 'available_after', 'remarks', 'user_id',
    ];

    protected function casts(): array
    {
        return [
            'days' => 'float',
            'available_after' => 'float',
            'year' => 'integer',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function leaveRequest(): BelongsTo
    {
        return $this->belongsTo(LeaveRequest::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

