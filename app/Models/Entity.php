<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Entity extends Model
{
    protected $fillable = [
        'code',
        'name',
        'is_active',
        'latitude',
        'longitude',
        'geofence_radius',
        'geofence_enforced',
        'settings',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
            'geofence_radius' => 'integer',
            'geofence_enforced' => 'boolean',
            'settings' => 'array',
        ];
    }

    /**
     * Whether clocking in is limited to the branch geofence. ATTENDANCE_GEOFENCE_ENABLED is the
     * system-wide master switch: when it is off, no branch enforces, whatever its own setting.
     */
    public function geofenceEnforced(): bool
    {
        return (bool) config('attendance.geofence_enabled', true) && ($this->geofence_enforced ?? true);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class)
            ->withPivot('is_default')
            ->withTimestamps();
    }
}
