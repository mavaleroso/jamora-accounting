<?php

namespace App\Models\Concerns;

use App\Models\Entity;
use App\Support\EntityContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

trait BelongsToEntity
{
    public static function bootBelongsToEntity(): void
    {
        static::addGlobalScope('entity', function (Builder $builder): void {
            $entityId = app(EntityContext::class)->id();

            if ($entityId !== null) {
                $builder->where($builder->getModel()->getTable().'.entity_id', $entityId);
            }
        });

        static::creating(function ($model): void {
            if ($model->entity_id === null) {
                $model->entity_id = app(EntityContext::class)->id();
            }
        });
    }

    public function entity(): BelongsTo
    {
        return $this->belongsTo(Entity::class);
    }

    public function scopeForEntity(Builder $query, int|Entity $entity): Builder
    {
        $id = $entity instanceof Entity ? $entity->id : $entity;

        return $query->withoutGlobalScope('entity')->where($this->getTable().'.entity_id', $id);
    }

    public function scopeWithoutEntityScope(Builder $query): Builder
    {
        return $query->withoutGlobalScope('entity');
    }
}
