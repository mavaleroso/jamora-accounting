<?php

namespace App\Http\Middleware;

use App\Support\EntityContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetCurrentEntity
{
    public function __construct(protected EntityContext $entityContext) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user) {
            $entity = $this->entityContext->resolveForUser($user);

            if (! $entity && ! $request->routeIs('entities.switch', 'logout', 'login', 'password.*', 'verification.*')) {
                // Allow admins with no pivot yet to continue; seed will attach.
                if (! $user->hasRole('Admin') || $user->entities()->exists()) {
                    // Still proceed — Admin may need to attach entities.
                }
            }
        }

        return $next($request);
    }
}
