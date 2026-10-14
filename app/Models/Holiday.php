<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Holiday calendar. entity_id = null means a national holiday that applies to every entity;
 * entity-specific rows (e.g. local city holidays) override/extend it.
 */
class Holiday extends Model
{
    public const TYPE_REGULAR = 'regular';

    public const TYPE_SPECIAL = 'special';

    protected $fillable = ['entity_id', 'holiday_date', 'name', 'type', 'scope'];

    protected function casts(): array
    {
        return [
            'holiday_date' => 'date:Y-m-d',
        ];
    }

    public function scopeApplicableTo(Builder $query, ?int $entityId): Builder
    {
        return $query->where(function (Builder $q) use ($entityId) {
            $q->whereNull('entity_id');
            if ($entityId !== null) {
                $q->orWhere('entity_id', $entityId);
            }
        });
    }
}

