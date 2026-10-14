<?php

namespace App\Support\Audit;

use App\Models\AuditTrail;
use App\Support\EntityContext;
use BackedEnum;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Records every Eloquent create / update / delete / restore with before and after values, plus
 * role & permission assignments (Spatie events) and write requests that changed no model (bulk
 * query updates). Rows written while handling one request or command share a batch id.
 *
 * Registered as a singleton; wired up in AppServiceProvider.
 */
class AuditLogger
{
    private ?string $batchId = null;

    private int $batchRows = 0;

    private bool $enabled;

    private ?Request $request = null;

    public function __construct()
    {
        $this->enabled = (bool) config('audit.enabled', true);
    }

    // -----------------------------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------------------------

    public function beginBatch(?Request $request = null): void
    {
        $this->batchId = (string) Str::uuid();
        $this->batchRows = 0;
        $this->request = $request;
    }

    public function batchId(): string
    {
        return $this->batchId ??= (string) Str::uuid();
    }

    public function disable(): void
    {
        $this->enabled = false;
    }

    public function enable(): void
    {
        $this->enabled = (bool) config('audit.enabled', true);
    }

    public function enabled(): bool
    {
        return $this->enabled;
    }

    /**
     * Run a callback without auditing (e.g. bulk maintenance).
     */
    public function withoutAuditing(callable $callback): mixed
    {
        $was = $this->enabled;
        $this->enabled = false;
        try {
            return $callback();
        } finally {
            $this->enabled = $was;
        }
    }

    // -----------------------------------------------------------------------------------------
    // Model events
    // -----------------------------------------------------------------------------------------

    public function modelEvent(string $event, Model $model): void
    {
        if (! $this->enabled || $this->excluded($model)) {
            return;
        }

        [$old, $new] = match ($event) {
            'created' => [null, $this->values($model, $model->getAttributes())],
            'updated' => $this->diff($model),
            'deleted' => [$this->values($model, $model->getRawOriginal() ?: $model->getAttributes()), null],
            'restored' => [['deleted_at' => 'deleted'], ['deleted_at' => null]],
            default => [null, null],
        };

        if ($event === 'updated' && $old === null && $new === null) {
            return; // only ignored attributes changed
        }

        $this->write([
            'event' => $event,
            'action' => match ($event) {
                'created' => 'create',
                'deleted' => 'delete',
                default => 'update',
            },
            'subject_type' => $model::class,
            'subject_id' => (string) $model->getKey(),
            'subject_label' => $this->label($model),
            'entity_id' => $this->entityIdFor($model),
            'old_values' => $old,
            'new_values' => $new,
        ]);
    }

    /**
     * Role / permission assignments (pivot tables don't fire model events).
     *
     * @param  'attached'|'detached'  $how
     * @param  array<int, string>  $names
     */
    public function relationEvent(Model $model, string $relation, string $how, array $names): void
    {
        if (! $this->enabled || $names === [] || $this->excluded($model)) {
            return;
        }

        $this->write([
            'event' => 'updated',
            'action' => 'update',
            'subject_type' => $model::class,
            'subject_id' => (string) $model->getKey(),
            'subject_label' => $this->label($model),
            'entity_id' => $this->entityIdFor($model),
            'old_values' => $how === 'detached' ? [$relation => $names] : null,
            'new_values' => $how === 'attached' ? [$relation => $names] : null,
            'description' => ucfirst($how).' '.$relation.': '.implode(', ', $names),
        ]);
    }

    // -----------------------------------------------------------------------------------------
    // Requests
    // -----------------------------------------------------------------------------------------

