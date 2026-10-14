<?php

namespace App\Models;

use App\Models\Concerns\BelongsToEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShiftTemplate extends Model
{
    use BelongsToEntity;

    protected $fillable = [
        'entity_id', 'code', 'name', 'start_time', 'end_time',
        'break_minutes', 'grace_minutes', 'color', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'break_minutes' => 'integer',
            'grace_minutes' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function rosters(): HasMany
    {
        return $this->hasMany(ShiftRoster::class);
    }

    /**
     * Net paid hours of the shift (span less unpaid break). Handles overnight shifts.
     */
    public function getNetHoursAttribute(): float
    {
        $start = strtotime('2000-01-01 '.$this->start_time);
        $end = strtotime('2000-01-01 '.$this->end_time);
        if ($end <= $start) {
            $end += 86400;
        }

        return round(max(0, (($end - $start) / 60) - $this->break_minutes) / 60, 2);
    }
}

