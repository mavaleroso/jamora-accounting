<?php

namespace App\Http\Middleware;

use App\Models\AuditTrail;
use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Symfony\Component\HttpFoundation\Response;

class AuditTrailMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $this->captureUpdateContext($request);

        $response = $next($request);

        if (! $this->shouldLog($request, $response)) {
            return $response;
        }

        $this->logRequest($request);

        return $response;
    }

    private function shouldLog(Request $request, Response $response): bool
    {
        if (! $request->user()) {
            return false;
        }

        $routeName = $request->route()?->getName() ?? '';
        if ($routeName === '' || ! $this->isCrudRoute($routeName)) {
            return false;
        }

        if (str_starts_with($routeName, 'audit-trails.') || str_starts_with($routeName, 'chat.')) {
            return false;
        }

        if ($this->isAuthRoute($routeName)) {
            return false;
        }

        return $response->getStatusCode() < 500;
    }

    private function isCrudRoute(string $routeName): bool
    {
        return str_ends_with($routeName, '.store')
            || str_ends_with($routeName, '.update')
            || str_ends_with($routeName, '.destroy');
    }

    private function isAuthRoute(string $routeName): bool
    {
        return in_array($routeName, ['login.store', 'logout'], true)
            || str_starts_with($routeName, 'password.')
            || str_starts_with($routeName, 'two-factor.')
            || str_starts_with($routeName, 'verification.');
    }

    private function logRequest(Request $request): void
    {
        $route = $request->route();
        $routeName = $route?->getName() ?? '';
        $payload = $this->sanitizePayload($request);
        [$subjectType, $subjectId] = $this->extractSubject($route);
        $method = strtoupper($request->getMethod());
        $action = $this->actionFromRoute($routeName);

        if ($action === 'update') {
            $payload = $this->appendUpdateChanges($request, $payload);
        }

        AuditTrail::query()->create([
            'user_id' => $request->user()?->id,
            'action' => $action,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'route_name' => $routeName !== '' ? $routeName : null,
            'method' => $method,
            'url' => $request->fullUrl(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'request_payload' => $payload,
        ]);
    }

    private function captureUpdateContext(Request $request): void
    {
        if (! $request->user()) {
            return;
        }

        $routeName = $request->route()?->getName() ?? '';
        if (! str_ends_with($routeName, '.update')) {
            return;
        }

        $route = $request->route();
        if (! $route) {
            return;
        }

        foreach ($route->parameters() as $param) {
            if ($param instanceof Model) {
                $request->attributes->set('audit_update_context', [
                    'class' => $param::class,
                    'id' => $param->getKey(),
                    'original' => $param->getOriginal(),
                ]);
                break;
            }
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function appendUpdateChanges(Request $request, array $payload): array
    {
        $context = $request->attributes->get('audit_update_context');
        if (! is_array($context) || ! isset($context['class'], $context['id'], $context['original'])) {
            return $payload;
        }

        $modelClass = $context['class'];
        if (! is_string($modelClass) || ! class_exists($modelClass)) {
            return $payload;
        }

        $afterModel = $modelClass::query()->find($context['id']);
        if (! $afterModel) {
            return $payload;
        }

        $original = is_array($context['original']) ? $context['original'] : [];
        $changes = [];
        $maxFields = 50;

        foreach ($payload as $key => $value) {
            if (! is_string($key) || $key === '__has_files') {
                continue;
            }
            $before = $original[$key] ?? null;
            $after = $afterModel->getAttribute($key);

            $beforeComparable = is_array($before) ? json_encode($before) : $before;
            $afterComparable = is_array($after) ? json_encode($after) : $after;

            if ($beforeComparable !== $afterComparable) {
                $changes[$key] = [
                    'from' => $before,
                    'to' => $after,
                ];
            }

            if (count($changes) >= $maxFields) {
                break;
            }
        }

        if ($changes) {
            $payload['__changes'] = $changes;
        }

        return $payload;
    }

    /**
     * @return array{0: string|null, 1: string|null}
     */
    private function extractSubject($route): array
    {
        if (! $route) {
            return [null, null];
        }

        foreach ($route->parameters() as $param) {
            if ($param instanceof Model) {
                return [$param::class, (string) $param->getKey()];
            }
            if (is_scalar($param)) {
                return [null, (string) $param];
            }
        }

        return [null, null];
    }

    /**
     * @return array<string, mixed>
     */
    private function sanitizePayload(Request $request): array
    {
        $payload = $request->except([
            'password',
            'password_confirmation',
            'current_password',
            'new_password',
            'token',
            '_token',
        ]);

        if ($request->files->count() > 0) {
            $payload['__has_files'] = true;
        }

        return Arr::wrap($payload);
    }

    private function actionFromRoute(string $routeName): string
    {
        if (str_ends_with($routeName, '.store')) {
            return 'create';
        }

        if (str_ends_with($routeName, '.update')) {
            return 'update';
        }

        if (str_ends_with($routeName, '.destroy')) {
            return 'delete';
        }

        return 'unknown';
    }
}
