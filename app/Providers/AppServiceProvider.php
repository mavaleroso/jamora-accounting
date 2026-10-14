<?php

namespace App\Providers;

use App\Support\Audit\AuditLogger;
use App\Support\EntityContext;
use Illuminate\Console\Events\CommandStarting;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use Spatie\Permission\Events\PermissionAttached;
use Spatie\Permission\Events\PermissionDetached;
use Spatie\Permission\Events\RoleAttached;
use Spatie\Permission\Events\RoleDetached;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(EntityContext::class);
        $this->app->singleton(AuditLogger::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->registerAuditTrail();
    }

    /**
     * Every Eloquent create / update / delete / restore, and role & permission assignments, go to the
     * audit trail. Seeding and migrations run unaudited.
     */
    private function registerAuditTrail(): void
    {
        $audit = $this->app->make(AuditLogger::class);

        foreach (['created', 'updated', 'deleted', 'restored'] as $event) {
            Event::listen("eloquent.{$event}: *", function (string $name, array $payload) use ($audit, $event) {
                if (($payload[0] ?? null) instanceof Model) {
                    $audit->modelEvent($event, $payload[0]);
                }
            });
        }

        // Spatie passes ids, a model, or a collection of either.
        $names = function ($items, string $class): array {
            $items = $items instanceof Model ? [$items] : collect($items)->all();
            $ids = collect($items)->map(fn ($v) => $v instanceof Model ? $v->getKey() : $v)->filter()->values();

            return $ids->isEmpty() ? [] : $class::query()->whereIn('id', $ids)->orderBy('name')->pluck('name')->all();
        };
        Event::listen(RoleAttached::class, fn (RoleAttached $e) => $audit->relationEvent($e->model, 'roles', 'attached', $names($e->rolesOrIds, Role::class)));
        Event::listen(RoleDetached::class, fn (RoleDetached $e) => $audit->relationEvent($e->model, 'roles', 'detached', $names($e->rolesOrIds, Role::class)));
        Event::listen(PermissionAttached::class, fn (PermissionAttached $e) => $audit->relationEvent($e->model, 'permissions', 'attached', $names($e->permissionsOrIds, Permission::class)));
        Event::listen(PermissionDetached::class, fn (PermissionDetached $e) => $audit->relationEvent($e->model, 'permissions', 'detached', $names($e->permissionsOrIds, Permission::class)));

        // Each console command is its own batch; bulk setup commands are not user activity.
        Event::listen(CommandStarting::class, function (CommandStarting $e) use ($audit) {
            $audit->beginBatch();
            if (in_array($e->command, config('audit.skip_commands', []), true)) {
                $audit->disable();
            }
        });
    }
}
