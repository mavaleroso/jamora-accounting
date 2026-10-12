<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShiftRoster extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id',
        'employee_id',
        'roster_date',
        'shift_name',
        'shift_start',
        'shift_end',
        'is_rest_day',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'roster_date' => 'date',
            'is_rest_day' => 'boolean',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}

