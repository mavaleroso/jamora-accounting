<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveBalance extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id', 'employee_id', 'leave_type_id', 'year',
        'entitled', 'carried_over', 'adjusted', 'used', 'reserved',
    ];

    protected $appends = ['available'];

    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'entitled' => 'float',
            'carried_over' => 'float',
            'adjusted' => 'float',
            'used' => 'float',
            'reserved' => 'float',
        ];
    }

    /**
     * Credits that can still be filed against (excludes pending reservations).
     */
    public function getAvailableAttribute(): float
    {
        return round($this->entitled + $this->carried_over + $this->adjusted - $this->used - $this->reserved, 2);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }
}

