<?php

namespace App\Support;

use App\Models\Entity;
use App\Models\User;
use Illuminate\Support\Facades\Session;

class EntityContext
{
    public const SESSION_KEY = 'current_entity_id';

    protected ?Entity $entity = null;

    protected bool $resolved = false;

    public function id(): ?int
    {
        return $this->current()?->id;
    }

    public function current(): ?Entity
    {
        if ($this->resolved) {
            return $this->entity;
        }

        $this->resolved = true;

        return $this->entity;
    }

    public function set(?Entity $entity): void
    {
        $this->entity = $entity;
        $this->resolved = true;

        if ($entity) {
            Session::put(self::SESSION_KEY, $entity->id);
        } else {
            Session::forget(self::SESSION_KEY);
        }
    }

    /**
     * Run the callback with another entity as the current one, then restore whichever was current before. The
     * user's session choice is not touched, so integrations can post to several entities within one request.
     *
     * @template T
     *
     * @param  callable(Entity): T  $callback
     * @return T
     */
    public function runAs(Entity $entity, callable $callback): mixed
    {
        [$previous, $wasResolved] = [$this->entity, $this->resolved];
        $this->entity = $entity;
        $this->resolved = true;

        try {
            return $callback($entity);
        } finally {
            $this->entity = $previous;
            $this->resolved = $wasResolved;
        }
    }

    public function setId(?int $entityId): void
    {
        if ($entityId === null) {
            $this->set(null);

            return;
        }

        $this->set(Entity::query()->find($entityId));
    }

    public function resolveForUser(User $user): ?Entity
    {
        $sessionId = Session::get(self::SESSION_KEY);

        // Any company the user can open (an Admin, every one) may be the current one.
        if ($sessionId) {
            $fromSession = $user->accessibleEntities()->whereKey($sessionId)->first();

            if ($fromSession) {
                $this->set($fromSession);

                return $fromSession;
            }
        }

        // Their default company, else (an Admin given none) the first one they can open.
        $default = $user->entities()
            ->where('entities.is_active', true)
            ->orderByDesc('entity_user.is_default')
            ->orderBy('entities.name')
            ->first() ?? $user->accessibleEntities()->orderBy('entities.name')->first();

        $this->set($default);

        return $default;
    }

    public function clear(): void
    {
        $this->entity = null;
        $this->resolved = false;
        Session::forget(self::SESSION_KEY);
    }
}
