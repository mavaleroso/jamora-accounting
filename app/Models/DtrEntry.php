<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DtrEntry extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id', 'employee_id', 'payroll_period_id', 'work_date',
        'time_in', 'break_out', 'break_in', 'time_out',
        'regular_hours', 'ot_hours', 'tardiness_minutes', 'is_absent',
        'source', 'in_latitude', 'in_longitude', 'out_latitude', 'out_longitude',
        'distance_meters', 'location_status', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date:Y-m-d',
            'regular_hours' => 'decimal:2',
            'ot_hours' => 'decimal:2',
            'tardiness_minutes' => 'decimal:2',
            'distance_meters' => 'decimal:2',
            'is_absent' => 'boolean',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