    /**
     * After a write request: if it changed nothing through Eloquent (bulk updates, external effects),
     * record the request itself so the action is still on the trail.
     */
    public function finishRequest(Request $request, Response $response): void
    {
        if (! $this->enabled || $this->batchRows > 0 || ! $request->user()) {
            return;
        }
        if (! in_array($request->getMethod(), ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
            return;
        }
        $route = $request->route()?->getName() ?? '';
        if ($route === '' || Str::is(config('audit.exclude_routes', []), $route)) {
            return;
        }
        // Failed or rejected (validation errors) requests changed nothing.
        if ($response->getStatusCode() >= 400 || ($request->hasSession() && $request->session()->has('errors'))) {
            return;
        }

        [$type, $id] = $this->routeSubject($request);

        $this->write([
            'event' => 'request',
            'action' => $this->actionFromRoute($route),
            'subject_type' => $type,
            'subject_id' => $id,
            'status_code' => $response->getStatusCode(),
            'request_payload' => $this->payload($request),
            'description' => Str::headline(Str::afterLast($route, '.')).' ('.$route.')',
        ]);
    }

    // -----------------------------------------------------------------------------------------

    /**
     * @param  array<string, mixed>  $row
     */
    private function write(array $row): void
    {
        $request = $this->request ?? (app()->bound('request') ? request() : null);
        $console = app()->runningInConsole() && ! app()->runningUnitTests();

        try {
            AuditTrail::query()->create([
                'user_id' => auth()->id(),
                'entity_id' => $row['entity_id'] ?? $this->contextEntityId(),
                'batch_id' => $this->batchId(),
                'source' => $console ? 'console' : 'web',
                'route_name' => $request?->route()?->getName(),
                'method' => $request && ! $console ? strtoupper($request->getMethod()) : null,
                'url' => $request && ! $console ? Str::limit($request->fullUrl(), 2040, '') : null,
                'ip_address' => $request && ! $console ? $request->ip() : null,
                'user_agent' => $request && ! $console ? $request->userAgent() : null,
                ...$row,
            ]);
            $this->batchRows++;
        } catch (Throwable $e) {
            // Auditing must never break the action being audited.
            report($e);
        }
    }

    private function excluded(Model $model): bool
    {
        foreach (config('audit.exclude_models', []) as $class) {
            if ($model instanceof $class) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array{0: ?array<string, mixed>, 1: ?array<string, mixed>}
     */
    private function diff(Model $model): array
    {
        $changes = Arr::except($model->getChanges(), config('audit.ignore_attributes', []));
        if ($changes === []) {
            return [null, null];
        }

        $old = [];
        foreach (array_keys($changes) as $key) {
            $old[$key] = $model->getRawOriginal($key);
        }

        return [$this->values($model, $old), $this->values($model, $changes)];
    }

    /**
     * Clean attribute values for storage: drop ignored keys, mask secrets, cap long strings.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function values(Model $model, array $attributes): array
    {
        $masked = array_merge(config('audit.masked_attributes', []), $model->getHidden());
        $max = (int) config('audit.max_value_length', 2000);
        $out = [];

        foreach (Arr::except($attributes, config('audit.ignore_attributes', [])) as $key => $value) {
            if (in_array($key, $masked, true)) {
                $out[$key] = $value === null ? null : '[hidden]';

                continue;
            }
            $out[$key] = match (true) {
                $value instanceof DateTimeInterface => $value->format('Y-m-d H:i:s'),
                $value instanceof BackedEnum => $value->value,
                is_string($value) && strlen($value) > $max => Str::limit($value, $max),
                default => $value,
            };
        }

        return $out;
    }

    /** "Journal Entry JE-2026-0012", "Employee Maria Santos" */
    private function label(Model $model): string
    {
        $type = Str::headline(class_basename($model));
        foreach (['entry_no', 'run_no', 'invoice_no', 'bill_no', 'employee_code', 'code', 'username', 'reference', 'form_code', 'title', 'name'] as $key) {
            $value = $model->getAttribute($key);
            if (is_scalar($value) && $value !== '') {
                $name = $key === 'employee_code' && $model->getAttribute('name') ? $value.' '.$model->getAttribute('name') : $value;

                return Str::limit($type.' '.$name, 250);
            }
        }

        return $type.' #'.$model->getKey();
    }

    private function entityIdFor(Model $model): ?int
    {
        $id = $model->getAttribute('entity_id');

        return is_numeric($id) ? (int) $id : $this->contextEntityId();
    }

    private function contextEntityId(): ?int
    {
        try {
            return app(EntityContext::class)->id();
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @return array{0: ?string, 1: ?string}
     */
    private function routeSubject(Request $request): array
    {
        foreach ($request->route()?->parameters() ?? [] as $param) {
            if ($param instanceof Model) {
                return [$param::class, (string) $param->getKey()];
            }
        }

        return [null, null];
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(Request $request): array
    {
        $payload = $request->except(config('audit.masked_request_fields', []));
        if ($request->files->count() > 0) {
            $payload['__files'] = array_keys($request->allFiles());
        }

        return Arr::wrap($payload);
    }

    private function actionFromRoute(string $route): string
    {
        return match (Str::afterLast($route, '.')) {
            'store' => 'create',
            'update' => 'update',
            'destroy' => 'delete',
            default => str_replace('-', '_', Str::snake(Str::afterLast($route, '.'))),
        };
    }
}
